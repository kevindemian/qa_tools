jest.mock('../../shared/prompt', () => ({
    warn: jest.fn(),
    info: jest.fn(),
    ask: jest.fn().mockResolvedValue(''),
    askConfirm: jest.fn().mockResolvedValue(false),
}));

jest.mock('./test-execution-flow', () => ({
    offerTestExecutionAssociation: jest.fn().mockResolvedValue({ associated: false }),
    showResults: jest.fn().mockResolvedValue(undefined),
}));

import case13 from './case13';

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

describe('case13 — create test execution', () => {
    it('exports a handler function', () => {
        expect(case13).toBeDefined();
        expect(typeof case13.handler).toBe('function');
    });

    it('executes without error with basic context', async () => {
        const result = await case13.handler(mockContext as never);
        expect(result === undefined || result === true || result === false).toBe(true);
    });
});
