jest.mock('../../shared/prompt', () => ({
    success: jest.fn(),
    warn: jest.fn(),
    ask: jest.fn().mockResolvedValue(''),
    printError: jest.fn(),
}));

import case05 from './case05';

const mockJiraResource = {
    getReleaseTasks: jest.fn().mockResolvedValue([]),
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
        packageManager: { updateReleaseNotes: jest.fn(), updateVersion: jest.fn() },
    },
    pushHistory: jest.fn(),
    printSessionSummary: jest.fn(),
    base_url: 'https://jira.test.com',
    sessionLog: { child: jest.fn().mockReturnValue({ info: jest.fn(), error: jest.fn(), warn: jest.fn() }) },
};

beforeEach(() => {
    jest.clearAllMocks();
});

describe('case05 — update package version', () => {
    it('exports a handler function', () => {
        expect(case05).toBeDefined();
        expect(typeof case05.handler).toBe('function');
    });

    it('executes without error with basic context', async () => {
        const result = await case05.handler(mockContext as never);
        expect(result === undefined || result === true || result === false).toBe(true);
    });
});
