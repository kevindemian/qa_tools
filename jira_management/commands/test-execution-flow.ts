/** Test Execution flow — shared prompt + dispatch for creating or reusing a Test Execution,
 * plus a unified preview of created tests and their TE association.
 * Extracted to a single module per SRP: all creation handlers call this instead of duplicating prompts. */
import { printError, ask, info, warn, success, title, divider } from '../../shared/prompt';
import type { CommandContext } from './context';
import type { TestExecutionSummary } from '../../shared/types';
import TestExecutionCreator from '../test-execution-creator';
// anti-circular (prompt -> create_tests -> session-context -> prompt)
import createTests from '../create_tests';

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
    const execDesc = await ask('Descrição (opcional)');
    try {
        const execResult = await createTests.createTestExecutionWithLinks(
            c.jiraResource,
            c.linkManager,
            project,
            testKeys,
            csvName,
            { title: execTitle, description: execDesc },
        );
        c.pushHistory('create-testexec', execResult.key, 'ok');
        return { associated: true, key: execResult.key, summary: execResult.summary, mode: 'created' };
    } catch (err) {
        printError('Erro ao criar Test Execution', err);
        c.pushHistory('create-testexec', 'erro', 'error');
        return { associated: false };
    }
}

/** Option 2: Use an existing Test Execution. */
async function handleUseExisting(
    c: CommandContext,
    testKeys: string[],
    project: string,
): Promise<TestExecutionAssociationResult> {
    let tes: TestExecutionSummary[] = [];
    try {
        tes = await c.linkManager.listTestExecutions(project);
    } catch {
        warn('Não foi possível buscar Test Executions do projeto.');
    }

    let teKey: string;

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
        teKey = resolveTeKeyInput(input.trim(), tes);
    } else {
        info('Nenhuma Test Execution encontrada no projeto ' + project + '.');
        teKey = await ask('Informe a key da Test Execution manualmente', { hint: 'ex: ' + project + '-TE-999' });
    }

    if (!teKey) {
        warn('Key inválida. Operação cancelada.');
        return { associated: false };
    }

    try {
        await c.linkManager.validateTestExecutionKey(teKey);
    } catch (err: unknown) {
        warn((err as Error).message);
        const retry = await ask('Tentar novamente? (s/N)', { default: '' });
        if (retry.toLowerCase() === 's' || retry.toLowerCase() === 'sim') {
            teKey = await ask('Informe a key da Test Execution', { hint: 'ex: ' + project + '-TE-999' });
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
        c.pushHistory('associate-testexec', result.key + ' (' + testKeys.length + ' testes)', 'ok');
        success('Testes associados à ' + result.key + ' — ' + result.summary);
        return { associated: true, key: result.key, summary: result.summary, mode: 'existing' };
    } catch (err) {
        printError('Erro ao associar testes à Test Execution', err);
        c.pushHistory('associate-testexec', 'erro', 'error');
        return { associated: false };
    }
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
    } catch {
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
