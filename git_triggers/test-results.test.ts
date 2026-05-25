import { jest } from '@jest/globals';
import type { GitProvider } from '../shared/types';
import type { ParseResult } from '../shared/result_parser';

// ── Shared mock functions ───────────────────────────────────────────────────
// These are referenced by jest.mock factories below. Must be declared before
// jest.mock calls (jest.mock is hoisted but factories are lazy-evaluated).

/* eslint-disable @typescript-eslint/no-explicit-any -- jest.fn mocks */
const mockGlobSync = jest.fn<any>();
const mockParseMochawesome = jest.fn<any>();
const mockMatchResultsToTests = jest.fn<any>();
const mockCreateTestExecutionFromResults = jest.fn<any>();
const mockPrompt = jest.fn<any>();
const mockListPipelineArtifacts = jest.fn<any>();
const mockDownloadArtifact = jest.fn<any>();
const mockAdmZipGetEntries = jest.fn<any>();
const mockLoadState = jest.fn<any>();
/* eslint-enable @typescript-eslint/no-explicit-any */

// ── Module mocks ─────────────────────────────────────────────────────────

jest.mock('glob', () => ({ sync: mockGlobSync }));

jest.mock('../shared/config', () => {
    const cfg: Record<string, unknown> = {
        jiraBaseUrl: 'https://jira.example.com',
        jiraPersonalToken: 'token',
        xrayBaseUrl: 'https://xray.example.com',
        cypressProjectPath: '',
        getAllPrefixed: jest.fn(() => ({})),
        quiet: false,
    };
    return { __esModule: true, default: cfg };
});

jest.mock('../shared/prompt', () => ({
    warn: jest.fn(),
    info: jest.fn(),
    success: jest.fn(),
    printError: jest.fn(),
    withSpinner: jest.fn((_label: string, fn: () => Promise<unknown>) => fn()),
    ask: mockPrompt,
}));

jest.mock('../shared/state', () => ({
    load: mockLoadState,
    update: jest.fn(),
    save: jest.fn(),
}));

jest.mock('../shared/logger', () => ({
    rootLogger: {
        child: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() })),
        warn: jest.fn(),
        error: jest.fn(),
        info: jest.fn(),
    },
    Logger: jest.fn(),
}));

jest.mock('../shared/result_parser', () => ({
    parseMochawesome: mockParseMochawesome,
}));

jest.mock('../jira_management/result_reporter', () => ({
    matchResultsToTests: mockMatchResultsToTests,
    createTestExecutionFromResults: mockCreateTestExecutionFromResults,
}));

jest.mock('../jira_management/jira_resource', () => ({
    __esModule: true,
    default: jest.fn(),
}));

jest.mock('../jira_management/jira_link_manager', () => ({
    __esModule: true,
    default: jest.fn(),
}));

jest.mock('adm-zip', () => {
    const mockAdmZip = jest.fn().mockImplementation(() => ({
        getEntries: mockAdmZipGetEntries,
    }));
    return mockAdmZip;
});

// ── Provider mock ─────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- provider mock
const mockProvider: Record<string, jest.Mock<any>> = {
    listPipelineArtifacts: mockListPipelineArtifacts,
    downloadArtifact: mockDownloadArtifact,
};

// ── Module under test ─────────────────────────────────────────────────────

type TestResultsModule = typeof import('./test-results');
let mod: TestResultsModule;

beforeAll(() => {
    mod = require('./test-results') as TestResultsModule;
});

beforeEach(() => {
    jest.clearAllMocks();
    mockPrompt.mockResolvedValue('');
    mockLoadState.mockReturnValue({ lastCypressPath: '' });
    mockGlobSync.mockReturnValue([]);
    mockAdmZipGetEntries.mockReturnValue([]);
});

// ── _jiraEnv ─────────────────────────────────────────────────────────────

describe('_jiraEnv', () => {
    it('returns jira config when all vars are set', () => {
        const result = mod._jiraEnv();
        expect(result).toEqual({
            base: 'https://jira.example.com',
            token: 'token',
            xray: 'https://xray.example.com',
        });
    });
});

// ── _resolveGlob ─────────────────────────────────────────────────────────

describe('_resolveGlob', () => {
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

describe('downloadTestArtifacts', () => {
    it('returns parsed results when artifact found and zip contains valid mochawesome.json', async () => {
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
        mockParseMochawesome.mockReturnValue(parseResult);

        const result = await mod.downloadTestArtifacts(mockProvider as unknown as GitProvider, '1');

        expect(result).toEqual(parseResult);
        expect(mockListPipelineArtifacts).toHaveBeenCalledWith('1');
        expect(mockDownloadArtifact).toHaveBeenCalledWith(1);
        expect(mockParseMochawesome).toHaveBeenCalled();
    });

    it('returns null when no artifacts found in pipeline', async () => {
        mockListPipelineArtifacts.mockResolvedValue([]);

        const result = await mod.downloadTestArtifacts(mockProvider as unknown as GitProvider, '1');

        expect(result).toBeNull();
        expect(mockDownloadArtifact).not.toHaveBeenCalled();
    });

    it('returns null when download fails', async () => {
        mockListPipelineArtifacts.mockResolvedValue([{ id: 1, name: 'artifact' }]);
        mockDownloadArtifact.mockRejectedValue(new Error('Download error'));

        const result = await mod.downloadTestArtifacts(mockProvider as unknown as GitProvider, '1');

        expect(result).toBeNull();
    });

    it('returns null when mochawesome.json is missing in zip', async () => {
        mockListPipelineArtifacts.mockResolvedValue([{ id: 1, name: 'mochawesome-report' }]);
        mockDownloadArtifact.mockResolvedValue({ buffer: Buffer.from(''), filename: 'artifact.zip' });
        mockAdmZipGetEntries.mockReturnValue([
            {
                entryName: 'some-other-file.txt',
                isDirectory: false,
                getData: () => Buffer.from(''),
            },
        ]);

        const result = await mod.downloadTestArtifacts(mockProvider as unknown as GitProvider, '1');

        expect(result).toBeNull();
    });

    it('returns null when JSON parse fails', async () => {
        mockListPipelineArtifacts.mockResolvedValue([{ id: 1, name: 'mochawesome-report' }]);
        mockDownloadArtifact.mockResolvedValue({ buffer: Buffer.from(''), filename: 'artifact.zip' });
        mockAdmZipGetEntries.mockReturnValue([
            {
                entryName: 'mochawesome.json',
                isDirectory: false,
                getData: () => Buffer.from('not valid json'),
            },
        ]);

        const result = await mod.downloadTestArtifacts(mockProvider as unknown as GitProvider, '1');

        expect(result).toBeNull();
    });

    it('returns null when report has no tests', async () => {
        mockListPipelineArtifacts.mockResolvedValue([{ id: 1, name: 'mochawesome-report' }]);
        mockDownloadArtifact.mockResolvedValue({ buffer: Buffer.from(''), filename: 'artifact.zip' });
        mockAdmZipGetEntries.mockReturnValue([
            {
                entryName: 'mochawesome.json',
                isDirectory: false,
                getData: () => Buffer.from(JSON.stringify({ results: [] })),
            },
        ]);
        mockParseMochawesome.mockReturnValue({
            tests: [],
            stats: { passed: 0, failed: 0, skipped: 0, total: 0, duration: 0 },
        });

        const result = await mod.downloadTestArtifacts(mockProvider as unknown as GitProvider, '1');

        expect(result).toBeNull();
    });
});

// ── parseTestResults ─────────────────────────────────────────────────────

describe('parseTestResults', () => {
    it('returns matched results with csvName when mapping is valid', async () => {
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

        expect(result).toEqual({
            matched: [{ key: 'TEST-1', title: 'test1', status: 'passed', duration: 100 }],
            unmatched: [],
            csvName: 'cypress',
        });
        expect(mockMatchResultsToTests).toHaveBeenCalled();
    });

    it('returns null when mapping path is empty', async () => {
        mockPrompt.mockResolvedValue('   ');
        const parsed: ParseResult = {
            tests: [],
            stats: { passed: 0, failed: 0, skipped: 0, total: 0, duration: 0 },
        };

        const result = await mod.parseTestResults(parsed);

        expect(result).toBeNull();
        expect(mockMatchResultsToTests).not.toHaveBeenCalled();
    });

    it('resolves glob pattern in mapping path', async () => {
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

describe('createTestExecution', () => {
    it('creates test execution and pushes success history', async () => {
        mockCreateTestExecutionFromResults.mockResolvedValue({
            key: 'TE-123',
            summary: 'Test Execution Summary',
            passed: 5,
            failed: 2,
            skipped: 1,
        });
        const pushHistory = jest.fn();

        await mod.createTestExecution(
            [{ key: 'T1', title: 'test1', status: 'passed', duration: 100 }],
            'my-tests',
            { base: 'https://jira.example.com', token: 'token', xray: 'https://xray.example.com' },
            'PROJ',
            '123',
            'main',
            'gitlab',
            pushHistory,
        );

        expect(mockCreateTestExecutionFromResults).toHaveBeenCalled();
        expect(pushHistory).toHaveBeenCalledWith('resultados', expect.stringContaining('TE-123'), 'ok');
    });

    it('handles error and pushes error history', async () => {
        mockCreateTestExecutionFromResults.mockRejectedValue(new Error('Creation failed'));
        const pushHistory = jest.fn();

        await mod.createTestExecution(
            [],
            'test',
            { base: '', token: '', xray: '' },
            'PROJ',
            '1',
            'main',
            'github',
            pushHistory,
        );

        expect(pushHistory).toHaveBeenCalledWith('resultados', 'erro', 'error');
    });
});

// ── collectTestResults ──────────────────────────────────────────────────

describe('collectTestResults', () => {
    it('downloads, parses, and creates test execution on full success', async () => {
        mockListPipelineArtifacts.mockResolvedValue([{ id: 1, name: 'mochawesome-report' }]);
        mockDownloadArtifact.mockResolvedValue({ buffer: Buffer.from(''), filename: 'artifact.zip' });
        mockAdmZipGetEntries.mockReturnValue([
            {
                entryName: 'mochawesome.json',
                isDirectory: false,
                getData: () => Buffer.from(JSON.stringify({ results: [] })),
            },
        ]);
        mockParseMochawesome.mockReturnValue({
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
        const pushHistory = jest.fn();

        await mod.collectTestResults(
            mockProvider as unknown as GitProvider,
            '1',
            'main',
            'PROJ',
            'gitlab',
            pushHistory,
        );

        expect(mockListPipelineArtifacts).toHaveBeenCalled();
        expect(mockDownloadArtifact).toHaveBeenCalled();
        expect(mockMatchResultsToTests).toHaveBeenCalled();
        expect(mockCreateTestExecutionFromResults).toHaveBeenCalled();
        expect(pushHistory).toHaveBeenCalled();
    });

    it('returns early when downloadTestArtifacts returns null', async () => {
        mockListPipelineArtifacts.mockResolvedValue([]);
        const pushHistory = jest.fn();

        await mod.collectTestResults(
            mockProvider as unknown as GitProvider,
            '1',
            'main',
            'PROJ',
            'gitlab',
            pushHistory,
        );

        expect(mockMatchResultsToTests).not.toHaveBeenCalled();
        expect(mockCreateTestExecutionFromResults).not.toHaveBeenCalled();
        expect(pushHistory).not.toHaveBeenCalled();
    });

    it('returns early when parseTestResults returns null', async () => {
        mockListPipelineArtifacts.mockResolvedValue([{ id: 1, name: 'mochawesome-report' }]);
        mockDownloadArtifact.mockResolvedValue({ buffer: Buffer.from(''), filename: 'artifact.zip' });
        mockAdmZipGetEntries.mockReturnValue([
            {
                entryName: 'mochawesome.json',
                isDirectory: false,
                getData: () => Buffer.from(JSON.stringify({ results: [] })),
            },
        ]);
        mockParseMochawesome.mockReturnValue({
            tests: [{ title: 'test1', state: 'passed', duration: 100 }],
            stats: { passed: 1, failed: 0, skipped: 0, total: 1, duration: 100 },
        });
        // mockPrompt default (empty string) makes parseTestResults return null
        const pushHistory = jest.fn();

        await mod.collectTestResults(
            mockProvider as unknown as GitProvider,
            '1',
            'main',
            'PROJ',
            'gitlab',
            pushHistory,
        );

        expect(mockMatchResultsToTests).not.toHaveBeenCalled();
        expect(mockCreateTestExecutionFromResults).not.toHaveBeenCalled();
        expect(pushHistory).not.toHaveBeenCalled();
    });
});
