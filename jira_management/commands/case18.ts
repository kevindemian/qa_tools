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
import fs from 'fs';
import path from 'path';
import { ask, warn, info, printError, title, divider } from '../../shared/prompt';
import { llmPrompt } from '../../shared/llm-client';
import { sanitizeForLlm, sanitizeTerminal } from '../../shared/sanitize';
import type { CommandContext } from './context';
import { TestCaseArraySchema } from './case18.schema';
import { matchPreconditionByDualThreshold } from '../jira_link_manager';
import type { PreConditionSummary, TestCase, TestStep } from '../../shared/types';

async function handler(c: CommandContext): Promise<boolean | void> {
    const input = await gatherInput(c);
    if (!input) return;

    let preconditions: PreConditionSummary[] = [];
    try {
        preconditions = await c.linkManager.listPreconditions(input.project);
        info(`${preconditions.length} pre-conditions encontradas no projeto ${input.project}`);
    } catch (err: unknown) {
        warn('Não foi possível buscar pre-conditions: ' + (err as Error).message + ' — continuando sem contexto');
    }

    const userMsg = 'User Story:\n' + input.userStory + '\n\nAcceptance Criteria:\n' + input.acceptanceCriteria;
    const safeUserMsg = sanitizeForLlm(userMsg);

    title('Gerando testes com IA...');
    let testCases: TestCaseData[];
    try {
        testCases = await llmPrompt('fast', input.system, safeUserMsg, 'case18', undefined, TestCaseArraySchema);
    } catch (err: unknown) {
        printError('Falha ao gerar casos de teste com IA', err);
        return;
    }

    const { resolvedPreConditions, summariesToCreate } = resolvePreconditionMatches(testCases, preconditions);
    const createdKeys = await createMissingPreconditions(c.linkManager, input.project, summariesToCreate);
    const converted = convertTestCases(testCases, resolvedPreConditions, createdKeys);
    writeTestOutput(converted, summariesToCreate.length);
    c.pushHistory(
        'ai-generate-tests',
        `user story: ${input.userStory.slice(0, 60)} — ${converted.length} testes`,
        'ok',
    );
}

/** Ask user for story, criteria, and project; load prompt template.
 *  Returns null to abort if any required field is empty or template fails to load. */
async function gatherInput(c: CommandContext): Promise<{
    userStory: string;
    acceptanceCriteria: string;
    project: string;
    system: string;
} | null> {
    const userStory = await ask('História do usuário (user story)', {
        hint: 'descreva brevemente a funcionalidade',
    });
    if (!userStory.trim()) {
        warn('História vazia. Operação cancelada.');
        return null;
    }

    const acceptanceCriteria = await ask('Critérios de aceitação', {
        hint: 'liste os cenários esperados',
    });

    const project = c.ctx.project_name || (await ask('Projeto Jira', { hint: 'ex: ECSPOL' }));
    if (!project.trim()) {
        warn('Projeto vazio. Operação cancelada.');
        return null;
    }

    const templatePath = path.join(__dirname, '../../shared/prompts/user-story-to-tests.md');
    try {
        const system = fs.readFileSync(templatePath, 'utf8');
        return { userStory, acceptanceCriteria, project, system };
    } catch (err: unknown) {
        printError('Erro ao ler template de prompt', err);
        return null;
    }
}

/** Post-process LLM output: match each unique preCondition summary against all Jira PCs
 *  using matchPreconditionByDualThreshold().
 *
 *  Returns:
 *    - resolvedPreConditions: per test case, the final preConditions (reference for matched, create for unmatched)
 *    - summariesToCreate: summaries that had no match and must be created in Jira */
function resolvePreconditionMatches(
    testCases: TestCaseData[],
    allPCs: PreConditionSummary[],
): { resolvedPreConditions: TestCasePreCondition[][]; summariesToCreate: string[] } {
    const summaries = new Set<string>();
    for (const tc of testCases) {
        if (tc.preConditions) {
            for (const pc of tc.preConditions) {
                if (pc.summary) summaries.add(pc.summary.trim());
            }
        }
    }

    const matchMap = new Map<string, string>();
    const toCreate: string[] = [];
    for (const summary of summaries) {
        const result = matchPreconditionByDualThreshold(summary, allPCs);
        if (result.matchType !== 'create') {
            matchMap.set(summary, result.key);
        } else {
            toCreate.push(summary);
        }
    }

    const resolvedPreConditions: TestCasePreCondition[][] = testCases.map((tc) => {
        if (!tc.preConditions || tc.preConditions.length === 0) return [];
        return tc.preConditions.map((pc) => {
            const matched = pc.summary ? matchMap.get(pc.summary.trim()) : undefined;
            if (matched) {
                return { type: 'reference' as const, key: matched, summary: pc.summary };
            }
            return { type: 'create' as const, summary: pc.summary };
        });
    });

    return { resolvedPreConditions, summariesToCreate: toCreate };
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
            warn(`Falha ao criar pre-condition "${summary}": ${(err as Error).message}`);
        }
    }
    return createdKeys;
}

/** Write test cases JSON to disk and log summary to console. */
function writeTestOutput(converted: TestCase[], createdCount: number): void {
    const outDir = path.join(process.cwd(), 'reports', new Date().toISOString().slice(0, 10));
    fs.mkdirSync(outDir, { recursive: true });
    const outPath = path.join(outDir, 'llm-generated-tests.json');
    fs.writeFileSync(outPath, JSON.stringify(converted, null, 2), 'utf8');

    divider();
    info(`Testes gerados (${converted.length}) — salvos em ${outPath}:`);
    divider();
    info(sanitizeTerminal(JSON.stringify(converted, null, 2)));
    divider();

    if (createdCount > 0) {
        info(
            `${createdCount} pre-conditions foram criadas no Jira. ` +
                'Você pode agora importar os testes via menu 15 (Importar JSON).',
        );
    } else {
        info('Nenhuma pre-condition nova foi criada. Você pode importar os testes via menu 15 (Importar JSON).');
    }
}

interface TestCaseData {
    title: string;
    steps: string[];
    expectedResult: string;
    preConditions?: Array<{ type: string; key?: string; summary?: string }>;
}

interface TestCasePreCondition {
    type: 'reference' | 'create';
    key?: string;
    summary?: string;
}

function convertTestCases(
    llmOutput: TestCaseData[],
    resolvedPreConditions: TestCasePreCondition[][],
    createdKeys: Map<string, string>,
): TestCase[] {
    return llmOutput.map((item, idx) => {
        const steps: TestStep[] = item.steps.map((stepText: string) => ({
            fields: { Action: stepText },
        }));

        const pc = resolvedPreConditions[idx]?.[0];
        const precondition = resolvePrecondition(pc, createdKeys);

        return {
            title: item.title,
            description: '',
            steps,
            precondition: precondition || undefined,
        };
    });
}

function resolvePrecondition(
    pc: TestCasePreCondition | undefined,
    createdKeys: Map<string, string>,
): { type: 'inline' | 'reference'; value: string } | null {
    if (!pc) return null;

    if (pc.type === 'reference' && pc.key) {
        return { type: 'reference', value: pc.key };
    }

    if (pc.type === 'create' && pc.summary) {
        const newKey = createdKeys.get(pc.summary);
        if (newKey) {
            return { type: 'reference', value: newKey };
        }
        return { type: 'inline', value: pc.summary };
    }

    return null;
}

export default { handler };
