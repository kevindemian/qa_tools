jest.mock('../../shared/prompt', () => ({
    ask: jest.fn().mockResolvedValue(''),
}));

jest.mock('../../shared/jira-helper', () => ({
    safeJiraCall: jest.fn(),
}));

import case06 from './case06';

const mockJiraResource = {
    checkReleaseTasksStatus: jest.fn().mockResolvedValue(undefined),
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

describe('case06 — check release status', () => {
    it('exports a handler function', () => {
        expect(case06).toBeDefined();
        expect(typeof case06.handler).toBe('function');
    });

    it('executes without error with basic context', async () => {
        const result = await case06.handler(mockContext as never);
        expect(result === undefined || result === true || result === false).toBe(true);
    });
});
