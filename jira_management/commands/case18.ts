/** AI test case generator from user stories (case18).
 *
 * Flow:
 *   1. fetch ALL pre-conditions from Jira (no filtering)
 *   2. main LLM generates test cases using user-story-to-tests.md prompt
 *      — NO pre-conditions injected into the prompt
 *      — LLM always uses { type: 'create', summary: '...' }
 *   3. matchPreconditionByDualThreshold() runs against ALL fetched PCs
 *      — matches found → resolved as reference
 *      — unmatched → create in Jira
 *   4. output JSON with resolved preConditions */
import { formatErr, LlmRateLimitError, LlmAuthError, LlmTimeoutError, LlmProviderError } from '../../shared/errors.js';
import { z } from '../../shared/validation/validation.js';
import { ImportJsonItemSchema } from '../csv-import-schema.js';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { formatDateISO } from '../../shared/date-utils.js';
import {
    ask,
    askMultiline,
    askConfirm,
    showSelect,
    warn,
    info,
    success,
    printError,
    title,
    divider,
} from '../../shared/ui/prompt.js';
import { rootLogger } from '../../shared/logger.js';
import { llmPrompt } from '../../shared/llm/llm-client.js';
import { sanitizeForLlm, sanitizeTerminal } from '../../shared/sanitize.js';
import { recordAiGeneration } from '../../shared/quality/ai-feedback.js';
import type { CommandContext } from './context.js';
import { TestCaseArraySchema } from './case18.schema.js';
import { matchPreconditionByDualThreshold } from '../jira_link_manager.js';
import type {
    AiGenerationRecord,
    AiQualityMetric,
    PreConditionSummary,
    TestCase,
    TestStep,
} from '../../shared/types.js';
import type { GeneratedTestCase } from '../../shared/quality/case18-types.js';
import { evaluateCase18, generateEvaluationReport } from '../../shared/quality/case18-evaluator.js';
import type { EvaluationResult } from '../../shared/quality/case18-types.js';
import {
    buildCoverageTable,
    coverageTableToHtml,
    coverageTableToJson,
} from '../../shared/quality/case18-coverage-table.js';
import { writeReport } from '../../shared/infra/temp-dir.js';
import { createTestsFromTestCases } from '../import-orchestrator.js';
import { pickIssueKeys, type IssuePickerDeps } from '../services/issue-picker.js';

/** Maximum number of LLM generation attempts in a single case18 run. Guards
 *  against unbounded cost when the user re-generates with feedback. */
export const CASE18_MAX_GENERATION_ATTEMPTS = 3;

/** Build the "CORRECTIONS REQUIRED" block for a re-generation attempt.
 *  Consumes the deterministic evaluation's per-metric `failed`/`warnings`
 *  arrays so the re-generation targets the exact defects (Rule 4 — root cause,
 *  not a blind retry). Returns an empty string when nothing actionable exists. */
export function buildCorrectionsBlock(evaluation: EvaluationResult): string {
    const corrections: string[] = [];
    for (const [metricKey, metric] of Object.entries(evaluation.layers.deterministic.metrics)) {
        if (metric.failed.length > 0) {
            corrections.push(`## ${metricKey}`);
            for (const f of metric.failed) {
                corrections.push(`- FAIL: ${f}`);
            }
        }
        if (metric.warnings.length > 0) {
            for (const w of metric.warnings) {
                corrections.push(`- WARN: ${w}`);
            }
        }
    }
    if (corrections.length === 0) return '';
    return (
        '## CORRECTIONS REQUIRED\n' +
        'The previous generation failed the deterministic quality evaluation. ' +
        'Revise the test suite to address EVERY item below. Do not repeat these defects.\n' +
        corrections.join('\n')
    );
}

/** Persist an AiGenerationRecord for the given attempt outcome. */
function recordAttempt(
    input: { userStory: string; acceptanceCriteria: string },
    testCases: TestCaseData[],
    preconditionMatches: Array<{ summary: string; matchType: string }>,
    evaluation: EvaluationResult,
    gateAction: 'created' | 'regenerated' | 'rejected',
    attempt: number,
): void {
    const generationRecord = _buildGenerationRecord(
        input,
        testCases,
        preconditionMatches,
        evaluation,
        gateAction,
        attempt,
    );
    recordAiGeneration(generationRecord);
}

export interface LlmFailureInfo {
    kind: 'rate-limit' | 'auth' | 'timeout' | 'provider' | 'unknown';
    message: string;
    hint: string;
}

/** Classify an LLM infrastructure failure into an actionable, recovery-oriented message.
 *
 *  UX3: a provider failure must not leave the user without a way forward. Each
 *  known failure kind carries an explicit recovery hint (retry guidance and, when
 *  applicable, an alternative model suggestion). Unknown errors are still surfaced
 *  explicitly (kind 'unknown') — never swallowed. */
export function describeLlmFailure(err: unknown): LlmFailureInfo {
    const raw = err instanceof Error ? err.message : String(err);
    if (
        err instanceof LlmRateLimitError ||
        /429|rate limit|too many requests|quota|tokens? per minute|TPM/i.test(raw)
    ) {
        return {
            kind: 'rate-limit',
            message: 'Limite de requisições do provedor LLM atingido (rate limit).',
            hint:
                'Aguarde alguns segundos e tente novamente — o cliente LLM aplica backoff e circuit-breaker automaticamente. ' +
                'Se o limite persistir, reduza a carga (menos itens por execução) ou troque o modelo em LLM_MODEL no .env.local.',
        };
    }
    if (err instanceof LlmAuthError || /401|403|unauthorized|invalid api key|api key missing|auth/i.test(raw)) {
        return {
            kind: 'auth',
            message: 'Falha de autenticação no provedor LLM.',
            hint:
                'Verifique a API key em LLM_API_KEY / LLM_BASE_URL no .env.local (ou via /setup). ' +
                'Um token inválido ou expirado impede todas as chamadas.',
        };
    }
    if (err instanceof LlmTimeoutError || /timeout|timed out|ETIMEDOUT|abort|network|econn/i.test(raw)) {
        return {
            kind: 'timeout',
            message: 'O provedor LLM não respondeu a tempo (timeout/erro de rede).',
            hint:
                'Verifique sua conexão e a acessibilidade de LLM_BASE_URL. ' +
                'Tente novamente; se persistir, use um modelo alternativo (LLM_MODEL) ou provedor com menor latência.',
        };
    }
    if (
        err instanceof LlmProviderError ||
        /all llm providers? failed|provider.*fail|\b5\d\d\b|server error|service unavailable|internal error/i.test(raw)
    ) {
        return {
            kind: 'provider',
            message: 'O provedor LLM está indisponível ou retornou erro.',
            hint:
                'Confira LLM_PROVIDER / LLM_MODEL / LLM_BASE_URL no .env.local. ' +
                'Sugestão: troque para um modelo alternativo (ex.: outro LLM_MODEL no mesmo provedor) e reexecute.',
        };
    }
    return {
        kind: 'unknown',
        message: 'Falha ao gerar casos de teste com IA',
        hint: 'Verifique os logs acima. Se o erro persistir, revise sua configuração e tente novamente.',
    };
}

async function handler(c: CommandContext): Promise<boolean | void> {
    const input = await gatherInput(c);
    if (!input) return;

    let preconditions: PreConditionSummary[] = [];
    try {
        preconditions = await c.linkManager.listPreconditions(input.project);
        info(`${preconditions.length} pre-conditions encontradas no projeto ${input.project}`);
    } catch (err: unknown) {
        rootLogger.error('Failed to fetch pre-conditions: ' + formatErr(err));
        warn('Não foi possível buscar pre-conditions: ' + formatErr(err) + ' — continuando sem contexto');
    }

    const userMsg = 'User Story:\n' + input.userStory + '\n\nAcceptance Criteria:\n' + input.acceptanceCriteria;
    const safeUserMsg = sanitizeForLlm(userMsg);

    let testCases: TestCaseData[];
    let resolvedPreConditions: TestCasePreCondition[][] = [];
    let summariesToCreate: string[] = [];
    let preconditionMatches: Array<{ summary: string; matchType: string }> = [];
    let evaluation: EvaluationResult | null = null;

    for (let attempt = 1; attempt <= CASE18_MAX_GENERATION_ATTEMPTS; attempt++) {
        title(`Gerando testes com IA (tentativa ${attempt}/${CASE18_MAX_GENERATION_ATTEMPTS})...`);

        const system =
            attempt > 1 && evaluation ? input.system + '\n\n' + buildCorrectionsBlock(evaluation) : input.system;

        try {
            testCases = await llmPrompt({
                tier: 'main',
                system,
                user: safeUserMsg,
                callerId: 'case18',
                schema: TestCaseArraySchema,
            });
        } catch (err: unknown) {
            rootLogger.warn('case18: Falha ao gerar casos de teste com IA: ' + formatErr(err));
            const info = describeLlmFailure(err);
            printError(info.message, err);
            warn('Recuperação: ' + info.hint);
            return;
        }

        const resolved = resolvePreconditionMatches(testCases, preconditions);
        resolvedPreConditions = resolved.resolvedPreConditions;
        summariesToCreate = resolved.summariesToCreate;
        preconditionMatches = resolved.preconditionMatches;

        // Layer 1 (deterministic floor): evaluate quality of the generated suite.
        evaluation = evaluateCase18(
            toGeneratedTestCases(testCases, resolvedPreConditions, new Map()),
            input.acceptanceCriteria,
        );
        displayQualityScore(evaluation);
        if (summariesToCreate.length > 0) {
            info(`${summariesToCreate.length} pre-condition(s) a criar no Jira:`);
            for (const s of summariesToCreate) {
                info(`  - ${s}`);
            }
        }

        const isLastAttempt = attempt >= CASE18_MAX_GENERATION_ATTEMPTS;
        const gateChoices = [
            { name: 'Criar pre-conditions no Jira e gerar a suíte', value: 'create' },
            ...(isLastAttempt ? [] : [{ name: 'Re-gerar com feedback da avaliação', value: 'regenerate' as const }]),
            { name: 'Rejeitar e abortar', value: 'reject' },
        ];
        const gateChoice = await showSelect(
            `Qualidade avaliada: ${evaluation.score}/100 (grade ${evaluation.grade}). Como prosseguir?`,
            gateChoices,
        );

        if (gateChoice === 'regenerate') {
            recordAttempt(input, testCases, preconditionMatches, evaluation, 'regenerated', attempt);
            warn('Regenerando com feedback da avaliação determinística...');
            continue;
        }

        if (gateChoice === 'reject') {
            recordAttempt(input, testCases, preconditionMatches, evaluation, 'rejected', attempt);
            warn('Geração rejeitada. Nenhuma pre-condition foi criada no Jira.');
            c.pushHistory(
                'ai-generate-tests',
                `user story: ${input.userStory.slice(0, 60)} — rejeitado pelo usuário (${evaluation.grade})`,
                'error',
            );
            return;
        }

        if (gateChoice !== 'create') {
            recordAttempt(input, testCases, preconditionMatches, evaluation, 'rejected', attempt);
            warn(`Decisão de gate não reconhecida ("${String(gateChoice)}"). Geração abortada sem criar no Jira.`);
            return;
        }

        const createdKeys = await createMissingPreconditions(c.linkManager, input.project, summariesToCreate);
        const converted = convertTestCases(testCases, resolvedPreConditions, createdKeys);

        recordAttempt(input, testCases, preconditionMatches, evaluation, 'created', attempt);
        const outPath = writeTestOutput(converted, summariesToCreate.length);
        writeQualityArtifacts(evaluation, testCases, input.acceptanceCriteria);
        c.pushHistory(
            'ai-generate-tests',
            `user story: ${input.userStory.slice(0, 60)} — ${converted.length} testes (${evaluation.grade})`,
            'ok',
        );

        await offerCreateAndLink(c, converted, outPath, input.project);
        return;
    }
}

/** Ask user for story, criteria, and project; load prompt template.
 *  Returns null to abort if any required field is empty or template fails to load. */
async function gatherInput(c: CommandContext): Promise<{
    userStory: string;
    acceptanceCriteria: string;
    project: string;
    system: string;
} | null> {
    const inputMethod = await showSelect('Como deseja fornecer a user story?', [
        { name: 'Buscar pelo ID do Jira', value: 'jira' },
        { name: 'Digitar manualmente', value: 'manual' },
    ]);

    const userStory =
        inputMethod === 'jira'
            ? await fetchUserStoryFromJira(c)
            : await askMultiline('História do usuário (user story)');

    if (!userStory.trim()) {
        warn('História vazia. Operação cancelada.');
        return null;
    }

    const acceptanceCriteria = await askMultiline('Critérios de aceitação');

    if (!acceptanceCriteria.trim()) {
        warn('Critérios de aceitação vazios. Operação cancelada.');
        return null;
    }

    const project = c.ctx.project_name || (await ask('Projeto Jira', { hint: 'ex: ECSPOL' }));
    if (!project.trim()) {
        warn('Projeto vazio. Operação cancelada.');
        return null;
    }

    const templatePath = path.join(import.meta.dirname, '../../shared/prompts/user-story-to-tests.md');
    try {
        const system = fs.readFileSync(templatePath, 'utf8');
        return { userStory, acceptanceCriteria, project, system };
    } catch (err: unknown) {
        rootLogger.warn('case18: Erro ao ler template de prompt: ' + formatErr(err));
        printError('Erro ao ler template de prompt', err);
        return null;
    }
}

/** Fetch user story description from a Jira issue by ID.
 *  Validates ID format, fetches issue, and previews description for confirmation. */
async function fetchUserStoryFromJira(c: CommandContext): Promise<string> {
    const issueId = await ask('ID do Jira (ex: PROJ-123)');
    if (!issueId.trim()) {
        warn('ID vazio. Operação cancelada.');
        return '';
    }

    const idPattern = /^[A-Z]+-\d+$/i;
    if (!idPattern.test(issueId.trim())) {
        warn('Formato de ID inválido. Use o formato PROJ-123.');
        return '';
    }

    try {
        const issue = await c.jiraResource.getJiraResource<{
            fields?: { description?: string; summary?: string };
        }>(`issue/${issueId.trim()}?fields=description,summary`);

        const description = issue.fields?.description ? issue.fields.description : '';
        if (!description.trim()) {
            warn('Issue sem descrição. Informe a user story manualmente.');
            const fallback = await askMultiline('História do usuário (user story)');
            return fallback;
        }

        const preview = description.length > 500 ? description.slice(0, 500) + '...' : description;
        info(`\n=== Pré-visualização de ${issueId.trim()} ===\n${preview}\n`);

        const useDescription = await askConfirm('Usar esta descrição?');
        if (!useDescription) {
            const fallback = await askMultiline('História do usuário (user story)');
            return fallback;
        }

        return description;
    } catch (err: unknown) {
        warn(`Falha ao buscar issue ${issueId.trim()}: ${formatErr(err)}`);
        info('Informe a user story manualmente.');
        return askMultiline('História do usuário (user story)');
    }
}

/** Post-process LLM output: match each unique preCondition summary against all Jira PCs
 *  using matchPreconditionByDualThreshold().
 *
 *  Returns:
 *    - resolvedPreConditions: per test case, the final preConditions (reference for matched, create for unmatched)
 *    - summariesToCreate: summaries that had no match and must be created in Jira */
export function resolvePreconditionMatches(
    testCases: TestCaseData[],
    allPCs: PreConditionSummary[],
): {
    resolvedPreConditions: TestCasePreCondition[][];
    summariesToCreate: string[];
    preconditionMatches: Array<{ summary: string; matchType: string }>;
} {
    const summaries = new Set<string>();
    for (const tc of testCases) {
        if (tc.preConditions) {
            for (const pc of tc.preConditions) {
                const text = pc.summary || (pc as { description?: string }).description;
                if (text) summaries.add(text.trim());
            }
        }
    }

    const matchMap = new Map<string, string>();
    const toCreate: string[] = [];
    const preconditionMatches: Array<{ summary: string; matchType: string }> = [];
    for (const summary of summaries) {
        const result = matchPreconditionByDualThreshold(summary, allPCs);
        preconditionMatches.push({ summary, matchType: result.matchType });
        if (result.matchType !== 'create') {
            matchMap.set(summary, result.key);
        } else {
            toCreate.push(summary);
        }
    }

    const resolvedPreConditions: TestCasePreCondition[][] = testCases.map((tc) => {
        if (!tc.preConditions || tc.preConditions.length === 0) return [];
        return tc.preConditions.map((pc) => {
            const text = pc.summary || pc.description;
            const matched = text ? matchMap.get(text.trim()) : undefined;
            if (matched) {
                return {
                    type: 'reference' as const,
                    key: matched,
                    ...(text ? { summary: text } : {}),
                };
            }
            return { type: 'create' as const, ...(text ? { summary: text } : {}) };
        });
    });

    return { resolvedPreConditions, summariesToCreate: toCreate, preconditionMatches };
}

/** Execute Jira API calls to create each unmatched pre-condition. */
async function createMissingPreconditions(
    linkManager: { createPrecondition: (project: string, summary: string) => Promise<string> },
    project: string,
    summariesToCreate: string[],
): Promise<Map<string, string>> {
    const createdKeys = new Map<string, string>();
    if (summariesToCreate.length === 0) return createdKeys;

    title('Criando novas pre-conditions no Jira...');
    for (const summary of summariesToCreate) {
        try {
            const newKey = await linkManager.createPrecondition(project, summary);
            createdKeys.set(summary, newKey);
            info(`Pre-condition criada: ${newKey} — "${summary}"`);
        } catch (err: unknown) {
            warn(`Falha ao criar pre-condition "${summary}": ${formatErr(err)}`);
        }
    }
    return createdKeys;
}

/** Build the AI generation record for logging/metrics. */
function _buildGenerationRecord(
    input: { userStory: string; acceptanceCriteria: string },
    testCases: TestCaseData[],
    preconditionMatches: Array<{ summary: string; matchType: string }>,
    evaluation?: EvaluationResult,
    gateAction?: 'created' | 'regenerated' | 'rejected',
    attempt?: number,
): AiGenerationRecord {
    const record: AiGenerationRecord = {
        id: crypto.randomUUID(),
        generatedAt: new Date().toISOString(),
        promptVersion: resolvePromptVersion(),
        userStory: input.userStory,
        acceptanceCriteria: input.acceptanceCriteria,
        generatedTests: testCases.map((tc) => ({
            title: tc.title,
            preConditions: tc.preConditions?.map((p) => p.summary || p.description || '') || [],
            stepCount: tc.steps.length,
        })),
        preconditionMatches,
    };
    if (evaluation && Number.isFinite(evaluation.score)) {
        record.qualityScore = evaluation.score;
        record.qualityGrade = evaluation.grade;
        const qualityMetrics: Record<string, AiQualityMetric> = {};
        for (const [metricKey, metric] of Object.entries(evaluation.layers.deterministic.metrics)) {
            qualityMetrics[metricKey] = {
                score: metric.score,
                weight: metric.weight,
                failed: metric.failed,
                warnings: metric.warnings,
            };
        }
        record.qualityMetrics = qualityMetrics;
    }
    if (gateAction) record.gateAction = gateAction;
    if (attempt !== undefined) record.attempt = attempt;
    return record;
}

/** Display the deterministic quality score to the user with failed metrics. */
function displayQualityScore(evaluation: EvaluationResult): void {
    divider();
    info(`Qualidade da geração (Camada 1 determinística): ${evaluation.score}/100 — grade ${evaluation.grade}`);
    const failedMetrics = Object.entries(evaluation.layers.deterministic.metrics).filter(
        ([, m]) => m.failed.length > 0,
    );
    if (failedMetrics.length > 0) {
        warn('Métricas com falha:');
        for (const [key, m] of failedMetrics) {
            info(`  - ${key}: ${m.failed.slice(0, 2).join('; ')}`);
        }
    } else {
        info('Nenhuma métrica com falha detectada.');
    }
    divider();
}

/** Write the evaluation report (HTML) and coverage table (JSON+HTML) to
 *  reports/<date>/ for auditability. Failures are logged explicitly, never
 *  silently swallowed (Rule 25). */
export function writeQualityArtifacts(
    evaluation: EvaluationResult,
    testCases: TestCaseData[],
    acceptanceCriteria: string,
): void {
    try {
        writeReport('case18-quality-evaluation.html', generateEvaluationReport(evaluation));
    } catch (err: unknown) {
        rootLogger.warn('case18: Falha ao salvar relatório de qualidade: ' + formatErr(err));
    }

    try {
        const generated = toGeneratedTestCases(testCases, [], new Map());
        const table = buildCoverageTable(generated, acceptanceCriteria, resolvePromptVersion());
        writeReport('case18-coverage-table.json', coverageTableToJson(table));
        writeReport('case18-coverage-table.html', coverageTableToHtml(table));
    } catch (err: unknown) {
        rootLogger.warn('case18: Falha ao salvar tabela de cobertura: ' + formatErr(err));
    }
}

/** Compute a content hash of the prompt template as the prompt version.
 *  Any edit to the prompt file yields a new version automatically.
 *  Throws explicitly when the template cannot be read — the template is a
 *  bundled asset and `gatherInput` already read it successfully before this
 *  is reached, so a read failure here is a genuine infrastructure defect and
 *  must not be masked as real data (see `resolvePromptVersion`). */
export function computePromptVersion(): string {
    const templatePath = path.join(import.meta.dirname, '../../shared/prompts/user-story-to-tests.md');
    const content = fs.readFileSync(templatePath, 'utf8');
    return 'v' + crypto.createHash('sha256').update(content).digest('hex').slice(0, 10);
}

/** Resolve the prompt version for persistence, recovering from infra failures
 *  instead of hard-failing the whole flow.
 *
 *  On failure: logs the error explicitly, surfaces actionable recovery options,
 *  and returns `'unreadable'` — a value that is explicitly NOT a real version
 *  (consumers can distinguish it from `v<hash>`). Never returns a value that
 *  looks like a real prompt version when the template could not be read. */
export function resolvePromptVersion(): string {
    try {
        return computePromptVersion();
    } catch (err: unknown) {
        rootLogger.error('case18: Não foi possível ler o template do prompt: ' + formatErr(err));
        warn(
            'Não foi possível calcular a versão do prompt (template ausente ou ilegível). ' +
                'O registro será salvo com promptVersion="unreadable". ' +
                'Recuperação: restaure shared/prompts/user-story-to-tests.md (git checkout -- <arquivo> ' +
                'ou reinstale o pacote) e reexecute.',
        );
        return 'unreadable';
    }
}

/** Write test cases JSON to disk and log summary to console.
 *  The file is serialized in the import-compatible format (ImportJsonItemSchema) so
 *  that `parseJsonFile` (menu 15) can re-import it without data loss.
 *  Returns the absolute path written so callers can reuse it (case18 create+link). */
export function writeTestOutput(converted: TestCase[], createdCount: number): string {
    const outDir = path.join(process.cwd(), 'reports', formatDateISO());
    fs.mkdirSync(path.resolve(outDir), { recursive: true });
    const outPath = path.join(outDir, 'llm-generated-tests.json');
    const serialized = serializeForImport(converted);
    fs.writeFileSync(path.resolve(outPath), JSON.stringify(serialized, null, 2), 'utf8');

    divider();
    info(`Testes gerados (${serialized.length}) — salvos em ${outPath}:`);
    divider();
    for (const tc of serialized) {
        const stepCount = Array.isArray(tc.steps) ? tc.steps.length : 0;
        const pre = tc.precondition
            ? Array.isArray(tc.precondition)
                ? tc.precondition.length + ' pre-condition(s)'
                : '1 pre-condition'
            : 'sem pre-condition';
        info('  • ' + sanitizeTerminal(tc.title) + ' (' + stepCount + ' step(s), ' + pre + ')');
    }
    divider();

    if (createdCount > 0) {
        info(
            `${createdCount} pre-conditions foram criadas no Jira. ` +
                'Você pode agora importar os testes via menu 15 (Importar JSON).',
        );
    } else {
        info('Nenhuma pre-condition nova foi criada. Você pode importar os testes via menu 15 (Importar JSON).');
    }
    return outPath;
}

/** Optional post-generation step (§6): create the generated tests in Jira and
 *  link them to the origin user story with the correct Test Coverage direction.
 *  Requires explicit user confirmation (askConfirm) — never automatic. */
async function offerCreateAndLink(
    c: CommandContext,
    converted: TestCase[],
    outPath: string,
    project: string,
): Promise<void> {
    const proceed = await askConfirm('Deseja criar estes testes no Jira e vinculá-los à user story de origem?', false);
    if (!proceed) {
        info('Testes NÃO criados no Jira. JSON salvo para importação via menu 15.');
        return;
    }

    const result = await createTestsFromTestCases({
        tests: converted,
        jiraResource: c.jiraResource,
        jiraResourceXray: c.jiraResourceXray,
        linkManager: c.linkManager,
        linkManagerXray: c.linkManagerXray,
        project_name: project,
        base_url: c.base_url,
        sessionLog: c.sessionLog,
        onBusy: (busy: boolean) => {
            c.ctx.isBusy = busy;
        },
        sourcePath: outPath,
        sourceType: 'json',
        jiraLabels: [],
    });
    if (!result || result.inMemoryTasksId.length === 0) {
        warn('Nenhum teste foi criado no Jira. Verifique os logs anteriores.');
        return;
    }

    const createdTestKeys = result.inMemoryTasksId;
    info('Testes criados no Jira: ' + createdTestKeys.join(', '));

    const deps: IssuePickerDeps = {
        getIssue: (key: string) =>
            c.jiraResource.getJiraResource<{
                key: string;
                fields?: { summary?: string; issuetype?: { name?: string } };
            }>('issue/' + key + '?fields=summary,issuetype'),
        ask,
        askConfirm,
        warn,
        info,
    };
    const usKeys = await pickIssueKeys(deps, { confirmLabel: 'Test Coverage' });
    if (!usKeys || usKeys.length === 0) {
        warn('Nenhuma user story de origem selecionada. Testes criados sem vínculo à US.');
        return;
    }

    const usKey = usKeys[0];
    if (!usKey) {
        warn('Nenhuma user story de origem selecionada. Testes criados sem vínculo à US.');
        return;
    }

    const linkResult = await c.linkManager.linkTestsToRequirement(usKey, createdTestKeys);
    if (linkResult.created > 0) {
        success(
            `Test Coverage criado: ${createdTestKeys.length} teste(s) vinculado(s) a ${usKey} ` +
                `(${linkResult.created} criado(s), ${linkResult.skipped} já existente(s)).`,
        );
    }
    if (linkResult.failed.length > 0) {
        warn('Falha ao vincular teste(s): ' + linkResult.failed.join(', '));
    }
    if (linkResult.missing.length > 0) {
        warn('Teste(s) não encontrado(s) no Jira (chave inexistente): ' + linkResult.missing.join(', '));
    }
}

/** Import-compatible JSON item (flat steps, precondition as string | string[]). */
type ImportJsonItem = z.infer<typeof ImportJsonItemSchema>;

/** Serialize `TestCase[]` into the import-compatible JSON format.
 *
 * The import pipeline (`parseJsonFile` → `_mapJsonItems`) expects flat steps
 * `{ Action, Data, 'Expected Result' }` and `precondition: string | string[]`.
 * `convertTestCases()` produces the internal Xray shape (`steps[].fields` and
 * `precondition: [{type, value}]`). This serializer converts the internal shape
 * back to the import format so the round-trip case18 → menu 15 is lossless.
 *
 * References are emitted as precondition keys (e.g. `PC-NEW-1`); inline values
 * are emitted as their text. `isPreconditionKey` reclassifies keys as references
 * on import, so the type is preserved. */
export function serializeForImport(tests: TestCase[]): ImportJsonItem[] {
    return tests.map((tc) => {
        const steps = tc.steps.map((s) => ({
            ...(s.fields.Action !== undefined ? { Action: s.fields.Action } : {}),
            ...(s.fields.Data !== undefined ? { Data: s.fields.Data } : {}),
            ...(s.fields['Expected Result'] !== undefined ? { 'Expected Result': s.fields['Expected Result'] } : {}),
        }));
        const precondition = tc.precondition ? tc.precondition.map((p) => p.value) : undefined;
        return {
            title: tc.title,
            description: tc.description ?? '',
            steps,
            ...(precondition && precondition.length > 0 ? { precondition } : {}),
            ...(tc.environment ? { environment: tc.environment } : {}),
            ...(tc.components ? { components: tc.components } : {}),
            ...(tc.priority ? { priority: tc.priority } : {}),
            ...(tc.coverage && tc.coverage.length > 0 ? { coverage: tc.coverage } : {}),
            ...(tc.evidence && tc.evidence.length > 0 ? { evidence: tc.evidence } : {}),
        };
    });
}

interface TestCaseData {
    title: string;
    steps: string[];
    expectedResult: string;
    preConditions?:
        | Array<{
              type: string;
              key?: string | undefined;
              summary?: string | undefined;
              description?: string | undefined;
          }>
        | undefined;
    coverage?: Array<{ criterionId: string; criterionText: string }> | undefined;
    evidence?: string[] | undefined;
    environment?: string | undefined;
    components?: string[] | undefined;
    priority?: string | undefined;
}

interface TestCasePreCondition {
    type: 'reference' | 'create';
    key?: string;
    summary?: string;
}

export function convertTestCases(
    llmOutput: TestCaseData[],
    resolvedPreConditions: TestCasePreCondition[][],
    createdKeys: Map<string, string>,
): TestCase[] {
    return llmOutput.map((item, idx) => {
        const steps: TestStep[] = item.steps.map((stepText: string, stepIdx: number) => {
            const fields: TestStep['fields'] = { Action: stepText };
            const isLastStep = stepIdx === item.steps.length - 1;
            if (isLastStep && item.expectedResult) {
                fields['Expected Result'] = item.expectedResult;
            }
            return { fields };
        });

        const pcs = (Reflect.get(resolvedPreConditions, idx) as TestCasePreCondition[] | undefined) ?? [];
        const precondition = pcs.flatMap((entry) => resolvePrecondition(entry, createdKeys));

        return {
            title: item.title,
            description: '',
            steps,
            ...(precondition.length > 0 ? { precondition } : {}),
            ...(item.environment ? { environment: item.environment } : {}),
            ...(item.components ? { components: item.components } : {}),
            ...(item.priority ? { priority: item.priority } : {}),
            ...(item.coverage && item.coverage.length > 0 ? { coverage: item.coverage } : {}),
            ...(item.evidence && item.evidence.length > 0 ? { evidence: item.evidence } : {}),
        };
    });
}

function resolvePrecondition(
    pc: TestCasePreCondition | undefined,
    createdKeys: Map<string, string>,
): Array<{ type: 'inline' | 'reference'; value: string }> {
    if (!pc) return [];

    if (pc.type === 'reference' && pc.key) {
        return [{ type: 'reference', value: pc.key }];
    }

    if (pc.type === 'create' && pc.summary) {
        const newKey = createdKeys.get(pc.summary);
        if (newKey) {
            return [{ type: 'reference', value: newKey }];
        }
        return [{ type: 'inline', value: pc.summary }];
    }

    return [];
}

/** Convert LLM output into the evaluator's input shape (`GeneratedTestCase`),
 *  preserving the coverage/evidence fields the schema now declares. */
export function toGeneratedTestCases(
    llmOutput: TestCaseData[],
    resolvedPreConditions: TestCasePreCondition[][],
    createdKeys: Map<string, string>,
): GeneratedTestCase[] {
    return llmOutput.map((item, idx) => {
        const pcs = (Reflect.get(resolvedPreConditions, idx) as TestCasePreCondition[] | undefined) ?? [];
        const preConditions = pcs.map((pc) => {
            const entry = resolvePrecondition(pc, createdKeys)[0];
            const description = entry?.value ?? pc.summary;
            return {
                type: entry?.type ?? 'inline',
                ...(description ? { description } : {}),
            };
        });
        return {
            title: item.title,
            steps: item.steps,
            expectedResult: item.expectedResult,
            ...(preConditions.length > 0 ? { preConditions } : {}),
            ...(item.coverage ? { coverage: item.coverage } : {}),
            ...(item.evidence ? { evidence: item.evidence } : {}),
        };
    });
}

export default { handler };
