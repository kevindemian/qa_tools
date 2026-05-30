jest.mock('../../shared/prompt', () => ({
    success: jest.fn(),
    warn: jest.fn(),
    ask: jest.fn().mockResolvedValue(''),
}));

jest.mock('../../shared/state', () => ({
    load: jest.fn().mockReturnValue({}),
    update: jest.fn(),
}));

import case14 from './case14';

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

describe('case14 — config Cypress directory', () => {
    it('exports a handler function', () => {
        expect(case14).toBeDefined();
        expect(typeof case14.handler).toBe('function');
    });

    it('executes without error with basic context', async () => {
        const result = await case14.handler(mockContext as never);
        expect(result === undefined || result === true || result === false).toBe(true);
    });
});
