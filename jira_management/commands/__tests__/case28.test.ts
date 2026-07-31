/**
 * Tests for case28 — Associate existing test issues to an existing Test Execution.
 *
 * Validates handler export, TE key normalization, session/manual test-key
 * resolution, TE issue type validation, invalid-key filtering, and history
 * recording for success/error paths.
 *
 * Mock strategy: vi.hoisted for the TestExecutionCreator add mock to avoid
 * unsafe casts; jiraResource comes from the shared resource factory so the
 * getJiraResource Mock is referenced directly (no unresolved mapped types).
 */
const { mockAddTestsToExistingExecution, mockRootLoggerError } = vi.hoisted(() => ({
    mockAddTestsToExistingExecution: vi.fn(),
    mockRootLoggerError: vi.fn(),
}));

vi.mock('../../../shared/ui/prompt.js', () => ({
    ask: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    title: vi.fn(),
    divider: vi.fn(),
}));

vi.mock('../../../shared/logger.js', () => ({
    rootLogger: { error: mockRootLoggerError, warn: vi.fn(), info: vi.fn(), child: vi.fn().mockReturnThis() },
}));

vi.mock('../../test-execution-creator', () => ({
    default: vi.fn(function () {
        return { addTestsToExistingExecution: mockAddTestsToExistingExecution };
    }),
}));

import { ask, warn, info } from '../../../shared/ui/prompt.js';
import { makeMockCommandContext } from '../../../shared/test-utils.js';
import type { Mock } from 'vitest';
import TestExecutionCreator from '../../test-execution-creator.js';
import case28 from '../case28.js';

type JiraResourceMock = {
    getJiraResource: Mock;
};

function makeJiraResourceMock(): JiraResourceMock {
    return { getJiraResource: vi.fn() };
}

function makeTeFetch(validTestKeys: string[]) {
    return vi.fn((path: string) => {
        const key = path.replace('issue/', '');
        if (key === 'TE-1') {
            return Promise.resolve({ key, fields: { issuetype: { name: 'Test Execution' } } });
        }
        if (validTestKeys.includes(key)) {
            return Promise.resolve({ key, fields: { issuetype: { name: 'Test' } } });
        }
        return Promise.reject(new Error('404'));
    });
}

describe('Case28', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockAddTestsToExistingExecution.mockResolvedValue({ key: 'MOCK-TE', summary: 'Mock Test Execution' });
    });

    describe('Handler export', () => {
        it('exports a handler function', () => {
            expect(case28).toBeDefined();
            expect(typeof case28.handler).toBe('function');
        });
    });

    describe('TE key resolution', () => {
        it('warns and stops when no TE key is provided', async () => {
            expect.hasAssertions();

            vi.mocked(ask).mockResolvedValueOnce('   ');

            const jiraResource = makeJiraResourceMock();
            const ctx = makeMockCommandContext({ jiraResource });
            await case28.handler(ctx);

            expect(warn).toHaveBeenCalledWith('Nenhuma key informada.');
            expect(jiraResource.getJiraResource).not.toHaveBeenCalled();
        });

        it('normalizes the TE key to uppercase', async () => {
            expect.hasAssertions();

            vi.mocked(ask).mockResolvedValueOnce('te-1624').mockResolvedValueOnce('ECSPOL-1605');

            const jiraResource = makeJiraResourceMock();
            jiraResource.getJiraResource.mockImplementation(makeTeFetch(['ECSPOL-1605']));
            const ctx = makeMockCommandContext({ jiraResource });

            await case28.handler(ctx);

            expect(jiraResource.getJiraResource).toHaveBeenCalledWith('issue/TE-1624');
        });
    });

    describe('Test key resolution', () => {
        it('warns and stops when no test keys are provided', async () => {
            expect.hasAssertions();

            vi.mocked(ask).mockResolvedValueOnce('TE-1').mockResolvedValueOnce('   ');

            const jiraResource = makeJiraResourceMock();
            const ctx = makeMockCommandContext({ jiraResource });
            await case28.handler(ctx);

            expect(warn).toHaveBeenCalledWith('Nenhuma key informada.');
            expect(jiraResource.getJiraResource).not.toHaveBeenCalled();
        });

        it('falls back to manual keys when the session offer is declined', async () => {
            expect.hasAssertions();

            vi.mocked(ask).mockResolvedValueOnce('TE-1').mockResolvedValueOnce('N').mockResolvedValueOnce('T-9');

            const jiraResource = makeJiraResourceMock();
            jiraResource.getJiraResource.mockImplementation(makeTeFetch(['T-9']));
            const ctx = makeMockCommandContext({ jiraResource, ctx: { inMemoryTasksId: ['T-1', 'T-2'] } });

            await case28.handler(ctx);

            expect(jiraResource.getJiraResource).toHaveBeenCalledWith('issue/T-9');
            expect(jiraResource.getJiraResource).not.toHaveBeenCalledWith('issue/T-1');
        });

        it('uses session test keys when the user confirms', async () => {
            expect.hasAssertions();

            vi.mocked(ask).mockResolvedValueOnce('TE-1').mockResolvedValueOnce('s');

            const jiraResource = makeJiraResourceMock();
            jiraResource.getJiraResource.mockImplementation(makeTeFetch(['T-1', 'T-2']));
            const ctx = makeMockCommandContext({ jiraResource, ctx: { inMemoryTasksId: ['T-1', 'T-2'] } });

            await case28.handler(ctx);

            expect(info).toHaveBeenCalledWith('Testes da sessão atual: T-1, T-2');
            expect(jiraResource.getJiraResource).toHaveBeenCalledWith('issue/T-1');
            expect(jiraResource.getJiraResource).toHaveBeenCalledWith('issue/T-2');
        });

        it('types keys manually and normalizes separator/space/case', async () => {
            expect.hasAssertions();

            vi.mocked(ask)
                .mockResolvedValueOnce('TE-1')
                .mockResolvedValueOnce(' ecspol-1605, ECSPOL-1606  ecspol-1607 ');

            const jiraResource = makeJiraResourceMock();
            jiraResource.getJiraResource.mockImplementation(makeTeFetch(['ECSPOL-1605', 'ECSPOL-1606', 'ECSPOL-1607']));
            const ctx = makeMockCommandContext({ jiraResource });

            await case28.handler(ctx);

            expect(jiraResource.getJiraResource).toHaveBeenCalledWith('issue/ECSPOL-1605');
            expect(jiraResource.getJiraResource).toHaveBeenCalledWith('issue/ECSPOL-1606');
            expect(jiraResource.getJiraResource).toHaveBeenCalledWith('issue/ECSPOL-1607');
        });
    });

    describe('TE issue validation', () => {
        it('warns when the TE issue is not found', async () => {
            expect.hasAssertions();

            vi.mocked(ask).mockResolvedValueOnce('TE-1').mockResolvedValueOnce('T-1');

            const jiraResource = makeJiraResourceMock();
            jiraResource.getJiraResource.mockRejectedValue(new Error('404'));
            const ctx = makeMockCommandContext({ jiraResource });

            await case28.handler(ctx);

            expect(warn).toHaveBeenCalledWith('Issue TE-1 não encontrada no Jira.');
            expect(TestExecutionCreator).not.toHaveBeenCalled();
        });

        it('warns when the TE issue has a non Test Execution type', async () => {
            expect.hasAssertions();

            vi.mocked(ask).mockResolvedValueOnce('TE-1').mockResolvedValueOnce('T-1');

            const jiraResource = makeJiraResourceMock();
            jiraResource.getJiraResource.mockResolvedValue({
                key: 'TE-1',
                fields: { issuetype: { name: 'Story' } },
            });
            const ctx = makeMockCommandContext({ jiraResource });

            await case28.handler(ctx);

            expect(warn).toHaveBeenCalledWith('"TE-1" não é Test Execution (tipo: Story)');
            expect(TestExecutionCreator).not.toHaveBeenCalled();
        });

        it('warns with "desconhecido" when the TE issue type name is missing', async () => {
            expect.hasAssertions();

            vi.mocked(ask).mockResolvedValueOnce('TE-1').mockResolvedValueOnce('T-1');

            const jiraResource = makeJiraResourceMock();
            jiraResource.getJiraResource.mockResolvedValue({
                key: 'TE-1',
                fields: {},
            });
            const ctx = makeMockCommandContext({ jiraResource });

            await case28.handler(ctx);

            expect(warn).toHaveBeenCalledWith('"TE-1" não é Test Execution (tipo: desconhecido)');
            expect(TestExecutionCreator).not.toHaveBeenCalled();
        });
    });

    describe('Test key validation', () => {
        it('filters invalid keys and continues with the valid ones', async () => {
            expect.hasAssertions();

            vi.mocked(ask).mockResolvedValueOnce('TE-1').mockResolvedValueOnce('T-1, MISSING-99');

            const jiraResource = makeJiraResourceMock();
            jiraResource.getJiraResource.mockImplementation(makeTeFetch(['T-1']));
            const ctx = makeMockCommandContext({ jiraResource });

            await case28.handler(ctx);

            expect(warn).toHaveBeenCalledWith('1 issue(s) não encontrada(s): MISSING-99');
            expect(info).toHaveBeenCalledWith('Continuando com 1 teste(s) válido(s)...');
            expect(mockAddTestsToExistingExecution).toHaveBeenCalledWith('TE-1', ['T-1']);
        });

        it('cancels when all test keys are invalid', async () => {
            expect.hasAssertions();

            vi.mocked(ask).mockResolvedValueOnce('TE-1').mockResolvedValueOnce('MISSING-1 MISSING-2');

            const jiraResource = makeJiraResourceMock();
            jiraResource.getJiraResource.mockImplementation(makeTeFetch([]));
            const ctx = makeMockCommandContext({ jiraResource });

            await case28.handler(ctx);

            expect(warn).toHaveBeenCalledWith('Nenhum teste válido. Operação cancelada.');
            expect(mockAddTestsToExistingExecution).not.toHaveBeenCalled();
        });
    });

    describe('Association execution', () => {
        it('records success history when tests are associated', async () => {
            expect.hasAssertions();

            vi.mocked(ask).mockResolvedValueOnce('TE-1').mockResolvedValueOnce('T-1, T-2');

            const jiraResource = makeJiraResourceMock();
            jiraResource.getJiraResource.mockImplementation(makeTeFetch(['T-1', 'T-2']));
            const ctx = makeMockCommandContext({ jiraResource });

            await case28.handler(ctx);

            expect(ctx.pushHistory).toHaveBeenCalledWith('associate-te', 'MOCK-TE (2 testes)', 'ok');
            expect(info).toHaveBeenCalledWith('OK  2 teste(s) associado(s) à MOCK-TE — Mock Test Execution');
        });

        it('records error history when association returns no result', async () => {
            expect.hasAssertions();

            vi.mocked(ask).mockResolvedValueOnce('TE-1').mockResolvedValueOnce('T-1');

            const jiraResource = makeJiraResourceMock();
            jiraResource.getJiraResource.mockImplementation(makeTeFetch(['T-1']));
            mockAddTestsToExistingExecution.mockResolvedValue(null);
            const ctx = makeMockCommandContext({ jiraResource });

            await case28.handler(ctx);

            expect(ctx.pushHistory).toHaveBeenCalledWith('associate-te', 'erro', 'error');
            expect(warn).toHaveBeenCalledWith('Falha ao associar testes à TE-1');
        });

        it('records error history when association throws', async () => {
            expect.hasAssertions();

            vi.mocked(ask).mockResolvedValueOnce('TE-1').mockResolvedValueOnce('T-1');

            const jiraResource = makeJiraResourceMock();
            jiraResource.getJiraResource.mockImplementation(makeTeFetch(['T-1']));
            mockAddTestsToExistingExecution.mockRejectedValue(new Error('api down'));
            const ctx = makeMockCommandContext({ jiraResource });

            await case28.handler(ctx);

            expect(mockRootLoggerError).toHaveBeenCalledWith(expect.stringContaining('Erro ao associar testes'));
            expect(ctx.pushHistory).toHaveBeenCalledWith('associate-te', 'erro', 'error');
            expect(warn).toHaveBeenCalledWith(expect.stringContaining('Erro ao associar testes à TE-1'));
        });
    });
});
