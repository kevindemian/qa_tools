jest.mock('../../shared/prompt', () => ({
    success: jest.fn(),
    warn: jest.fn(),
    ask: jest.fn().mockResolvedValue(''),
}));

jest.mock('../../shared/state', () => ({
    load: jest.fn().mockReturnValue({}),
    update: jest.fn(),
}));

import case09 from './case09';

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

describe('case09 — switch project', () => {
    it('exports a handler function', () => {
        expect(case09).toBeDefined();
        expect(typeof case09.handler).toBe('function');
    });

    it('executes without error with basic context', async () => {
        const result = await case09.handler(mockContext as never);
        expect(result === undefined || result === true || result === false).toBe(true);
    });
});
