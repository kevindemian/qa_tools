import type { CommandContext } from './context';

jest.mock('../../shared/prompt', () => ({
    printError: jest.fn(),
}));

jest.mock('../create_tests', () => ({
    createTestExecutionWithLinks: jest.fn(),
}));

import { printError } from '../../shared/prompt';
import { createTestExecutionWithLinksWrapper } from './helpers';

const mockCreateTests = jest.requireMock('../create_tests');

function makeContext(): CommandContext {
    return {
        jiraResource: undefined as unknown as CommandContext['jiraResource'],
        jiraResourceXray: undefined as unknown as CommandContext['jiraResourceXray'],
        linkManager: undefined as unknown as CommandContext['linkManager'],
        linkManagerXray: undefined as unknown as CommandContext['linkManagerXray'],
        csvResource: undefined as unknown as CommandContext['csvResource'],
        ctx: {
            project_name: 'TEST',
            inMemoryTasksId: [],
            inMemoryTasksText: [],
            sessionCounters: [],
            results: [],
            isBusy: false,
            lastOperation: '',
            packageManager: undefined,
            createPackageManager: jest.fn() as unknown as undefined,
            pushHistory: jest.fn(),
            withBusy: jest.fn(async (fn: () => Promise<void>) => fn()),
        } as unknown as CommandContext['ctx'],
        pushHistory: jest.fn(),
        printSessionSummary: jest.fn(),
        base_url: 'https://jira.test.com',
        sessionLog: {
            child: jest.fn().mockReturnValue({ info: jest.fn(), error: jest.fn() }),
        } as unknown as CommandContext['sessionLog'],
    };
}

beforeEach(() => {
    jest.clearAllMocks();
});

describe('createTestExecutionWithLinksWrapper', () => {
    it('creates test execution and pushes success history', async () => {
        mockCreateTests.createTestExecutionWithLinks.mockResolvedValueOnce({ key: 'TEST-EXEC-1' });
        const ctx = makeContext();

        await createTestExecutionWithLinksWrapper(ctx, ['TEST-1'], 'my-csv', 'My Title', 'My desc');

        expect(mockCreateTests.createTestExecutionWithLinks).toHaveBeenCalledWith(
            ctx.jiraResource,
            ctx.linkManager,
            'TEST',
            ['TEST-1'],
            'my-csv',
            { title: 'My Title', description: 'My desc' },
        );
        expect(ctx.pushHistory).toHaveBeenCalledWith('create-testexec', 'TEST-EXEC-1', 'ok');
    });

    it('handles error during test execution creation', async () => {
        const err = new Error('API error');
        mockCreateTests.createTestExecutionWithLinks.mockRejectedValueOnce(err);
        const ctx = makeContext();

        await createTestExecutionWithLinksWrapper(ctx, ['TEST-1'], 'my-csv', 'Title', 'Desc');

        expect(printError).toHaveBeenCalledWith('Erro ao criar Test Execution', err);
        expect(ctx.pushHistory).toHaveBeenCalledWith('create-testexec', 'erro', 'error');
    });
});
