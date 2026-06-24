import {
    createMockGitProvider,
    createMockJiraResource,
    createMockLinkManager,
} from '../shared/test-utils/factories/index.js';
import type { ParseResult } from '../shared/result_parser.js';
import type { ArtifactInfo } from '../shared/types.js';
import JiraClient from '../shared/jira-client.js';
import JiraLinkManager from '../jira_management/jira_link_manager.js';

// ── Shared mock functions ───────────────────────────────────────────────────
// These are referenced by vi.mock factories below. Must be declared before
// vi.mock calls (vi.mock is hoisted but factories are lazy-evaluated).

const mockGlobSync = vi.fn<(pattern: string) => string[]>();
const mockParseTestResults = vi.fn<(raw: string) => ParseResult>();
const mockMatchResultsToTests =
    vi.fn<(parsed: ParseResult, keys: string[]) => { matched: object[]; unmatched: object[] }>();
const mockCreateTestExecutionFromResults = vi.fn<(results: object, config: object) => Promise<object | null>>();
const mockPrompt = vi.fn<(message: string) => Promise<string>>();
const mockListPipelineArtifacts = vi.fn<(pipelineId: string | number) => Promise<ArtifactInfo[]>>();
const mockDownloadArtifact = vi.fn<(artifactId: string | number) => Promise<{ buffer: Buffer; filename: string }>>();
const mockAdmZipGetEntries = vi.fn<() => { entryName: string; isDirectory: boolean; getData: () => Buffer }[]>();
const mockLoadState = vi.fn<() => object>();
const mockReportsDir = vi.fn<() => string>();
const mockSaveParseResult = vi.fn<(project: string, result: ParseResult) => void>();

// ── Module mocks ─────────────────────────────────────────────────────────

vi.mock('../shared/deps', () => ({
    globSync: mockGlobSync,
    AdmZip: vi.fn(function () {
        return { getEntries: mockAdmZipGetEntries };
    }),
}));

vi.mock('../shared/config', () => {
    const cfg: Record<string, unknown> = {
        jiraBaseUrl: 'https://jira.example.com',
        jiraPersonalToken: 'token',
        jiraMode: 'server',
        xrayBaseUrl: 'https://xray.example.com',
        cypressProjectPath: '',
        getAllPrefixed: vi.fn(() => ({})),
        get: vi.fn((key: string) => cfg[key] as string),
    };
    return { __esModule: true, default: cfg };
});

vi.mock('../shared/prompt', () => ({
    warn: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    printError: vi.fn(),
    withSpinner: vi.fn((_label: string, fn: () => Promise<void>) => fn()),
    ask: mockPrompt,
}));

vi.mock('../shared/state', () => ({
    load: mockLoadState,
    update: vi.fn(),
    save: vi.fn(),
}));

vi.mock('../shared/logger', () => ({
    rootLogger: {
        child: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
        warn: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
    },
    Logger: vi.fn(),
}));

vi.mock('../shared/temp-dir', () => ({
    reportsDir: mockReportsDir,
}));

vi.mock('../shared/result_parser', () => ({
    parseTestResults: mockParseTestResults,
    // detectAndParseTestResults is an alias for parseTestResults
}));

vi.mock('../jira_management/result_reporter', () => ({
    matchResultsToTests: mockMatchResultsToTests,
    createTestExecutionFromResults: mockCreateTestExecutionFromResults,
}));

vi.mock('../shared/metrics', () => ({
    saveParseResult: mockSaveParseResult,
}));

vi.mock('../shared/jira-client', () => ({
    __esModule: true,
    default: vi.fn(),
}));

vi.mock('../jira_management/jira_link_manager', () => ({
    __esModule: true,
    default: vi.fn(),
}));

vi.mock('adm-zip', () => ({
    default: vi.fn().mockImplementation(() => ({
        getEntries: mockAdmZipGetEntries,
    })),
}));

// ── Provider mock ─────────────────────────────────────────────────────────

const mockProvider = createMockGitProvider({
    listPipelineArtifacts: mockListPipelineArtifacts,
    downloadArtifact: mockDownloadArtifact,
});

// ── Module under test ─────────────────────────────────────────────────────

type TestResultsModule = typeof import('./test-results.js');
let mod: TestResultsModule;

beforeAll(async () => {
    mod = (await import('./test-results.js'));
});

beforeEach(() => {
    vi.clearAllMocks();
    mockPrompt.mockResolvedValue('');
    mockLoadState.mockReturnValue({ lastCypressPath: '' });
    mockReportsDir.mockReturnValue('/tmp/reports');
    mockGlobSync.mockReturnValue([]);
    mockAdmZipGetEntries.mockReturnValue([]);
});

// ── _jiraEnv ─────────────────────────────────────────────────────────────

describe('_JiraEnv', () => {
    it('returns jira config when all vars are set', () => {
        const result = mod._jiraEnv();

        expect(result).toStrictEqual({
            base: 'https://jira.example.com',
            token: 'token',
            xray: 'https://xray.example.com',
            mode: 'server',
        });
    });
});

// ── _resolveGlob ─────────────────────────────────────────────────────────

describe('_ResolveGlob', () => {
    it('returns resolved path when glob matches', () => {
        mockGlobSync.mockReturnValueOnce(['/tmp/mapping.json']);
        const result = mod._resolveGlob('/tmp/*.json');

        expect(result).toBe('/tmp/mapping.json');
    });

    it('returns null when no match', () => {
        mockGlobSync.mockReturnValueOnce([]);
        const result = mod._resolveGlob('/nonexistent/*.json');

        expect(result).toBeNull();
    });

    it('returns null when glob throws', () => {
        mockGlobSync.mockImplementationOnce(() => {
            throw new Error('bad pattern');
        });
        const result = mod._resolveGlob('[');

        expect(result).toBeNull();
    });
});

// ── downloadTestArtifacts ────────────────────────────────────────────────

describe('DownloadTestArtifacts', () => {
    it('returns parsed results when zip contains valid mochawesome.json', async () => {expect.hasAssertions();

        mockListPipelineArtifacts.mockResolvedValue([{ id: 1, name: 'mochawesome-report' }]);
        mockDownloadArtifact.mockResolvedValue({ buffer: Buffer.from(''), filename: 'artifact.zip' });
        mockAdmZipGetEntries.mockReturnValue([
            {
                entryName: 'mochawesome.json',
                isDirectory: false,
                getData: () => Buffer.from(JSON.stringify({ results: [] })),
            },
        ]);
        const parseResult: ParseResult = {
            tests: [{ title: 'test1', state: 'passed', duration: 100 }],
            stats: { passed: 1, failed: 0, skipped: 0, total: 1, duration: 100 },
        };
        mockParseTestResults.mockReturnValue(parseResult);

        const result = await mod.downloadTestArtifacts(mockProvider, '1');

        expect(result).toStrictEqual(parseResult);
        expect(mockListPipelineArtifacts).toHaveBeenCalledWith('1');
        expect(mockDownloadArtifact).toHaveBeenCalledWith(1);
        expect(mockParseTestResults).toHaveBeenCalled();
    });

    it('returns parsed results when zip contains valid ctrf.json', async () => {expect.hasAssertions();

        mockListPipelineArtifacts.mockResolvedValue([{ id: 1, name: 'test-results' }]);
        mockDownloadArtifact.mockResolvedValue({ buffer: Buffer.from(''), filename: 'results.zip' });
        mockAdmZipGetEntries.mockReturnValue([
            {
                entryName: 'ctrf-report/ctrf.json',
                isDirectory: false,
                getData: () =>
                    Buffer.from(
                        JSON.stringify({
                            results: {
                                tests: [],
                                summary: {
                                    tests: 0,
                                    passed: 0,
                                    failed: 0,
                                    skipped: 0,
                                    pending: 0,
                                    other: 0,
                                    start: 0,
                                    stop: 0,
                                },
                            },
                        }),
                    ),
            },
        ]);
        const parseResult: ParseResult = {
            tests: [{ title: 'test1', state: 'passed', duration: 100 }],
            stats: { passed: 1, failed: 0, skipped: 0, total: 1, duration: 100 },
        };
        mockParseTestResults.mockReturnValue(parseResult);

        const result = await mod.downloadTestArtifacts(mockProvider, '1');

        expect(result).toStrictEqual(parseResult);
        expect(mockParseTestResults).toHaveBeenCalled();
    });

    it('returns null when no artifacts found in pipeline', async () => {expect.hasAssertions();

        mockListPipelineArtifacts.mockResolvedValue([]);

        const result = await mod.downloadTestArtifacts(mockProvider, '1');

        expect(result).toBeNull();
        expect(mockDownloadArtifact).not.toHaveBeenCalled();
    });

    it('returns null when download fails', async () => {expect.hasAssertions();

        mockListPipelineArtifacts.mockResolvedValue([{ id: 1, name: 'artifact' }]);
        mockDownloadArtifact.mockRejectedValue(new Error('Download error'));

        const result = await mod.downloadTestArtifacts(mockProvider, '1');

        expect(result).toBeNull();
    });

    it('returns null when no result file (ctrf.json / mochawesome.json) found in zip', async () => {expect.hasAssertions();

        mockListPipelineArtifacts.mockResolvedValue([{ id: 1, name: 'mochawesome-report' }]);
        mockDownloadArtifact.mockResolvedValue({ buffer: Buffer.from(''), filename: 'artifact.zip' });
        mockAdmZipGetEntries.mockReturnValue([
            {
                entryName: 'some-other-file.txt',
                isDirectory: false,
                getData: () => Buffer.from(''),
            },
        ]);

        const result = await mod.downloadTestArtifacts(mockProvider, '1');

        expect(result).toBeNull();
    });

    it('returns null when JSON parse fails', async () => {expect.hasAssertions();

        mockListPipelineArtifacts.mockResolvedValue([{ id: 1, name: 'mochawesome-report' }]);
        mockDownloadArtifact.mockResolvedValue({ buffer: Buffer.from(''), filename: 'artifact.zip' });
        mockAdmZipGetEntries.mockReturnValue([
            {
                entryName: 'mochawesome.json',
                isDirectory: false,
                getData: () => Buffer.from('not valid json'),
            },
        ]);

        const result = await mod.downloadTestArtifacts(mockProvider, '1');

        expect(result).toBeNull();
    });

    it('returns null when report has no tests', async () => {expect.hasAssertions();

        mockListPipelineArtifacts.mockResolvedValue([{ id: 1, name: 'mochawesome-report' }]);
        mockDownloadArtifact.mockResolvedValue({ buffer: Buffer.from(''), filename: 'artifact.zip' });
        mockAdmZipGetEntries.mockReturnValue([
            {
                entryName: 'mochawesome.json',
                isDirectory: false,
                getData: () => Buffer.from(JSON.stringify({ results: [] })),
            },
        ]);
        mockParseTestResults.mockReturnValue({
            tests: [],
            stats: { passed: 0, failed: 0, skipped: 0, total: 0, duration: 0 },
        });

        const result = await mod.downloadTestArtifacts(mockProvider, '1');

        expect(result).toBeNull();
    });
});

// ── parseTestResults ─────────────────────────────────────────────────────

describe('ParseTestResults', () => {
    it('returns matched results with csvName when mapping is valid', async () => {expect.hasAssertions();

        mockMatchResultsToTests.mockReturnValue({
            matched: [{ key: 'TEST-1', title: 'test1', status: 'passed', duration: 100 }],
            unmatched: [],
        });
        mockPrompt.mockResolvedValue('/cypress/cypress-jira-mapping.json');

        const parsed: ParseResult = {
            tests: [{ title: 'test1', state: 'passed', duration: 100 }],
            stats: { passed: 1, failed: 0, skipped: 0, total: 1, duration: 100 },
        };

        const result = await mod.parseTestResults(parsed);

        expect(result).toStrictEqual({
            matched: [{ key: 'TEST-1', title: 'test1', status: 'passed', duration: 100 }],
            unmatched: [],
            csvName: 'cypress',
        });
        expect(mockMatchResultsToTests).toHaveBeenCalled();
    });

    it('returns null when mapping path is empty', async () => {expect.hasAssertions();

        mockPrompt.mockResolvedValue('   ');
        const parsed: ParseResult = {
            tests: [],
            stats: { passed: 0, failed: 0, skipped: 0, total: 0, duration: 0 },
        };

        const result = await mod.parseTestResults(parsed);

        expect(result).toBeNull();
        expect(mockMatchResultsToTests).not.toHaveBeenCalled();
    });

    it('resolves glob pattern in mapping path', async () => {expect.hasAssertions();

        mockMatchResultsToTests.mockReturnValue({
            matched: [{ key: 'T1', title: 'test1', status: 'passed', duration: 0 }],
            unmatched: [],
        });
        mockGlobSync.mockReturnValue(['/some/pattern/pattern-jira-mapping.json']);
        mockPrompt.mockResolvedValue('/some/pattern/*-mapping.json');

        const parsed: ParseResult = {
            tests: [{ title: 'test1', state: 'passed', duration: 0 }],
            stats: { passed: 1, failed: 0, skipped: 0, total: 1, duration: 0 },
        };

        const result = await mod.parseTestResults(parsed);

        expect(mockGlobSync).toHaveBeenCalledWith('/some/pattern/*-mapping.json');
        expect(result?.csvName).toBe('pattern');
    });
});

// ── createTestExecution ─────────────────────────────────────────────────

describe('CreateTestExecution', () => {
    it('creates test execution and pushes success history', async () => {expect.hasAssertions();

        mockCreateTestExecutionFromResults.mockResolvedValue({
            key: 'TE-123',
            summary: 'Test Execution Summary',
            passed: 5,
            failed: 2,
            skipped: 1,
        });
        const pushHistory = vi.fn();

        await mod.createTestExecution({
            matched: [{ key: 'T1', title: 'test1', status: 'passed', duration: 100 }],
            csvName: 'my-tests',
            jiraResource: createMockJiraResource({
                baseUrl: 'https://jira.example.com/rest/api/2',
            }),
            linkManager: createMockLinkManager(),
            jiraBaseUrl: 'https://jira.example.com',
            projectName: 'PROJ',
            pipelineId: '123',
            branch: 'main',
            currentProvider: 'gitlab',
            pushHistory,
        });

        expect(mockCreateTestExecutionFromResults).toHaveBeenCalled();
        expect(pushHistory).toHaveBeenCalledWith('resultados', expect.stringContaining('TE-123'), 'ok');
    });

    it('handles error, pushes error history, and re-throws', async () => {expect.hasAssertions();

        mockCreateTestExecutionFromResults.mockRejectedValue(new Error('Creation failed'));
        const pushHistory = vi.fn();

        await expect(
            mod.createTestExecution({
                matched: [],
                csvName: 'test',
                jiraResource: createMockJiraResource({ baseUrl: '' }),
                linkManager: createMockLinkManager(),
                jiraBaseUrl: '',
                projectName: 'PROJ',
                pipelineId: '1',
                branch: 'main',
                currentProvider: 'github',
                pushHistory,
            }),
        ).rejects.toThrow('Creation failed');

        expect(pushHistory).toHaveBeenCalledWith('resultados', 'erro', 'error');
    });
});

// ── collectTestResults ──────────────────────────────────────────────────

describe('CollectTestResults', () => {
    it('downloads, parses, and creates test execution on full success', async () => {expect.hasAssertions();

        mockListPipelineArtifacts.mockResolvedValue([{ id: 1, name: 'mochawesome-report' }]);
        mockDownloadArtifact.mockResolvedValue({ buffer: Buffer.from(''), filename: 'artifact.zip' });
        mockAdmZipGetEntries.mockReturnValue([
            {
                entryName: 'mochawesome.json',
                isDirectory: false,
                getData: () => Buffer.from(JSON.stringify({ results: [] })),
            },
        ]);
        mockParseTestResults.mockReturnValue({
            tests: [{ title: 'test1', state: 'passed', duration: 100 }],
            stats: { passed: 1, failed: 0, skipped: 0, total: 1, duration: 100 },
        });
        mockMatchResultsToTests.mockReturnValue({
            matched: [{ key: 'TEST-1', title: 'test1', status: 'passed', duration: 100 }],
            unmatched: [],
        });
        mockPrompt.mockResolvedValue('/cypress/cypress-jira-mapping.json');
        mockGlobSync.mockReturnValue(['/cypress/cypress-jira-mapping.json']);
        mockCreateTestExecutionFromResults.mockResolvedValue({
            key: 'TE-123',
            summary: 'Test Execution',
            passed: 1,
            failed: 0,
            skipped: 0,
        });
        const pushHistory = vi.fn();

        const mockJiraRes = {} as JiraClient;
        const mockLinkMgr = {} as JiraLinkManager;

        await mod.collectTestResults({
            m: mockProvider,
            pipelineId: '1',
            branch: 'main',
            projectName: 'PROJ',
            currentProvider: 'gitlab',
            pushHistory,
            jiraResource: mockJiraRes,
            linkManager: mockLinkMgr,
            jiraBaseUrl: 'https://jira.example.com',
        });

        expect(mockListPipelineArtifacts).toHaveBeenCalled();
        expect(mockDownloadArtifact).toHaveBeenCalled();
        expect(mockSaveParseResult).toHaveBeenCalledWith('PROJ', {
            tests: [{ title: 'test1', state: 'passed', duration: 100 }],
            stats: { passed: 1, failed: 0, skipped: 0, total: 1, duration: 100 },
        });
        expect(mockMatchResultsToTests).toHaveBeenCalled();
        expect(mockCreateTestExecutionFromResults).toHaveBeenCalled();
        expect(pushHistory).toHaveBeenCalled();
    });

    it('returns early when downloadTestArtifacts returns null', async () => {expect.hasAssertions();

        mockListPipelineArtifacts.mockResolvedValue([]);
        const pushHistory = vi.fn();

        const mockJiraRes = {} as JiraClient;
        const mockLinkMgr = {} as JiraLinkManager;

        await mod.collectTestResults({
            m: mockProvider,
            pipelineId: '1',
            branch: 'main',
            projectName: 'PROJ',
            currentProvider: 'gitlab',
            pushHistory,
            jiraResource: mockJiraRes,
            linkManager: mockLinkMgr,
            jiraBaseUrl: 'https://jira.example.com',
        });

        expect(mockMatchResultsToTests).not.toHaveBeenCalled();
        expect(mockCreateTestExecutionFromResults).not.toHaveBeenCalled();
        expect(pushHistory).not.toHaveBeenCalled();
    });

    it('returns early when parseTestResults returns null', async () => {expect.hasAssertions();

        mockListPipelineArtifacts.mockResolvedValue([{ id: 1, name: 'mochawesome-report' }]);
        mockDownloadArtifact.mockResolvedValue({ buffer: Buffer.from(''), filename: 'artifact.zip' });
        mockAdmZipGetEntries.mockReturnValue([
            {
                entryName: 'mochawesome.json',
                isDirectory: false,
                getData: () => Buffer.from(JSON.stringify({ results: [] })),
            },
        ]);
        mockParseTestResults.mockReturnValue({
            tests: [{ title: 'test1', state: 'passed', duration: 100 }],
            stats: { passed: 1, failed: 0, skipped: 0, total: 1, duration: 100 },
        });
        // mockPrompt default (empty string) makes parseTestResults return null
        const pushHistory = vi.fn();

        const mockJiraRes = {} as JiraClient;
        const mockLinkMgr = {} as JiraLinkManager;

        await mod.collectTestResults({
            m: mockProvider,
            pipelineId: '1',
            branch: 'main',
            projectName: 'PROJ',
            currentProvider: 'gitlab',
            pushHistory,
            jiraResource: mockJiraRes,
            linkManager: mockLinkMgr,
            jiraBaseUrl: 'https://jira.example.com',
        });

        expect(mockSaveParseResult).toHaveBeenCalledWith('PROJ', {
            tests: [{ title: 'test1', state: 'passed', duration: 100 }],
            stats: { passed: 1, failed: 0, skipped: 0, total: 1, duration: 100 },
        });
        expect(mockMatchResultsToTests).not.toHaveBeenCalled();
        expect(mockCreateTestExecutionFromResults).not.toHaveBeenCalled();
        expect(pushHistory).not.toHaveBeenCalled();
    });
});
