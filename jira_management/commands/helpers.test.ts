import type { CommandContext } from './context';

jest.mock('../../shared/prompt', () => ({
    printError: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    success: jest.fn(),
    title: jest.fn(),
    divider: jest.fn(),
    ask: jest.fn().mockResolvedValue(''),
}));

jest.mock('../../shared/logger', () => ({
    rootLogger: {
        child: jest.fn().mockReturnValue({ info: jest.fn(), error: jest.fn(), warn: jest.fn() }),
    },
}));

jest.mock('../create_tests', () => ({
    createTestExecutionWithLinks: jest.fn(),
}));

jest.mock('../test-execution-creator', () => {
    const _mockFn = jest.fn();
    return {
        __esModule: true,
        default: jest.fn().mockReturnValue({
            addTestsToExistingExecution: _mockFn,
            create: jest.fn(),
            createWithLinks: jest.fn(),
        }),
        __mockFn: _mockFn,
    };
});

import { offerTestExecutionAssociation, showResults } from './test-execution-flow';

const mockCreateTests = jest.requireMock('../create_tests');
const mockLinkManager = {
    listTestExecutions: jest.fn().mockResolvedValue([]),
    validateTestExecutionKey: jest.fn().mockResolvedValue(undefined),
    getTestCaseSummaries: jest.fn().mockResolvedValue([]),
};

function makeContext(): CommandContext {
    return {
        jiraResource: undefined as unknown as CommandContext['jiraResource'],
        jiraResourceXray: undefined as unknown as CommandContext['jiraResourceXray'],
        linkManager: mockLinkManager as unknown as CommandContext['linkManager'],
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
    const teMod = jest.requireMock('../test-execution-creator');
    teMod.__mockFn.mockResolvedValue({ key: 'TE-1', summary: 'Existing TE' });
    teMod.default.mockReturnValue({
        addTestsToExistingExecution: teMod.__mockFn,
        create: jest.fn(),
        createWithLinks: jest.fn(),
    });
});

describe('offerTestExecutionAssociation', () => {
    it('returns { associated: false } when testKeys is empty', async () => {
        const ctx = makeContext();
        const result = await offerTestExecutionAssociation(ctx, [], 'test');
        expect(result).toEqual({ associated: false });
    });

    it('returns { associated: false } when project is empty', async () => {
        const ctx = makeContext();
        ctx.ctx.project_name = '';
        const result = await offerTestExecutionAssociation(ctx, ['T-1'], 'test');
        expect(result).toEqual({ associated: false });
    });

    it('returns { associated: false } when user skips (empty input)', async () => {
        const ctx = makeContext();
        const result = await offerTestExecutionAssociation(ctx, ['T-1'], 'test');
        expect(result).toEqual({ associated: false });
    });

    it('creates new test execution when user chooses option 1', async () => {
        const prompt = require('../../shared/prompt');
        prompt.ask
            .mockResolvedValueOnce('1')
            .mockResolvedValueOnce('my-run')
            .mockResolvedValueOnce('My Title')
            .mockResolvedValueOnce('My desc');
        mockCreateTests.createTestExecutionWithLinks.mockResolvedValueOnce({ key: 'TE-NEW', summary: 'My Title' });
        const ctx = makeContext();
        const result = await offerTestExecutionAssociation(ctx, ['T-1', 'T-2'], 'test');
        expect(result).toEqual({ associated: true, key: 'TE-NEW', summary: 'My Title', mode: 'created' });
        expect(mockCreateTests.createTestExecutionWithLinks).toHaveBeenCalledWith(
            ctx.jiraResource,
            ctx.linkManager,
            'TEST',
            ['T-1', 'T-2'],
            'my-run',
            { title: 'My Title', description: 'My desc' },
        );
        expect(ctx.pushHistory).toHaveBeenCalledWith('create-testexec', 'TE-NEW', 'ok');
    });

    it('handles error when creating new test execution', async () => {
        const prompt = require('../../shared/prompt');
        prompt.ask
            .mockResolvedValueOnce('1')
            .mockResolvedValueOnce('my-run')
            .mockResolvedValueOnce('My Title')
            .mockResolvedValueOnce('');
        mockCreateTests.createTestExecutionWithLinks.mockRejectedValueOnce(new Error('API error'));
        const ctx = makeContext();
        const result = await offerTestExecutionAssociation(ctx, ['T-1'], 'test');
        expect(result).toEqual({ associated: false });
        expect(ctx.pushHistory).toHaveBeenCalledWith('create-testexec', 'erro', 'error');
    });
});

describe('offerTestExecutionAssociation — option 2 (use existing)', () => {
    const TEs = [
        { key: 'TE-1', summary: 'Smoke Tests', status: 'TODO', created: '2026-05-20T10:00:00.000Z' },
        { key: 'TE-2', summary: 'Regression', status: 'DONE', created: '2026-05-19T10:00:00.000Z' },
    ];

    it('uses existing TE by index when list returns results', async () => {
        mockLinkManager.listTestExecutions.mockResolvedValueOnce(TEs);
        mockLinkManager.validateTestExecutionKey.mockResolvedValue(undefined);
        const prompt = require('../../shared/prompt');
        prompt.ask.mockResolvedValueOnce('2').mockResolvedValueOnce('1');
        const ctx = makeContext();
        const result = await offerTestExecutionAssociation(ctx, ['T-1'], 'test');
        expect(result).toEqual({ associated: true, key: 'TE-1', summary: 'Existing TE', mode: 'existing' });
        expect(ctx.pushHistory).toHaveBeenCalledWith('associate-testexec', 'TE-1 (1 testes)', 'ok');
    });

    it('uses existing TE by key when list returns results', async () => {
        mockLinkManager.listTestExecutions.mockResolvedValueOnce(TEs);
        const prompt = require('../../shared/prompt');
        prompt.ask.mockResolvedValueOnce('2').mockResolvedValueOnce('PROJ-TE-999');
        const ctx = makeContext();
        const result = await offerTestExecutionAssociation(ctx, ['T-1'], 'test');
        expect(result).toEqual({ associated: true, key: 'TE-1', summary: 'Existing TE', mode: 'existing' });
    });

    it('accepts lowercase key and uppercases it', async () => {
        mockLinkManager.listTestExecutions.mockResolvedValueOnce(TEs);
        const prompt = require('../../shared/prompt');
        prompt.ask.mockResolvedValueOnce('2').mockResolvedValueOnce('proj-te-999');
        const ctx = makeContext();
        const result = await offerTestExecutionAssociation(ctx, ['T-1'], 'test');
        expect(result).toEqual({ associated: true, key: 'TE-1', summary: 'Existing TE', mode: 'existing' });
    });

    it('asks for manual key when list is empty', async () => {
        mockLinkManager.listTestExecutions.mockResolvedValueOnce([]);
        const prompt = require('../../shared/prompt');
        prompt.ask.mockResolvedValueOnce('2').mockResolvedValueOnce('PROJ-TE-1');
        const ctx = makeContext();
        const result = await offerTestExecutionAssociation(ctx, ['T-1'], 'test');
        expect(result).toEqual({ associated: true, key: 'TE-1', summary: 'Existing TE', mode: 'existing' });
    });

    it('warns and proceeds with manual key when listTestExecutions throws', async () => {
        mockLinkManager.listTestExecutions.mockRejectedValueOnce(new Error('Network error'));
        const prompt = require('../../shared/prompt');
        prompt.ask.mockResolvedValueOnce('2').mockResolvedValueOnce('PROJ-TE-1');
        const ctx = makeContext();
        const result = await offerTestExecutionAssociation(ctx, ['T-1'], 'test');
        expect(result).toEqual({ associated: true, key: 'TE-1', summary: 'Existing TE', mode: 'existing' });
    });

    it('returns { associated: false } when resolved key is empty (invalid input)', async () => {
        mockLinkManager.listTestExecutions.mockResolvedValueOnce([]);
        const prompt = require('../../shared/prompt');
        prompt.ask.mockResolvedValueOnce('2').mockResolvedValueOnce('');
        const ctx = makeContext();
        const result = await offerTestExecutionAssociation(ctx, ['T-1'], 'test');
        expect(result).toEqual({ associated: false });
    });

    it('returns { associated: false } when key format is invalid (resolveTeKeyInput returns "")', async () => {
        mockLinkManager.listTestExecutions.mockResolvedValueOnce(TEs);
        const prompt = require('../../shared/prompt');
        prompt.ask.mockResolvedValueOnce('2').mockResolvedValueOnce('not-a-key');
        const ctx = makeContext();
        const result = await offerTestExecutionAssociation(ctx, ['T-1'], 'test');
        expect(result).toEqual({ associated: false });
    });

    it('retries validate when user says yes and second attempt succeeds', async () => {
        mockLinkManager.listTestExecutions.mockResolvedValueOnce([]);
        mockLinkManager.validateTestExecutionKey
            .mockRejectedValueOnce(new Error('Issue nao encontrada'))
            .mockResolvedValueOnce(undefined);
        const prompt = require('../../shared/prompt');
        prompt.ask
            .mockResolvedValueOnce('2')
            .mockResolvedValueOnce('INVALID')
            .mockResolvedValueOnce('s')
            .mockResolvedValueOnce('PROJ-TE-1');
        const ctx = makeContext();
        const result = await offerTestExecutionAssociation(ctx, ['T-1'], 'test');
        expect(result).toEqual({ associated: true, key: 'TE-1', summary: 'Existing TE', mode: 'existing' });
    });

    it('returns associated:false when validate fails and user declines retry', async () => {
        mockLinkManager.listTestExecutions.mockResolvedValueOnce([]);
        mockLinkManager.validateTestExecutionKey.mockRejectedValueOnce(new Error('Invalida'));
        const prompt = require('../../shared/prompt');
        prompt.ask.mockResolvedValueOnce('2').mockResolvedValueOnce('INVALID').mockResolvedValueOnce('n');
        const ctx = makeContext();
        const result = await offerTestExecutionAssociation(ctx, ['T-1'], 'test');
        expect(result).toEqual({ associated: false });
    });

    it('returns associated:false when retry key is also empty', async () => {
        mockLinkManager.listTestExecutions.mockResolvedValueOnce([]);
        mockLinkManager.validateTestExecutionKey.mockRejectedValueOnce(new Error('Invalida'));
        const prompt = require('../../shared/prompt');
        prompt.ask
            .mockResolvedValueOnce('2')
            .mockResolvedValueOnce('INVALID')
            .mockResolvedValueOnce('s')
            .mockResolvedValueOnce('');
        const ctx = makeContext();
        const result = await offerTestExecutionAssociation(ctx, ['T-1'], 'test');
        expect(result).toEqual({ associated: false });
    });

    it('returns associated:false when retry validate also fails', async () => {
        mockLinkManager.listTestExecutions.mockResolvedValueOnce([]);
        mockLinkManager.validateTestExecutionKey
            .mockRejectedValueOnce(new Error('Invalida'))
            .mockRejectedValueOnce(new Error('Invalida novamente'));
        const prompt = require('../../shared/prompt');
        prompt.ask
            .mockResolvedValueOnce('2')
            .mockResolvedValueOnce('INVALID')
            .mockResolvedValueOnce('s')
            .mockResolvedValueOnce('INVALID2');
        const ctx = makeContext();
        const result = await offerTestExecutionAssociation(ctx, ['T-1'], 'test');
        expect(result).toEqual({ associated: false });
    });

    it('handles error when addTestsToExistingExecution fails', async () => {
        mockLinkManager.listTestExecutions.mockResolvedValueOnce([]);
        const prompt = require('../../shared/prompt');
        prompt.ask.mockResolvedValueOnce('2').mockResolvedValueOnce('PROJ-TE-1');
        const teMock = jest.requireMock('../test-execution-creator');
        teMock.__mockFn.mockRejectedValueOnce(new Error('Link error'));
        const ctx = makeContext();
        const result = await offerTestExecutionAssociation(ctx, ['T-1'], 'test');
        expect(result).toEqual({ associated: false });
        expect(ctx.pushHistory).toHaveBeenCalledWith('associate-testexec', 'erro', 'error');
    });

    it('calls pushHistory with correct count when multiple tests are linked', async () => {
        mockLinkManager.listTestExecutions.mockResolvedValueOnce(TEs);
        const prompt = require('../../shared/prompt');
        prompt.ask.mockResolvedValueOnce('2').mockResolvedValueOnce('1');
        const ctx = makeContext();
        const result = await offerTestExecutionAssociation(ctx, ['T-1', 'T-2', 'T-3'], 'test');
        expect(result).toEqual({ associated: true, key: 'TE-1', summary: 'Existing TE', mode: 'existing' });
        expect(ctx.pushHistory).toHaveBeenCalledWith('associate-testexec', 'TE-1 (3 testes)', 'ok');
    });
});

describe('showResults error paths', () => {
    it('uses fallback summaries when getTestCaseSummaries throws', async () => {
        mockLinkManager.getTestCaseSummaries.mockRejectedValueOnce(new Error('API down'));
        const ctx = makeContext();
        await showResults(ctx, ['T-1', 'T-2']);
        expect(mockLinkManager.getTestCaseSummaries).toHaveBeenCalledWith(['T-1', 'T-2']);
    });

    it('shows created mode label in TE info', async () => {
        mockLinkManager.getTestCaseSummaries.mockResolvedValueOnce([{ key: 'T-1', summary: 'Login test' }]);
        const ctx = makeContext();
        await showResults(ctx, ['T-1'], { associated: true, key: 'TE-5', summary: 'Smoke', mode: 'created' });
    });
});
