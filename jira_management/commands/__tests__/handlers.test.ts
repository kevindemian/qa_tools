jest.mock('../../../shared/prompt', () => ({
    success: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    title: jest.fn(),
    divider: jest.fn(),
    prompt: jest.fn().mockReturnValue(''),
    confirm: jest.fn().mockReturnValue(false),
    smartPrompt: jest.fn().mockReturnValue('v2.0.0'),
    printError: jest.fn(),
    printSummary: jest.fn(),
    isQuiet: jest.fn().mockReturnValue(true),
    print: jest.fn(),
}));

jest.mock('../../../shared/state', () => ({
    load: jest.fn().mockReturnValue({}),
    update: jest.fn(),
}));

jest.mock('../../../shared/logger', () => ({
    rootLogger: {
        error: jest.fn(),
        child: jest.fn().mockReturnValue({ info: jest.fn(), error: jest.fn(), warn: jest.fn() }),
    },
}));

jest.mock('../../../shared/cli_base', () => ({
    sanitizeUrl: jest.fn((url) => url),
}));

const mockJiraResource = {
    getProjectId: jest.fn().mockResolvedValue('123'),
    getProjectVersions: jest.fn().mockResolvedValue([]),
    updateFixVersions: jest.fn().mockResolvedValue({}),
    getReleaseTasks: jest.fn().mockResolvedValue([]),
    moveCardsToDone: jest.fn().mockResolvedValue({}),
    releaseVersion: jest.fn().mockResolvedValue({}),
    axiosInstance: { get: jest.fn().mockResolvedValue({ status: 200 }), post: jest.fn().mockResolvedValue({}) },
};

const mockSessionContext = {
    inMemoryTasksId: [],
    inMemoryTasksText: [],
    sessionCounters: [],
    project_name: 'TEST',
    isBusy: false,
    results: [],
    lastOperation: '',
    pushHistory: jest.fn(),
    withBusy: jest.fn(async (fn) => fn()),
};

const baseContext = {
    jiraResource: mockJiraResource,
    jiraResourceXray: mockJiraResource,
    linkManager: {},
    linkManagerXray: {},
    csvResource: {},
    ctx: mockSessionContext,
    pushHistory: jest.fn(),
    printSessionSummary: jest.fn(),
    base_url: 'https://jira.test.com',
    sessionLog: { child: jest.fn().mockReturnValue({ info: jest.fn(), error: jest.fn() }) },
};

beforeEach(() => {
    jest.clearAllMocks();
});

describe('case02 — list versions', () => {
    it('calls getProjectId and getProjectVersions', async () => {
        const mod = require('../case02');
        await mod.handler(baseContext);
        expect(mockJiraResource.getProjectId).toHaveBeenCalledWith('TEST');
    });
});

describe('case04 — assign fixVersion', () => {
    it('returns true when cancelled', async () => {
        const prompt = require('../../../shared/prompt');
        prompt.confirm.mockReturnValueOnce(false);
        const mod = require('../case04');
        const result = await mod.handler(baseContext);
        expect(result).toBe(true);
    });
});

describe('case07 — close tasks', () => {
    it('returns true when user cancels', async () => {
        const prompt = require('../../../shared/prompt');
        prompt.confirm.mockReturnValueOnce(false);
        const mod = require('../case07');
        const result = await mod.handler(baseContext);
        expect(result).toBe(true);
    });
});

describe('case09 — switch project', () => {
    it('updates project name', async () => {
        const prompt = require('../../../shared/prompt');
        prompt.prompt.mockReturnValueOnce('NEWPROJ');
        const mod = require('../case09');
        mod.handler(baseContext);
        expect(mockSessionContext.project_name).toBe('NEWPROJ');
    });
});
