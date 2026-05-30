jest.mock('../../shared/prompt', () => ({
    warn: jest.fn(),
    ask: jest.fn().mockResolvedValue(''),
}));

jest.mock('../../shared/jira-helper', () => ({
    safeJiraCall: jest.fn(),
}));

import case03 from './case03';

const mockJiraResource = {
    getProjectId: jest.fn().mockResolvedValue('123'),
    createVersion: jest.fn().mockResolvedValue({}),
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

describe('case03 — create version', () => {
    it('exports a handler function', () => {
        expect(case03).toBeDefined();
        expect(typeof case03.handler).toBe('function');
    });

    it('executes without error with basic context', async () => {
        const result = await case03.handler(mockContext as never);
        expect(result === undefined || result === true || result === false).toBe(true);
    });
});
