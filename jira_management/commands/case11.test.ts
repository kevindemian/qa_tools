jest.mock('../../shared/prompt', () => ({
    success: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    ask: jest.fn().mockResolvedValue(''),
}));

jest.mock('fs', () => ({
    copyFileSync: jest.fn(),
    existsSync: jest.fn().mockReturnValue(true),
}));

import case11 from './case11';

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
    },
    pushHistory: jest.fn(),
    printSessionSummary: jest.fn(),
    base_url: 'https://jira.test.com',
    sessionLog: { child: jest.fn().mockReturnValue({ info: jest.fn(), error: jest.fn(), warn: jest.fn() }) },
};

beforeEach(() => {
    jest.clearAllMocks();
});

describe('case11 — generate template', () => {
    it('exports a handler function', () => {
        expect(case11).toBeDefined();
        expect(typeof case11.handler).toBe('function');
    });

    it('executes without error with basic context', async () => {
        const result = await case11.handler(mockContext as never);
        expect(result === undefined || result === true || result === false).toBe(true);
    });
});
