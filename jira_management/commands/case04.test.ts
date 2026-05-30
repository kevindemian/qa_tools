jest.mock('../../shared/prompt', () => ({
    print: jest.fn(),
    success: jest.fn(),
    warn: jest.fn(),
    title: jest.fn(),
    ask: jest.fn().mockResolvedValue(''),
    askConfirm: jest.fn().mockResolvedValue(false),
    printError: jest.fn(),
    printSummary: jest.fn(),
}));

jest.mock('../../shared/logger', () => ({
    rootLogger: {
        error: jest.fn(),
        child: jest.fn().mockReturnValue({ info: jest.fn(), error: jest.fn(), warn: jest.fn() }),
    },
}));

import case04 from './case04';

const mockJiraResource = {
    updateFixVersions: jest.fn().mockResolvedValue({}),
    postJiraResource: jest.fn().mockResolvedValue({}),
};

const mockContext: Record<string, unknown> = {
    jiraResource: mockJiraResource,
    jiraResourceXray: {},
    linkManager: {},
    linkManagerXray: {},
    csvResource: {},
    ctx: {
        project_name: 'TEST',
        inMemoryTasksId: [],
        inMemoryTasksText: [],
        sessionCounters: [],
        isBusy: false,
        results: [],
    },
    pushHistory: jest.fn(),
    printSessionSummary: jest.fn(),
    base_url: 'https://jira.test.com',
    sessionLog: { child: jest.fn().mockReturnValue({ info: jest.fn(), error: jest.fn(), warn: jest.fn() }) },
};

beforeEach(() => {
    jest.clearAllMocks();
});

describe('case04 — assign fixVersion', () => {
    it('exports a handler function', () => {
        expect(case04).toBeDefined();
        expect(typeof case04.handler).toBe('function');
    });

    it('executes without error with basic context', async () => {
        const result = await case04.handler(mockContext as never);
        expect(result === undefined || result === true || result === false).toBe(true);
    });
});
