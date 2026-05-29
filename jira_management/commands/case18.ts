import fs from 'fs';
import path from 'path';
import { ask, warn, info, printError, title, divider } from '../../shared/prompt';
import { llmPrompt } from '../../shared/llm-client';
import { sanitizeForLlm, sanitizeTerminal } from '../../shared/sanitize';
import type { CommandContext } from './context';
import { TestCaseArraySchema } from './case18.schema';
import { matchPreconditionByTokenOverlap } from '../jira_link_manager';
import type { PreConditionSummary, PreConditionMatchResult, TestStep, TestCase } from '../../shared/types';

const PRECONDITION_FILTER_THRESHOLD = 10;

async function handler(c: CommandContext): Promise<boolean | void> {
    const userStory = await ask('História do usuário (user story)', {
        hint: 'descreva brevemente a funcionalidade',
    });
    if (!userStory.trim()) {
        warn('História vazia. Operação cancelada.');
        return;
    }

    const acceptanceCriteria = await ask('Critérios de aceitação', {
        hint: 'liste os cenários esperados',
    });

    const project = c.ctx.project_name || (await ask('Projeto Jira', { hint: 'ex: ECSPOL' }));
    if (!project.trim()) {
        warn('Projeto vazio. Operação cancelada.');
        return;
    }

    const templatePath = path.join(__dirname, '../../shared/prompts/user-story-to-tests.md');
    let system: string;
    try {
        system = fs.readFileSync(templatePath, 'utf8');
    } catch (err: unknown) {
        printError('Erro ao ler template de prompt', err);
        return;
    }

    let preconditions: PreConditionSummary[] = [];
    try {
        preconditions = await c.linkManager.listPreconditions(project);
        info(`${preconditions.length} pre-conditions encontradas no projeto ${project}`);
    } catch (err: unknown) {
        warn('Não foi possível buscar pre-conditions: ' + (err as Error).message + ' — continuando sem contexto');
    }

    let matchedPreconditions: PreConditionMatchResult[] = [];
    const preconditionsToCreate: PreConditionMatchResult[] = [];

    if (preconditions.length > PRECONDITION_FILTER_THRESHOLD) {
        title('Analisando pre-conditions necessárias...');
        const filterPrompt =
            'Given this user story, list 3-5 pre-conditions that are required. ' +
            'Return ONLY a JSON array of strings, nothing else.\n\n' +
            'User Story:\n' +
            userStory +
            '\n\nAcceptance Criteria:\n' +
            acceptanceCriteria;
        let neededDescriptions: string[];
        try {
            const raw = await llmPrompt('fast', '', filterPrompt, 'case18-filter', undefined, undefined);
            const parsed = JSON.parse(typeof raw === 'string' ? raw : JSON.stringify(raw));
            neededDescriptions = Array.isArray(parsed) ? parsed.map(String) : [String(parsed)];
        } catch {
            warn('Falha ao extrair pre-conditions via LLM — usando toda a lista');
            neededDescriptions = [];
        }

        if (neededDescriptions.length > 0) {
            for (const desc of neededDescriptions) {
                const match = matchPreconditionByTokenOverlap(desc, preconditions);
                matchedPreconditions.push(match);
                if (match.matchType === 'create') {
                    preconditionsToCreate.push(match);
                }
            }
        } else {
            matchedPreconditions = preconditions.slice(0, 60).map((p) => ({
                key: p.key,
                summary: p.summary,
                matchType: 'exact' as const,
            }));
        }
    } else {
        matchedPreconditions = preconditions.map((p) => ({
            key: p.key,
            summary: p.summary,
            matchType: 'exact' as const,
        }));
    }

    const maxInjected = 60;
    const availableText =
        matchedPreconditions.length > 0
            ? matchedPreconditions
                  .slice(0, maxInjected)
                  .map((p) => `${p.key}: ${p.summary}`)
                  .join('\n')
            : 'No pre-conditions available in this project.';
    const finalSystem = system.replace('{preconditions}', availableText);

    const userMsg = 'User Story:\n' + userStory + '\n\nAcceptance Criteria:\n' + acceptanceCriteria;
    const safeUserMsg = sanitizeForLlm(userMsg);

    title('Gerando testes com IA...');
    let testCases: TestCaseData[];
    try {
        testCases = await llmPrompt('fast', finalSystem, safeUserMsg, 'case18', undefined, TestCaseArraySchema);
    } catch (err: unknown) {
        printError('Falha ao gerar casos de teste com IA', err);
        return;
    }

    const createdKeys = new Map<string, string>();
    if (preconditionsToCreate.length > 0) {
        title('Criando novas pre-conditions no Jira...');
        for (const pc of preconditionsToCreate) {
            try {
                const newKey = await c.linkManager.createPrecondition(project, pc.summary);
                createdKeys.set(pc.summary, newKey);
                info(`Pre-condition criada: ${newKey} — "${pc.summary}"`);
            } catch (err: unknown) {
                warn(`Falha ao criar pre-condition "${pc.summary}": ${(err as Error).message}`);
            }
        }
    }

    const converted = convertTestCases(testCases, createdKeys);

    const outDir = path.join(process.cwd(), 'reports', new Date().toISOString().slice(0, 10));
    fs.mkdirSync(outDir, { recursive: true });
    const outPath = path.join(outDir, 'llm-generated-tests.json');
    fs.writeFileSync(outPath, JSON.stringify(converted, null, 2), 'utf8');

    divider();
    info(`Testes gerados (${converted.length}) — salvos em ${outPath}:`);
    divider();
    info(sanitizeTerminal(JSON.stringify(converted, null, 2)));
    divider();

    if (preconditionsToCreate.length > 0) {
        info(
            `${preconditionsToCreate.length} pre-conditions foram criadas no Jira. ` +
                'Você pode agora importar os testes via menu 15 (Importar JSON).',
        );
    } else {
        info('Nenhuma pre-condition nova foi criada. Você pode importar os testes via menu 15 (Importar JSON).');
    }

    c.pushHistory('ai-generate-tests', `user story: ${userStory.slice(0, 60)} — ${converted.length} testes`, 'ok');
}

interface TestCaseData {
    title: string;
    steps: string[];
    expectedResult: string;
    preConditions?: Array<{ type: string; key?: string; summary?: string }>;
}

function convertTestCases(llmOutput: TestCaseData[], createdKeys: Map<string, string>): TestCase[] {
    return llmOutput.map((item) => {
        const steps: TestStep[] = item.steps.map((stepText: string) => ({
            fields: { Action: stepText },
        }));
        const precondition = resolvePrecondition(item.preConditions, createdKeys);
        return {
            title: item.title,
            description: '',
            steps,
            precondition: precondition || undefined,
        };
    });
}

function resolvePrecondition(
    preConditions: Array<{ type: string; key?: string; summary?: string }> | undefined,
    createdKeys: Map<string, string>,
): { type: 'inline' | 'reference'; value: string } | null {
    if (!preConditions || preConditions.length === 0) return null;

    const first = preConditions[0]!;

    if (first.type === 'reference' && first.key) {
        return { type: 'reference', value: first.key };
    }

    if (first.type === 'create' && first.summary) {
        const newKey = createdKeys.get(first.summary);
        if (newKey) {
            return { type: 'reference', value: newKey };
        }
        return { type: 'inline', value: first.summary };
    }

    return null;
}

export default { handler };
