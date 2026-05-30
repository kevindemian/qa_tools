jest.mock('../../shared/prompt', () => ({
    warn: jest.fn(),
    askConfirm: jest.fn().mockResolvedValue(false),
    ask: jest.fn().mockResolvedValue(''),
    printSummary: jest.fn(),
    printError: jest.fn(),
}));

jest.mock('../../shared/logger', () => ({
    rootLogger: {
        error: jest.fn(),
        child: jest.fn().mockReturnValue({ info: jest.fn(), error: jest.fn(), warn: jest.fn() }),
    },
}));

import case07 from './case07';

const mockJiraResource = {
    getReleaseTasks: jest.fn().mockResolvedValue([]),
    moveCardsToDone: jest.fn().mockResolvedValue({}),
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

describe('case07 — close tasks', () => {
    it('exports a handler function', () => {
        expect(case07).toBeDefined();
        expect(typeof case07.handler).toBe('function');
    });

    it('executes without error with basic context', async () => {
        const result = await case07.handler(mockContext as never);
        expect(result === undefined || result === true || result === false).toBe(true);
    });
});
