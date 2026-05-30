jest.mock('../../shared/prompt', () => ({
    success: jest.fn(),
    ask: jest.fn().mockResolvedValue(''),
}));

import case10 from './case10';

const mockContext: Record<string, unknown> = {
    jiraResource: {},
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
        createPackageManager: jest.fn().mockReturnValue({ updateReleaseNotes: jest.fn(), updateVersion: jest.fn() }),
    },
    pushHistory: jest.fn(),
    printSessionSummary: jest.fn(),
    base_url: 'https://jira.test.com',
    sessionLog: { child: jest.fn().mockReturnValue({ info: jest.fn(), error: jest.fn(), warn: jest.fn() }) },
};

beforeEach(() => {
    jest.clearAllMocks();
});

describe('case10 — set directory', () => {
    it('exports a handler function', () => {
        expect(case10).toBeDefined();
        expect(typeof case10.handler).toBe('function');
    });

    it('executes without error with basic context', async () => {
        const result = await case10.handler(mockContext as never);
        expect(result === undefined || result === true || result === false).toBe(true);
    });
});
