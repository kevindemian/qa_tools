jest.mock('../../shared/prompt', () => ({
    ask: jest.fn().mockResolvedValue(''),
    warn: jest.fn(),
    success: jest.fn(),
}));

jest.mock('../../shared/state', () => ({
    load: jest.fn().mockReturnValue({}),
    update: jest.fn(),
}));

jest.mock('../../shared/config', () => ({
    getInstance: jest.fn().mockReturnValue({ get: jest.fn() }),
}));

jest.mock('../create_tests', () => ({
    createTestsFromCsv: jest.fn(),
    createTestsFromJson: jest.fn(),
    createTestExecutionWithLinks: jest.fn(),
}));

jest.mock('./test-execution-flow', () => ({
    offerTestExecutionAssociation: jest.fn().mockResolvedValue({ associated: false }),
    showResults: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('fs', () => ({
    existsSync: jest.fn().mockReturnValue(true),
    readFileSync: jest.fn(),
}));

import case15 from './case15';

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

describe('case15 — create tests from JSON', () => {
    it('exports a handler function', () => {
        expect(case15).toBeDefined();
        expect(typeof case15.handler).toBe('function');
    });

    it('executes without error with basic context', async () => {
        const result = await case15.handler(mockContext as never);
        expect(result === undefined || result === true || result === false).toBe(true);
    });
});
