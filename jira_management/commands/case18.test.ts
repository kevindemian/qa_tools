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
}));

jest.mock('../../shared/logger', () => ({
    rootLogger: {
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

        fs.readFileSync.mockReturnValueOnce('You are a QA engineer.\n{{USER_STORY}}\n{{ACCEPTANCE_CRITERIA}}');

        llm.llmPrompt.mockResolvedValueOnce(
            '[{"title": "Login test", "steps": ["Enter user"], "expectedResult": "OK"}]',
        );

        const mod = require('./case18').default;
        await mod.handler(baseContext);

        expect(llm.llmPrompt).toHaveBeenCalledWith('main', '', expect.stringContaining('User wants to login'));
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

        fs.readFileSync.mockReturnValueOnce('template {{USER_STORY}}');

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
});
