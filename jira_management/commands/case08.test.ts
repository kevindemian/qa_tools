jest.mock('../../shared/prompt', () => ({
    warn: jest.fn(),
    askConfirm: jest.fn().mockResolvedValue(false),
    ask: jest.fn().mockResolvedValue(''),
    printError: jest.fn(),
    printSummary: jest.fn(),
}));

import case08 from './case08';

const mockJiraResource = {
    releaseVersion: jest.fn().mockResolvedValue({}),
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

describe('case08 — release version', () => {
    it('exports a handler function', () => {
        expect(case08).toBeDefined();
        expect(typeof case08.handler).toBe('function');
    });

    it('executes without error with basic context', async () => {
        const result = await case08.handler(mockContext as never);
        expect(result === undefined || result === true || result === false).toBe(true);
    });
});
