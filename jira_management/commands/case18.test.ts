jest.mock('../../shared/prompt', () => ({
    success: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    title: jest.fn(),
    divider: jest.fn(),
    ask: jest.fn().mockResolvedValue(''),
    askConfirm: jest.fn().mockResolvedValue(true),
    printError: jest.fn(),
    tableView: jest.fn(),
}));

jest.mock('../../shared/llm-client', () => ({
    llmPrompt: jest.fn(),
    getLlmClientMetrics: jest.fn(() => ({
        cacheHits: 0,
        cacheMisses: 0,
        totalPromptTokens: 0,
        totalCompletionTokens: 0,
        requestsByProviderKey: {},
    })),
    resetLlmClientMetrics: jest.fn(),
    parseRetryAfter: jest.fn(() => 2000),
}));

jest.mock('../../shared/logger', () => ({
    rootLogger: {
        warn: jest.fn(),
        info: jest.fn(),
        error: jest.fn(),
        child: jest.fn().mockReturnValue({ info: jest.fn(), error: jest.fn(), warn: jest.fn() }),
    },
}));

jest.mock('../../shared/ai-feedback', () => ({
    recordAiGeneration: jest.fn(),
}));

jest.mock('crypto', () => ({
    randomUUID: jest.fn().mockReturnValue('mock-uuid'),
}));

jest.mock('fs');

jest.mock('../jira_link_manager', () => ({
    matchPreconditionByDualThreshold: jest.fn(),
}));

const mockSessionContext: Record<string, unknown> = {
    inMemoryTasksId: [],
    inMemoryTasksText: [],
    sessionCounters: [],
    project_name: 'TEST',
    isBusy: false,
    results: [],
    lastOperation: '',
    createPackageManager: jest.fn(),
};

const baseContext = {
    jiraResource: {} as Record<string, jest.Mock>,
    jiraResourceXray: {} as Record<string, jest.Mock>,
    linkManager: {} as Record<string, jest.Mock>,
    linkManagerXray: {} as Record<string, jest.Mock>,
    csvResource: {} as Record<string, jest.Mock>,
    ctx: mockSessionContext,
    pushHistory: jest.fn(),
    printSessionSummary: jest.fn(),
    base_url: 'https://jira.test.com',
    sessionLog: { child: jest.fn().mockReturnValue({ info: jest.fn(), error: jest.fn() }) },
};

beforeEach(() => {
    jest.clearAllMocks();
});

describe('case18 — AI tests generator', () => {
    it('generates tests with AI successfully', async () => {
        const prompt = require('../../shared/prompt');
        const llm = require('../../shared/llm-client');
        const fs = require('fs');

        prompt.ask.mockResolvedValueOnce('User wants to login').mockResolvedValueOnce('Must validate credentials');

        fs.readFileSync.mockReturnValueOnce('You are a QA engineer.');

        llm.llmPrompt.mockResolvedValueOnce([
            {
                title: 'Login test with valid credentials',
                steps: ['Enter valid user', 'Enter valid password', 'Click login'],
                expectedResult: 'User is redirected to dashboard and sees welcome message',
            },
        ]);

        const mod = require('./case18').default;
        await mod.handler(baseContext);

        expect(llm.llmPrompt).toHaveBeenCalledWith(
            'fast',
            expect.stringContaining('You are a QA engineer'),
            expect.stringContaining('User wants to login'),
            'case18',
            undefined,
            expect.anything(),
        );
        expect(baseContext.pushHistory).toHaveBeenCalledWith('ai-generate-tests', expect.any(String), 'ok');
    });

    it('handles empty user story', async () => {
        const prompt = require('../../shared/prompt');
        prompt.ask.mockResolvedValueOnce('');

        const mod = require('./case18').default;
        await mod.handler(baseContext);

        expect(prompt.warn).toHaveBeenCalledWith('História vazia. Operação cancelada.');
    });

    it('handles LLM error', async () => {
        const prompt = require('../../shared/prompt');
        const llm = require('../../shared/llm-client');
        const fs = require('fs');

        prompt.ask.mockResolvedValueOnce('User wants to login').mockResolvedValueOnce('Must validate');

        fs.readFileSync.mockReturnValueOnce('template');

        llm.llmPrompt.mockRejectedValueOnce(new Error('LLM API error'));

        const mod = require('./case18').default;
        await mod.handler(baseContext);

        expect(prompt.printError).toHaveBeenCalled();
    });

    it('handles template read error', async () => {
        const prompt = require('../../shared/prompt');
        const fs = require('fs');

        prompt.ask.mockResolvedValueOnce('User wants to login').mockResolvedValueOnce('Must validate');

        fs.readFileSync.mockImplementationOnce(() => {
            throw new Error('File not found');
        });

        const mod = require('./case18').default;
        await mod.handler(baseContext);

        expect(prompt.printError).toHaveBeenCalled();
    });

    it('handles valid test cases from llmPrompt', async () => {
        const prompt = require('../../shared/prompt');
        const llm = require('../../shared/llm-client');
        const fs = require('fs');

        prompt.ask.mockResolvedValueOnce('User wants to login').mockResolvedValueOnce('Must validate');
        fs.readFileSync.mockReturnValueOnce('You are a QA engineer.');

        llm.llmPrompt.mockResolvedValueOnce([
            {
                title: 'Login test with valid credentials',
                steps: ['Enter valid user'],
                expectedResult: 'User is redirected to dashboard',
            },
        ]);

        const mod = require('./case18').default;
        await mod.handler(baseContext);

        expect(baseContext.pushHistory).toHaveBeenCalledWith('ai-generate-tests', expect.any(String), 'ok');
    });

    it('23.14: prints error when llmPrompt throws (Zod validation failed after retry)', async () => {
        const { llmPrompt } = require('../../shared/llm-client');
        const { printError } = require('../../shared/prompt');
        const prompt = require('../../shared/prompt');
        const fs = require('fs');

        prompt.ask.mockResolvedValueOnce('User wants to login').mockResolvedValueOnce('Must validate');
        fs.readFileSync.mockReturnValueOnce('You are a QA engineer.');

        llmPrompt.mockRejectedValueOnce(new Error('LLM response failed schema validation after retry'));

        const mod = require('./case18').default;
        await mod.handler(baseContext);

        expect(printError).toHaveBeenCalledWith('Falha ao gerar casos de teste com IA', expect.any(Error));
    });

    it('warns when project name is empty', async () => {
        const prompt = require('../../shared/prompt');
        const origProjectName = baseContext.ctx.project_name;
        baseContext.ctx.project_name = '';

        prompt.ask
            .mockResolvedValueOnce('User story')
            .mockResolvedValueOnce('Acceptance criteria')
            .mockResolvedValueOnce('');

        const mod = require('./case18').default;
        await mod.handler(baseContext);

        expect(prompt.warn).toHaveBeenCalledWith('Projeto vazio. Operação cancelada.');
        baseContext.ctx.project_name = origProjectName;
    });

    it('lists preconditions from Jira project', async () => {
        const prompt = require('../../shared/prompt');
        const llm = require('../../shared/llm-client');
        const fs = require('fs');

        prompt.ask.mockResolvedValueOnce('User wants to login').mockResolvedValueOnce('Must validate credentials');
        fs.readFileSync.mockReturnValue('You are a QA engineer.');

        baseContext.linkManager.listPreconditions = jest
            .fn()
            .mockResolvedValue([{ key: 'PC-1', summary: 'User is logged in' }]);

        llm.llmPrompt.mockResolvedValue([
            {
                title: 'Login test with valid credentials',
                steps: ['Enter valid user', 'Click login'],
                expectedResult: 'Expected result text for validation',
            },
        ]);

        const mod = require('./case18').default;
        await mod.handler(baseContext);

        expect(prompt.info).toHaveBeenCalledWith(expect.stringContaining('pre-conditions encontradas'));
    });

    it('creates new preconditions when dual-threshold returns create', async () => {
        const prompt = require('../../shared/prompt');
        const llm = require('../../shared/llm-client');
        const jiraLM = require('../jira_link_manager');
        const fs = require('fs');

        prompt.ask.mockResolvedValueOnce('User wants to login').mockResolvedValueOnce('Must validate');
        fs.readFileSync.mockReturnValue('You are a QA engineer.');

        baseContext.linkManager.listPreconditions = jest
            .fn()
            .mockResolvedValue([{ key: 'PC-1', summary: 'User must be logged in' }]);

        llm.llmPrompt.mockResolvedValue([
            {
                title: 'Login test',
                steps: ['Step 1'],
                expectedResult: 'Expected result text for validation',
                preConditions: [{ type: 'create', summary: 'New precondition needed' }],
            },
        ]);
        jiraLM.matchPreconditionByDualThreshold.mockReturnValue({
            key: '__create__',
            summary: 'New precondition needed',
            matchType: 'create',
        });

        baseContext.linkManager.createPrecondition = jest.fn().mockResolvedValue('PC-NEW-1');

        const mod = require('./case18').default;
        await mod.handler(baseContext);

        expect(jiraLM.matchPreconditionByDualThreshold).toHaveBeenCalled();
        expect(baseContext.linkManager.createPrecondition).toHaveBeenCalledWith('TEST', 'New precondition needed');
        expect(prompt.info).toHaveBeenCalledWith(expect.stringContaining('Pre-condition criada'));
        expect(prompt.info).toHaveBeenCalledWith(expect.stringContaining('pre-conditions foram criadas'));
    });

    it('resolves matched preconditions to reference without creating', async () => {
        const prompt = require('../../shared/prompt');
        const llm = require('../../shared/llm-client');
        const jiraLM = require('../jira_link_manager');
        const fs = require('fs');

        prompt.ask.mockResolvedValueOnce('User story').mockResolvedValueOnce('Criteria');
        fs.readFileSync.mockReturnValue('You are a QA engineer.');

        baseContext.linkManager.listPreconditions = jest
            .fn()
            .mockResolvedValue([{ key: 'PC-1', summary: 'User must be logged in' }]);

        llm.llmPrompt.mockResolvedValue([
            {
                title: 'Login test',
                steps: ['Step 1'],
                expectedResult: 'Expected result text for validation',
                preConditions: [{ type: 'create', summary: 'User must be logged in' }],
            },
        ]);
        jiraLM.matchPreconditionByDualThreshold.mockReturnValue({
            key: 'PC-1',
            summary: 'User must be logged in',
            matchType: 'exact',
        });

        const mod = require('./case18').default;
        await mod.handler(baseContext);

        expect(jiraLM.matchPreconditionByDualThreshold).toHaveBeenCalledWith(
            'User must be logged in',
            expect.any(Array),
        );
        expect(baseContext.linkManager.createPrecondition).not.toHaveBeenCalled();
        expect(prompt.info).toHaveBeenCalledWith(expect.stringContaining('Nenhuma pre-condition nova foi criada'));
    });

    it('handles failure to list preconditions', async () => {
        const prompt = require('../../shared/prompt');
        const llm = require('../../shared/llm-client');
        const fs = require('fs');

        prompt.ask.mockResolvedValueOnce('User story').mockResolvedValueOnce('Criteria');
        fs.readFileSync.mockReturnValue('You are a QA engineer.');

        baseContext.linkManager.listPreconditions = jest.fn().mockRejectedValue(new Error('Jira unavailable'));

        llm.llmPrompt.mockResolvedValue([
            {
                title: 'Login test',
                steps: ['Step 1'],
                expectedResult: 'Expected result text for validation',
            },
        ]);

        const mod = require('./case18').default;
        await mod.handler(baseContext);

        expect(prompt.warn).toHaveBeenCalledWith(expect.stringContaining('Não foi possível buscar pre-conditions'));
    });

    it('handles various precondition types in converted test cases', async () => {
        const prompt = require('../../shared/prompt');
        const llm = require('../../shared/llm-client');
        const fs = require('fs');

        prompt.ask.mockResolvedValueOnce('User wants to login').mockResolvedValueOnce('Must validate');
        fs.readFileSync.mockReturnValue('You are a QA engineer.');

        baseContext.linkManager.listPreconditions = jest.fn().mockResolvedValue([]);

        llm.llmPrompt.mockResolvedValue([
            {
                title: 'Test without precondition',
                steps: ['Step 1'],
                expectedResult: 'Expected result one text here',
            },
            {
                title: 'Test with reference precondition',
                steps: ['Step 1'],
                expectedResult: 'Expected result two text here',
                preConditions: [{ type: 'reference', key: 'PC-1' }],
            },
            {
                title: 'Test with create precondition no key',
                steps: ['Step 1'],
                expectedResult: 'Expected result three text here',
                preConditions: [{ type: 'create', summary: 'New precondition text' }],
            },
        ]);

        const mod = require('./case18').default;
        await mod.handler(baseContext);

        expect(baseContext.pushHistory).toHaveBeenCalledWith('ai-generate-tests', expect.any(String), 'ok');
    });

    it('handles precondition creation failure', async () => {
        const prompt = require('../../shared/prompt');
        const llm = require('../../shared/llm-client');
        const jiraLM = require('../jira_link_manager');
        const fs = require('fs');

        prompt.ask.mockResolvedValueOnce('User story').mockResolvedValueOnce('Criteria');
        fs.readFileSync.mockReturnValue('You are a QA engineer.');

        baseContext.linkManager.listPreconditions = jest
            .fn()
            .mockResolvedValue([{ key: 'PC-1', summary: 'User is logged in' }]);

        llm.llmPrompt.mockResolvedValue([
            {
                title: 'Test with preconditions',
                steps: ['Step 1'],
                expectedResult: 'Expected result text for validation',
                preConditions: [{ type: 'create', summary: 'New precondition' }],
            },
        ]);
        jiraLM.matchPreconditionByDualThreshold.mockReturnValue({
            key: '__create__',
            summary: 'New precondition',
            matchType: 'create',
        });

        baseContext.linkManager.createPrecondition = jest.fn().mockRejectedValue(new Error('Jira error'));

        const mod = require('./case18').default;
        await mod.handler(baseContext);

        expect(prompt.warn).toHaveBeenCalledWith(expect.stringContaining('Falha ao criar pre-condition'));
    });

    it('converts test cases with various precondition resolutions', async () => {
        const prompt = require('../../shared/prompt');
        const llm = require('../../shared/llm-client');
        const jiraLM = require('../jira_link_manager');
        const fs = require('fs');

        prompt.ask.mockResolvedValueOnce('User story').mockResolvedValueOnce('Criteria');
        fs.readFileSync.mockReturnValue('You are a QA engineer.');

        baseContext.linkManager.listPreconditions = jest
            .fn()
            .mockResolvedValue([{ key: 'PC-1', summary: 'User is logged in' }]);

        llm.llmPrompt.mockResolvedValue([
            {
                title: 'Test with create matching createdKeys',
                steps: ['Step 1'],
                expectedResult: 'Expected result text for validation here',
                preConditions: [{ type: 'create', summary: 'Newly created PC' }],
            },
            {
                title: 'Test with reference no key',
                steps: ['Step 1'],
                expectedResult: 'Expected result text for validation there',
                preConditions: [{ type: 'reference' }],
            },
        ]);
        jiraLM.matchPreconditionByDualThreshold.mockReturnValue({
            key: '__create__',
            summary: 'Newly created PC',
            matchType: 'create',
        });

        baseContext.linkManager.createPrecondition = jest.fn().mockResolvedValue('PC-NEW-1');

        const mod = require('./case18').default;
        await mod.handler(baseContext);

        expect(baseContext.linkManager.createPrecondition).toHaveBeenCalledWith('TEST', 'Newly created PC');
    });

    it('deduplicates identical summaries across test cases', async () => {
        const prompt = require('../../shared/prompt');
        const llm = require('../../shared/llm-client');
        const jiraLM = require('../jira_link_manager');
        const fs = require('fs');

        prompt.ask.mockResolvedValueOnce('User story').mockResolvedValueOnce('Criteria');
        fs.readFileSync.mockReturnValue('You are a QA engineer.');

        baseContext.linkManager.listPreconditions = jest.fn().mockResolvedValue([]);

        llm.llmPrompt.mockResolvedValue([
            {
                title: 'Test 1',
                steps: ['Step 1'],
                expectedResult: 'Expected result one',
                preConditions: [{ type: 'create', summary: 'User must be logged in' }],
            },
            {
                title: 'Test 2',
                steps: ['Step 1'],
                expectedResult: 'Expected result two',
                preConditions: [{ type: 'create', summary: 'User must be logged in' }],
            },
        ]);
        jiraLM.matchPreconditionByDualThreshold.mockReturnValue({
            key: '__create__',
            summary: 'User must be logged in',
            matchType: 'create',
        });

        baseContext.linkManager.createPrecondition = jest.fn().mockResolvedValue('PC-NEW-1');

        const mod = require('./case18').default;
        await mod.handler(baseContext);

        /* Deduplicated: same summary → only one createPrecondition call */
        expect(jiraLM.matchPreconditionByDualThreshold).toHaveBeenCalledTimes(1);
        expect(baseContext.linkManager.createPrecondition).toHaveBeenCalledTimes(1);
    });

    it('records AI generation after successful test generation', async () => {
        const prompt = require('../../shared/prompt');
        const llm = require('../../shared/llm-client');
        const jiraLM = require('../jira_link_manager');
        const aiFeedback = require('../../shared/ai-feedback');
        const fs = require('fs');

        prompt.ask.mockResolvedValueOnce('User story text').mockResolvedValueOnce('Some criteria');
        fs.readFileSync.mockReturnValue('You are a QA engineer.');
        baseContext.linkManager.listPreconditions = jest.fn().mockResolvedValue([]);

        llm.llmPrompt.mockResolvedValue([
            {
                title: 'Generated Test',
                steps: ['Step 1'],
                expectedResult: 'Expected result',
                preConditions: [{ type: 'create', summary: 'Precondition A' }],
            },
        ]);
        jiraLM.matchPreconditionByDualThreshold.mockReturnValue({
            key: '__create__',
            summary: 'Precondition A',
            matchType: 'create',
        });
        baseContext.linkManager.createPrecondition = jest.fn().mockResolvedValue('PC-NEW-1');

        const mod = require('./case18').default;
        await mod.handler(baseContext);

        expect(aiFeedback.recordAiGeneration).toHaveBeenCalledWith(
            expect.objectContaining({
                promptVersion: 'v2',
                userStory: 'User story text',
                acceptanceCriteria: 'Some criteria',
                generatedTests: expect.arrayContaining([
                    expect.objectContaining({ title: 'Generated Test', stepCount: 1 }),
                ]),
            }),
        );
    });
});
