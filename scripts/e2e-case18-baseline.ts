/**
 * E2E harness — case18 AI suite generation vs ECSPOL-960 real baseline.
 *
 * This harness is a THIN WRAPPER that triggers REAL codebase functions.
 * Zero business logic — only orchestration of case18.ts exports.
 *
 * Exercises the COMPLETE user journey:
 *   1. gatherInput        → story + criteria + project
 *   2. listPreconditions  → fetch from Jira (real API)
 *   3. llmPrompt          → generate test cases via LLM
 *   4. resolvePreconditionMatches → cross-reference (real function)
 *   5. toGeneratedTestCases       → convert to evaluator shape (real function)
 *   6. evaluateCase18     → deterministic floor scoring (real function)
 *   7. convertTestCases   → convert to Jira import format (real function)
 *   8. writeTestOutput    → write import-compatible JSON (real function)
 *   9. writeQualityArtifacts → HTML eval report + coverage table (real function)
 *  10. recordAiGeneration  → persist generation record (real function)
 *
 * Usage: `npm run e2e:case18-baseline`
 * (requires LLM_PROVIDER + LLM_API_KEY + LLM_MODEL + Jira credentials in .env.local)
 */
import { ensureDotenv } from '../shared/env-loader.js';
import { rootLogger } from '../shared/logger.js';
import { llmPrompt } from '../shared/llm/llm-client.js';
import { formatErr } from '../shared/errors.js';
import { sanitizeForLlm } from '../shared/sanitize.js';
import { recordAiGeneration } from '../shared/quality/ai-feedback.js';
import { evaluateCase18 } from '../shared/quality/case18-evaluator.js';
import { ECSPOL960_BASELINE, ECSPOL960_STORY, extractCriteria } from '../shared/quality/case18-benchmarks.js';
import type { AiGenerationRecord } from '../shared/types.js';
import { TestCaseArraySchema } from '../jira_management/commands/case18.schema.js';
import {
    buildCorrectionsBlock,
    computePromptVersion,
    toGeneratedTestCases,
    resolvePreconditionMatches,
    convertTestCases,
    writeTestOutput,
    writeQualityArtifacts,
} from '../jira_management/commands/case18.js';

const MAX_GENERATION_ATTEMPTS = 3;

// ---- Jira real connection ----

async function listPreconditions(project: string): Promise<Array<{ key: string; summary: string }>> {
    try {
        const { default: JiraResource } = await import('../jira_management/jira_resource.js');
        const { default: JiraLinkManager } = await import('../jira_management/jira_link_manager.js');
        const { default: Config } = await import('../shared/config-accessor.js');

        const baseUrl = Config.get('jiraBaseUrl');
        const token = Config.get('jiraPersonalToken');
        const mode = Config.get('jiraMode') as 'server' | 'cloud' | undefined;

        if (!baseUrl || !token) {
            rootLogger.warn('e2e-case18: Jira credentials not configured — fetching preconditions skipped');
            return [];
        }

        const jiraResource = new JiraResource(token, baseUrl, mode);
        const linkManager = new JiraLinkManager(jiraResource);
        const preconditions = await linkManager.listPreconditions(project);
        rootLogger.info(`e2e-case18: ${preconditions.length} pre-conditions fetched from Jira project ${project}`);
        return preconditions;
    } catch (err: unknown) {
        rootLogger.warn(
            'e2e-case18: Failed to fetch preconditions from Jira: ' +
                formatErr(err) +
                ' — continuing without preconditions context',
        );
        return [];
    }
}

// ---- Prompt template ----

async function loadPromptTemplate(): Promise<string> {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const templatePath = path.join(import.meta.dirname, '../shared/prompts/user-story-to-tests.md');
    return fs.readFileSync(templatePath, 'utf8');
}

// ---- Comparison report ----

function printComparison(ai: ReturnType<typeof evaluateCase18>, baseline: ReturnType<typeof evaluateCase18>): string {
    const aiMetrics = ai.layers.deterministic.metrics;
    const baseMetrics = baseline.layers.deterministic.metrics;
    const lines: string[] = [];
    lines.push('## Comparação métrica-a-métrica (mesmo floor determinístico)');
    lines.push('');
    lines.push('| Métrica | Peso | AI | Baseline (humano) | Dif |');
    lines.push('|---|---|---|---|---|');
    for (const key of Object.keys(aiMetrics)) {
        const a = aiMetrics[key as keyof typeof aiMetrics];
        const b = baseMetrics[key as keyof typeof baseMetrics];
        const diff = Number.isFinite(a.score) && Number.isFinite(b.score) ? a.score - b.score : NaN;
        lines.push(
            `| ${key} | ${(a.weight * 100).toFixed(0)}% | ${a.score} | ${b.score} | ${Number.isFinite(diff) ? (diff > 0 ? '+' : '') + diff : '—'} |`,
        );
    }
    lines.push(
        `| **Total** | **100%** | **${ai.score} (${ai.grade})** | **${baseline.score} (${baseline.grade})** | ${ai.score - baseline.score} |`,
    );
    lines.push('');
    lines.push('### AI — falhas determinísticas');
    lines.push(ai.details.failed.length > 0 ? ai.details.failed.map((f) => `- ${f}`).join('\n') : '- nenhuma');
    lines.push('');
    lines.push('### Baseline — falhas determinísticas');
    lines.push(
        baseline.details.failed.length > 0 ? baseline.details.failed.map((f) => `- ${f}`).join('\n') : '- nenhuma',
    );
    lines.push('');
    lines.push(
        `**AI tests:** ${ai.layers.deterministic.details.totalTests} | **Baseline tests:** ${baseline.layers.deterministic.details.totalTests}`,
    );
    return lines.join('\n');
}

// ---- Main ----

async function main(): Promise<void> {
    ensureDotenv();

    const criteria = extractCriteria(ECSPOL960_STORY.description);
    const system = await loadPromptTemplate();
    const project = 'ECSPOL';

    console.log('=== E2E Case18 — AI suite vs ECSPOL-960 baseline ===\n');
    console.log('Prompt version: ' + computePromptVersion());
    console.log('Critérios extraídos: ' + criteria.length + ' chars');

    // Step 2: listPreconditions — REAL Jira fetch
    const preconditions = await listPreconditions(project);
    console.log(`${preconditions.length} pre-conditions encontradas no projeto ${project}\n`);

    const userMsg = sanitizeForLlm(
        'User Story:\n' + ECSPOL960_STORY.description + '\n\nAcceptance Criteria:\n' + criteria,
    );

    let generatedTestCases: ReturnType<typeof toGeneratedTestCases> = [];
    let evaluation: ReturnType<typeof evaluateCase18> | null = null;

    for (let attempt = 1; attempt <= MAX_GENERATION_ATTEMPTS; attempt++) {
        const systemPrompt = attempt > 1 && evaluation ? system + '\n\n' + buildCorrectionsBlock(evaluation) : system;

        console.log(`Tentativa ${attempt}/${MAX_GENERATION_ATTEMPTS} — gerando via LLM (tier: main)...`);

        let testCases;
        try {
            testCases = await llmPrompt({
                tier: 'main',
                system: systemPrompt,
                user: userMsg,
                callerId: 'case18-e2e',
                schema: TestCaseArraySchema,
            });
        } catch (err: unknown) {
            rootLogger.warn('e2e-case18: falha ao gerar com IA: ' + formatErr(err));
            console.log('Falha de geração: ' + formatErr(err));
            continue;
        }

        // Step 3-4: resolvePreconditionMatches — REAL function from case18.ts
        const resolved = resolvePreconditionMatches(testCases, preconditions);

        // Step 5: toGeneratedTestCases — REAL function from case18.ts
        generatedTestCases = toGeneratedTestCases(testCases, resolved.resolvedPreConditions, new Map());

        // Step 6: evaluateCase18 — REAL function
        evaluation = evaluateCase18(generatedTestCases, criteria);
        console.log(`  Score: ${evaluation.score}/100 — grade ${evaluation.grade} (${testCases.length} testes)`);

        if (resolved.summariesToCreate.length > 0) {
            console.log(`  Pre-conditions a criar: ${resolved.summariesToCreate.length}`);
        }

        const failedMetrics = Object.entries(evaluation.layers.deterministic.metrics).filter(
            ([, m]) => m.failed.length > 0,
        );

        if (failedMetrics.length === 0) {
            console.log('  Nenhuma métrica com falha — suíte aceita.\n');
            break;
        }

        console.log(`  Métricas com falha: ${failedMetrics.map(([k]) => k).join(', ')}`);

        if (attempt < MAX_GENERATION_ATTEMPTS) {
            console.log('  Regenerando com feedback das falhas...\n');
        } else {
            console.log('  Última tentativa — suíte aceita como está.\n');
        }
    }

    if (!evaluation || generatedTestCases.length === 0) {
        rootLogger.error('e2e-case18: nenhuma suíte gerada com sucesso');
        process.exitCode = 1;
        return;
    }

    // Baseline evaluation — REAL function
    const baselineEvaluation = evaluateCase18(ECSPOL960_BASELINE, criteria);
    console.log('=== Baseline (ECSPOL-960 humano) ===');
    console.log(
        `Score: ${baselineEvaluation.score}/100 — grade ${baselineEvaluation.grade} (${ECSPOL960_BASELINE.length} testes)\n`,
    );

    // Step 7: convertTestCases — REAL function from case18.ts
    const resolved = resolvePreconditionMatches(
        generatedTestCases.map((tc) => ({
            title: tc.title,
            steps: tc.steps,
            expectedResult: tc.expectedResult,
            preConditions: tc.preConditions,
        })),
        preconditions,
    );
    const converted = convertTestCases(
        generatedTestCases.map((tc) => ({
            title: tc.title,
            steps: tc.steps,
            expectedResult: tc.expectedResult,
            preConditions: tc.preConditions,
        })),
        resolved.resolvedPreConditions,
        new Map(),
    );

    // Step 8: writeTestOutput — REAL function from case18.ts
    writeTestOutput(converted, resolved.summariesToCreate.length);

    // Step 9: writeQualityArtifacts — REAL function from case18.ts
    writeQualityArtifacts(
        evaluation,
        generatedTestCases.map((tc) => ({
            title: tc.title,
            steps: tc.steps,
            expectedResult: tc.expectedResult,
            preConditions: tc.preConditions,
        })),
        criteria,
    );

    // Comparison report
    const comparisonMd = printComparison(evaluation, baselineEvaluation);
    console.log('\n' + comparisonMd);

    // Step 10: recordAiGeneration — REAL function
    const record: AiGenerationRecord = {
        id: crypto.randomUUID(),
        generatedAt: new Date().toISOString(),
        promptVersion: computePromptVersion(),
        userStory: ECSPOL960_STORY.description,
        acceptanceCriteria: criteria,
        generatedTests: generatedTestCases.map((tc) => ({
            title: tc.title,
            preConditions: (tc.preConditions ?? []).map((p) => p.summary || p.description || ''),
            stepCount: tc.steps.length,
        })),
        preconditionMatches: [],
        qualityScore: evaluation.score,
        qualityGrade: evaluation.grade,
        gateAction: 'created',
        attempt: MAX_GENERATION_ATTEMPTS,
    };
    recordAiGeneration(record);
    console.log('\nArtefatos salvos em reports/<data>/.');
}

main().catch((err: unknown) => {
    rootLogger.error('e2e-case18: erro não tratado: ' + formatErr(err));
    process.exitCode = 1;
});
