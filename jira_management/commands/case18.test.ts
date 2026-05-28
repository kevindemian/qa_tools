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

jest.mock('fs');

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
    jiraResource: {},
    jiraResourceXray: {},
    linkManager: {},
    linkManagerXray: {},
    csvResource: {},
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

        llm.llmPrompt.mockResolvedValueOnce(
            '[{"title": "Login test with valid credentials", "steps": ["Enter valid user", "Enter valid password", "Click login"], "expectedResult": "User is redirected to dashboard and sees welcome message"}]',
        );

        const mod = require('./case18').default;
        await mod.handler(baseContext);

        expect(llm.llmPrompt).toHaveBeenCalledWith(
            'fast',
            expect.stringContaining('You are a QA engineer'),
            expect.stringContaining('User wants to login'),
            'case18',
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

    it('retries on invalid JSON and succeeds on second try', async () => {
        const prompt = require('../../shared/prompt');
        const llm = require('../../shared/llm-client');
        const fs = require('fs');

        prompt.ask.mockResolvedValueOnce('User wants to login').mockResolvedValueOnce('Must validate');
        fs.readFileSync.mockReturnValueOnce('You are a QA engineer.');

        const mock = jest
            .fn()
            .mockResolvedValueOnce('invalid json')
            .mockResolvedValueOnce(
                '[{"title": "Login test with valid credentials", "steps": ["Enter valid user"], "expectedResult": "User is redirected to dashboard"}]',
            );
        llm.llmPrompt.mockImplementation((...args: unknown[]) => mock(...args));

        const mod = require('./case18').default;
        await mod.handler(baseContext);

        expect(llm.llmPrompt).toHaveBeenCalledTimes(2);
        expect(baseContext.pushHistory).toHaveBeenCalledWith('ai-generate-tests', expect.any(String), 'ok');
    });

    it('23.14: prints error when retry is still invalid', async () => {
        const { llmPrompt } = require('../../shared/llm-client');
        const { printError } = require('../../shared/prompt');
        const prompt = require('../../shared/prompt');
        const fs = require('fs');

        prompt.ask.mockResolvedValueOnce('User wants to login').mockResolvedValueOnce('Must validate');
        fs.readFileSync.mockReturnValueOnce('You are a QA engineer.');

        llmPrompt.mockResolvedValueOnce('invalid json 1').mockResolvedValueOnce('invalid json 2');

        const mod = require('./case18').default;
        await mod.handler(baseContext);

        expect(printError).toHaveBeenCalledWith(
            'Falha ao gerar casos de teste com IA',
            expect.stringContaining('LLM retornou conteúdo inválido após retry'),
        );
    });
});
