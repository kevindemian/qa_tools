jest.mock('../../shared/prompt', () => ({
    success: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    title: jest.fn(),
    divider: jest.fn(),
    ask: jest.fn().mockResolvedValue(''),
    askConfirm: jest.fn().mockResolvedValue(false),
    printError: jest.fn(),
    printSummary: jest.fn(),
    askFilePath: jest.fn().mockResolvedValue(''),
}));

jest.mock('../../shared/logger', () => ({
    rootLogger: {
        error: jest.fn(),
        child: jest.fn().mockReturnValue({ info: jest.fn(), error: jest.fn(), warn: jest.fn() }),
    },
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

import case01 from './case01';

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

describe('case01 — create tests from CSV', () => {
    it('exports a handler function', () => {
        expect(case01).toBeDefined();
        expect(typeof case01.handler).toBe('function');
    });

    it('executes without error with basic context', async () => {
        const result = await case01.handler(mockContext as never);
        expect(result === undefined || result === true || result === false).toBe(true);
    });
});
