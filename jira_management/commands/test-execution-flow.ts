/** Test Execution flow — shared prompt + dispatch for creating or reusing a Test Execution,
 * plus a unified preview of created tests and their TE association.
 * Extracted to a single module per SRP: all creation handlers call this instead of duplicating prompts. */
import { formatErr } from '../../shared/errors.js';
import { printError, ask, askMultiline, info, warn, success, title, divider } from '../../shared/prompt.js';
import type { CommandContext } from './context.js';
import type { TestExecutionSummary } from '../../shared/types.js';
import TestExecutionCreator from '../test-execution-creator.js';
// anti-circular (prompt -> create_tests -> session-context -> prompt)
import createTests from '../create_tests.js';

/** Result of a Test Execution association operation. */
export interface TestExecutionAssociationResult {
    /** Whether a TE was associated (created or existing). */
    associated: boolean;
    /** TE key, if associated. */
    key?: string;
    /** TE summary, if associated. */
    summary?: string;
    /** Whether it was created new or re-used existing. */
    mode?: 'created' | 'existing';
}

/** Prompt the user to associate created tests with a Test Execution.
 * Offers three options:
 *   1. Create a new Test Execution (original behaviour)
 *   2. Use an existing Test Execution (list recent TEs + manual key input)
 *   3. Skip (no association)
 *
 * @param c - Command context (must have jiraResource, linkManager, ctx.project_name, pushHistory).
 * @param testKeys - Array of newly created test issue keys.
 * @param srcName - Source name (CSV basename, JSON basename, or user-provided label).
 * @returns Association result with key and summary if associated, or { associated: false }.
 *
 * @example
 * ```ts
 * const teResult = await offerTestExecutionAssociation(c, ['TEST-1', 'TEST-2'], 'login-tests');
 * if (teResult.associated) {
 *   // TE key = teResult.key
 * }
 * ``` */
export async function offerTestExecutionAssociation(
    c: CommandContext,
    testKeys: string[],
    srcName: string,
): Promise<TestExecutionAssociationResult> {
    if (testKeys.length === 0) return { associated: false };

    const project = c.ctx.project_name;
    if (!project) return { associated: false };

    title('Associação com Test Execution');
    info('Testes criados: ' + testKeys.join(', '));
    divider();

    const choice = await ask('Deseja associar estes testes a uma Test Execution?', {
        hint: '1 = Criar nova | 2 = Usar existente | Enter = Pular',
        default: '',
    });

    const trimmedChoice = choice.trim();

    if (trimmedChoice === '1') {
        return handleCreateNew(c, testKeys, project, srcName);
    }

    if (trimmedChoice === '2') {
        return handleUseExisting(c, testKeys, project);
    }

    return { associated: false };
}

/** Option 1: Create a new Test Execution. */
async function handleCreateNew(
    c: CommandContext,
    testKeys: string[],
    project: string,
    srcName: string,
): Promise<TestExecutionAssociationResult> {
    const nameInput = await ask('Nome da execução', { hint: 'Enter = ' + srcName });
    const csvName = nameInput.trim() || srcName;
    const execTitle = await ask('Título do Test Execution', { hint: 'Enter = ' + csvName });
    const execDesc = await askMultiline('Descrição (opcional)');
    try {
        const executor = new TestExecutionCreator(c.jiraResource, c.linkManager);
        const execResult = await createTests.createTestExecutionWithLinks({
            testExecutionCreator: executor,
            projectName: project,
            testKeys,
            csvName,
            execOpts: { title: execTitle, description: execDesc },
        });
        if (!execResult) {
            c.pushHistory('create-testexec', 'erro', 'error');
            return { associated: false };
        }
        c.pushHistory('create-testexec', execResult.key, 'ok');
        return { associated: true, key: execResult.key, summary: execResult.summary, mode: 'created' };
    } catch (err) {
        printError('Erro ao criar Test Execution', err);
        c.pushHistory('create-testexec', 'erro', 'error');
        return { associated: false };
    }
}

/** Fetch the list of Test Executions for the project. */
async function fetchTeList(
    linkManager: CommandContext['linkManager'],
    project: string,
): Promise<TestExecutionSummary[]> {
    try {
        return await linkManager.listTestExecutions(project);
    } catch (err) {
        warn('Não foi possível buscar Test Executions: ' + (err instanceof Error ? err.message : String(err)));
        return [];
        return [];
    }
}

/** Prompt the user to select a TE from a list or enter a key manually. */
async function promptTeSelection(tes: TestExecutionSummary[], project: string): Promise<string> {
    if (tes.length > 0) {
        info('Test Executions disponíveis no projeto ' + project + ' (mais recentes):');
        divider();
        tes.slice(0, 20).forEach((te, i) => {
            const createdStr = te.created ? te.created.slice(0, 10) : '';
            info(i + 1 + '. ' + te.key + ' — ' + te.summary + ' (' + createdStr + ') — ' + te.status);
        });
        divider();
        const input = await ask('Digite o número da TE acima, ou informe a key manualmente', {
            hint: 'ex: 1 ou ' + project + '-TE-999',
        });
        return resolveTeKeyInput(input.trim(), tes);
    }

    info('Nenhuma Test Execution encontrada no projeto ' + project + '.');
    return ask('Informe a key da Test Execution manualmente', { hint: 'ex: ' + project + '-TE-999' });
}

/** Validate the TE key and associate tests. Returns the association result or { associated: false }. */
async function validateAndLinkTe(
    c: CommandContext,
    teKey: string,
    testKeys: string[],
): Promise<TestExecutionAssociationResult> {
    try {
        await c.linkManager.validateTestExecutionKey(teKey);
    } catch (err: unknown) {
        warn(formatErr(err));
        const retry = await ask('Tentar novamente? (s/N)', { hint: 's ou Enter para não', default: '' });
        if (retry.toLowerCase() === 's' || retry.toLowerCase() === 'sim') {
            teKey = await ask('Informe a key da Test Execution', { hint: 'ex: ' + c.ctx.project_name + '-TE-999' });
            if (!teKey) return { associated: false };
            try {
                await c.linkManager.validateTestExecutionKey(teKey);
            } catch (err2: unknown) {
                printError('Key inválida novamente', err2);
                return { associated: false };
            }
        } else {
            return { associated: false };
        }
    }

    try {
        const creator = new TestExecutionCreator(c.jiraResource, c.linkManager);
        const result = await creator.addTestsToExistingExecution(teKey, testKeys);
        if (!result) {
            c.pushHistory('associate-testexec', 'erro', 'error');
            return { associated: false };
        }
        c.pushHistory('associate-testexec', result.key + ' (' + testKeys.length + ' testes)', 'ok');
        success('Testes associados à ' + result.key + ' — ' + result.summary);
        return { associated: true, key: result.key, summary: result.summary, mode: 'existing' };
    } catch (err) {
        printError('Erro ao associar testes à Test Execution', err);
        c.pushHistory('associate-testexec', 'erro', 'error');
        return { associated: false };
    }
}

/** Option 2: Use an existing Test Execution. */
async function handleUseExisting(
    c: CommandContext,
    testKeys: string[],
    project: string,
): Promise<TestExecutionAssociationResult> {
    const tes = await fetchTeList(c.linkManager, project);
    const teKey = await promptTeSelection(tes, project);

    if (!teKey) {
        warn('Key inválida. Operação cancelada.');
        return { associated: false };
    }

    return validateAndLinkTe(c, teKey, testKeys);
}

/** Resolve user input: if it's a number <= list length, use as index; otherwise treat as a key. */
function resolveTeKeyInput(input: string, tes: TestExecutionSummary[]): string {
    const num = Number(input);
    if (Number.isInteger(num) && num >= 1 && num <= tes.length) {
        const selected = tes[num - 1];
        if (selected) return selected.key;
    }

    if (/^[A-Z]+-[A-Z]+-\d+$/.test(input.toUpperCase())) {
        return input.toUpperCase();
    }

    return '';
}

/** Show a unified preview of created tests and their Test Execution association. */
export async function showResults(
    c: CommandContext,
    testKeys: string[],
    teResult?: TestExecutionAssociationResult,
): Promise<void> {
    divider();
    title('Resumo da operação');

    let summaries: Array<{ key: string; summary: string }>;
    try {
        summaries = await c.linkManager.getTestCaseSummaries(testKeys.slice(0, 20));
    } catch (err) {
        warn('Failed to fetch test summaries: ' + (err instanceof Error ? err.message : String(err)));
        summaries = testKeys.map((k) => ({ key: k, summary: '' }));
    }

    info('Testes criados:');
    summaries.forEach((s) => {
        const label = s.summary ? s.summary : '(sem título)';
        info('  ' + s.key + ' — ' + label);
    });

    if (teResult?.associated && teResult.key) {
        info('');
        info('Associados à Test Execution:');
        info('  ' + teResult.key + (teResult.summary ? ' — ' + teResult.summary : ''));
        info('  Status: ' + (teResult.mode === 'created' ? 'Nova' : 'Existente'));
        info('');
        info('  → Importar resultados: opção 13 no menu principal');
    }

    divider();
}

export default { offerTestExecutionAssociation, showResults };
