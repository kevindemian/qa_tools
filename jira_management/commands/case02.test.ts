jest.mock('../../shared/prompt', () => ({
    info: jest.fn(),
    error: jest.fn(),
    divider: jest.fn(),
    printError: jest.fn(),
}));

jest.mock('../../shared/logger', () => ({
    rootLogger: {
        error: jest.fn(),
        child: jest.fn().mockReturnValue({ info: jest.fn(), error: jest.fn(), warn: jest.fn() }),
    },
}));

import case02 from './case02';

const mockJiraResource = {
    getProjectId: jest.fn().mockResolvedValue('123'),
    getProjectVersions: jest.fn().mockResolvedValue([]),
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

describe('case02 — list versions', () => {
    it('exports a handler function', () => {
        expect(case02).toBeDefined();
        expect(typeof case02.handler).toBe('function');
    });

    it('executes without error with basic context', async () => {
        const result = await case02.handler(mockContext as never);
        expect(result === undefined || result === true || result === false).toBe(true);
    });
});
