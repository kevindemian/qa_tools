jest.mock('../../shared/prompt', () => ({
    title: jest.fn(),
    printSummary: jest.fn(),
    divider: jest.fn(),
    badge: jest.fn().mockReturnValue(''),
    tableView: jest.fn(),
    info: jest.fn(),
    printError: jest.fn(),
}));

jest.mock('../../shared/logger', () => ({
    rootLogger: {
        error: jest.fn(),
        child: jest.fn().mockReturnValue({ info: jest.fn(), error: jest.fn(), warn: jest.fn() }),
    },
}));

jest.mock('../../shared/cli_base', () => ({
    sanitizeUrl: jest.fn((url: string) => url),
}));

jest.mock('../../shared/palette', () => ({
    palette: { red: jest.fn(), green: jest.fn(), yellow: jest.fn() },
}));

jest.mock('../../shared/output', () => ({
    defaultOutput: { print: jest.fn() },
}));

jest.mock('../../shared/metrics', () => ({
    loadMetrics: jest.fn().mockReturnValue({ runs: [] }),
}));

import case12 from './case12';

const mockJiraResource = {
    axiosInstance: {
        get: jest.fn().mockResolvedValue({ status: 200 }),
        post: jest.fn().mockResolvedValue({}),
    },
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

describe('case12 — diagnostic connection', () => {
    it('exports a handler function', () => {
        expect(case12).toBeDefined();
        expect(typeof case12.handler).toBe('function');
    });

    it('executes without error with basic context', async () => {
        const result = await case12.handler(mockContext as never);
        expect(result === undefined || result === true || result === false).toBe(true);
    });
});
