import fs from 'fs';
import type { Mock } from 'vitest';
import { createHttpClient } from '../../shared/http-client.js';

vi.mock('../../shared/http-client', async () => ({ createHttpClient: vi.fn() }));
vi.mock('../../shared/config', () => {
    const mockGet = vi.fn((key: string) => {
        const map: Record<string, string> = {
            QA_MAPPING_PATH: '',
            githubToken: 'mock-token',
            GITHUB_REPOSITORY: 'test/repo',
            CI_JOB_TOKEN: 'mock-token',
            CI_PROJECT_ID: '1',
            CI_SERVER_URL: 'https://gitlab.test.com',
        };
        return map[key] || '';
    });
    return {
        __esModule: true,
        default: {
            get: mockGet,
            getDefault: vi.fn(() => ({
                get: mockGet,
            })),
        },
        get: mockGet,
    };
});

vi.mock('adm-zip', () => ({
    default: vi.fn().mockImplementation(() => ({
        getEntries: vi.fn().mockReturnValue([]),
    })),
}));

vi.mock('../xray-history', async () => ({
    createHistoryProvider: vi.fn().mockReturnValue({
        getHistory: vi.fn().mockResolvedValue([]),
    }),
    TestHistoryCache: vi.fn(function () {
        return {
            get: vi.fn(),
            set: vi.fn(),
        };
    }),
}));

vi.mock('./case17-helpers', async () => ({
    CTRF_LAST_FILE: 'last-results.ctrf.json',
    GIT_HISTORY_RUNS: 5,
    isValidCtrfData: vi.fn((data: unknown): data is never => {
        if (!data || typeof data !== 'object') return false;
        const obj = data as Record<string, unknown>;
        if (!obj.results || typeof obj.results !== 'object') return false;
        return Array.isArray((obj.results as Record<string, unknown>).tests);
    }),
    isGitHubCi: vi.fn(),
    isGitLabCi: vi.fn(),
}));

const mockClient = {
    get: vi.fn<(...args: [string]) => Promise<{ status: number; data: unknown }>>(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    head: vi.fn(),
    options: vi.fn(),
    request: vi.fn(),
};
vi.mocked(createHttpClient).mockReturnValue(mockClient as never);

import { resolveMapping, computeDiff, fetchGitHistory, resolveTestHistory } from './case17-test-utils.js';
import type { CommandContext } from './context.js';
import type { FlatTest } from '../../shared/result_parser.js';
import { createMockContext } from '../../shared/test-utils/factories/context-factory.js';
import * as xrayHistory from '../xray-history.js';
import * as case17Helpers from './case17-helpers.js';

describe('resolveMapping', () => {
    const _origExistsSync = fs.existsSync;
    let _readFileSyncSpy: Mock | null = null;

    afterEach(() => {
        vi.clearAllMocks();
        fs.existsSync = _origExistsSync;
        _readFileSyncSpy?.mockRestore();
        _readFileSyncSpy = null;
    });

    it('returns empty map when no candidates exist', async () => {
        fs.existsSync = vi.fn().mockReturnValue(false);
        const result = resolveMapping();
        expect(result.size).toBe(0);
    });

    it('parses mapping from first valid candidate', async () => {
        fs.existsSync = vi.fn().mockImplementation((p: string) => p.includes('mapping.json'));
        _readFileSyncSpy = vi
            .spyOn(fs, 'readFileSync')
            .mockReturnValue(JSON.stringify({ tests: [{ title: 'Login Test', key: 'TEST-42' }] }));
        const result = resolveMapping();
        expect(result.size).toBe(1);
        expect(result.get('Login Test')).toBe('TEST-42');
    });

    it('returns empty map on parse error', async () => {
        fs.existsSync = vi.fn().mockImplementation((p: string) => p.includes('mapping.json'));
        _readFileSyncSpy = vi.spyOn(fs, 'readFileSync').mockReturnValue('invalid json');
        const result = resolveMapping();
        expect(result.size).toBe(0);
    });

    it('returns empty map when tests array empty', async () => {
        fs.existsSync = vi.fn().mockImplementation((p: string) => p.includes('mapping.json'));
        _readFileSyncSpy = vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify({ tests: [] }));
        const result = resolveMapping();
        expect(result.size).toBe(0);
    });
});

describe('computeDiff', () => {
    const _origExistsSync = fs.existsSync;
    let _readFileSyncSpy: Mock | null = null;

    afterEach(() => {
        vi.clearAllMocks();
        fs.existsSync = _origExistsSync;
        _readFileSyncSpy?.mockRestore();
        _readFileSyncSpy = null;
    });

    it('returns empty diff when no last file exists', async () => {
        fs.existsSync = vi.fn().mockReturnValue(false);
        const result = computeDiff([]);
        expect(result.newFailures).toEqual([]);
        expect(result.newPasses).toEqual([]);
        expect(result.flaky).toEqual([]);
    });

    it('detects new passes from CTRF diff', async () => {
        fs.existsSync = vi.fn().mockReturnValue(true);
        _readFileSyncSpy = vi.spyOn(fs, 'readFileSync').mockReturnValue(
            JSON.stringify({
                results: {
                    tests: [
                        { name: 'T1', status: 'passed' },
                        { name: 'T2', status: 'failed' },
                    ],
                },
            }),
        );
        const current = [
            { title: 'T1', state: 'passed', duration: 1 },
            { title: 'T2', state: 'passed', duration: 1 },
        ] as FlatTest[];
        const result = computeDiff(current);
        expect(result.newFailures).toHaveLength(0);
        expect(result.newPasses).toHaveLength(1);
        expect(result.newPasses[0]?.title).toBe('T2');
    });

    it('returns empty diff on invalid CTRF data', async () => {
        fs.existsSync = vi.fn().mockReturnValue(true);
        _readFileSyncSpy = vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify({ invalid: true }));
        const result = computeDiff([]);
        expect(result.newFailures).toEqual([]);
    });

    it('detects new failures from CTRF diff', async () => {
        fs.existsSync = vi.fn().mockReturnValue(true);
        _readFileSyncSpy = vi.spyOn(fs, 'readFileSync').mockReturnValue(
            JSON.stringify({
                results: {
                    tests: [
                        { name: 'T1', status: 'passed' },
                        { name: 'T2', status: 'passed' },
                    ],
                },
            }),
        );
        const current = [
            { title: 'T1', state: 'failed', duration: 1 },
            { title: 'T2', state: 'passed', duration: 1 },
        ] as FlatTest[];
        const result = computeDiff(current);
        expect(result.newFailures).toHaveLength(1);
        expect(result.newFailures[0]?.title).toBe('T1');
        expect(result.newPasses).toHaveLength(0);
    });

    it('returns empty diff on invalid CTRF data', async () => {
        fs.existsSync = vi.fn().mockReturnValue(true);
        _readFileSyncSpy = vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify({ invalid: true }));
        const result = computeDiff([]);
        expect(result.newFailures).toEqual([]);
    });

    it('detects new failures from CTRF diff', async () => {
        fs.existsSync = vi.fn().mockReturnValue(true);
        _readFileSyncSpy = vi.spyOn(fs, 'readFileSync').mockReturnValue(
            JSON.stringify({
                results: {
                    tests: [
                        { name: 'T1', status: 'passed' },
                        { name: 'T2', status: 'passed' },
                    ],
                },
            }),
        );
        const current = [
            { title: 'T1', state: 'failed' as const, duration: 1 },
            { title: 'T2', state: 'passed' as const, duration: 1 },
        ] as FlatTest[];
        const result = computeDiff(current);
        expect(result.newFailures).toHaveLength(1);
        expect(result.newFailures[0]?.title).toBe('T1');
        expect(result.newPasses).toHaveLength(0);
    });

    it('detects flaky tests (last was failed)', async () => {
        fs.existsSync = vi.fn().mockReturnValue(true);
        _readFileSyncSpy = vi.spyOn(fs, 'readFileSync').mockReturnValue(
            JSON.stringify({
                results: {
                    tests: [{ name: 'T1', status: 'failed' }],
                },
            }),
        );
        const current = [{ title: 'T1', state: 'passed' as const, duration: 1 }] as FlatTest[];
        const result = computeDiff(current);
        expect(result.flaky).toHaveLength(1);
        expect(result.flaky[0]?.title).toBe('T1');
    });

    it('detects flaky tests (last was failed)', async () => {
        fs.existsSync = vi.fn().mockReturnValue(true);
        _readFileSyncSpy = vi.spyOn(fs, 'readFileSync').mockReturnValue(
            JSON.stringify({
                results: {
                    tests: [{ name: 'T1', status: 'failed' }],
                },
            }),
        );
        const current = [{ title: 'T1', state: 'passed', duration: 1 }] as FlatTest[];
        const result = computeDiff(current);
        expect(result.flaky).toHaveLength(1);
        expect(result.flaky[0]?.title).toBe('T1');
    });

    it('handles JSON parse error in catch block', async () => {
        fs.existsSync = vi.fn().mockReturnValue(true);
        _readFileSyncSpy = vi.spyOn(fs, 'readFileSync').mockReturnValue('not json');
        const result = computeDiff([]);
        expect(result.newFailures).toEqual([]);
        expect(result.newPasses).toEqual([]);
        expect(result.flaky).toEqual([]);
    });
});

describe('resolveTestHistory', () => {
    let _origExistsSync: typeof fs.existsSync;
    let _readFileSyncSpy: Mock | null = null;

    beforeEach(() => {
        _origExistsSync = fs.existsSync;
    });

    afterEach(() => {
        vi.clearAllMocks();
        fs.existsSync = _origExistsSync;
        _readFileSyncSpy?.mockRestore();
        _readFileSyncSpy = null;
    });

    function makeCtx(overrides?: Partial<CommandContext>): CommandContext {
        return { ...createMockContext(), ...overrides };
    }

    it('returns empty when no mapping file exists', async () => {
        fs.existsSync = vi.fn().mockReturnValue(false);
        const c = makeCtx();
        const cache = new xrayHistory.TestHistoryCache();
        const result = await resolveTestHistory([], c, cache);
        expect(result).toEqual({});
    });

    it('returns empty when no tests match mapping', async () => {
        fs.existsSync = vi.fn().mockImplementation((p: string) => p.includes('mapping.json'));
        _readFileSyncSpy = vi
            .spyOn(fs, 'readFileSync')
            .mockReturnValue(JSON.stringify({ tests: [{ title: 'Login', key: 'TEST-1' }] }));
        const c = makeCtx();
        const cache = new xrayHistory.TestHistoryCache();
        const result = await resolveTestHistory(
            [{ title: 'Other', state: 'passed', duration: 1 }] as FlatTest[],
            c,
            cache,
        );
        expect(result).toEqual({});
    });

    it('fetches history from provider for uncached keys', async () => {
        fs.existsSync = vi.fn().mockImplementation((p: string) => p.includes('mapping.json'));
        _readFileSyncSpy = vi
            .spyOn(fs, 'readFileSync')
            .mockReturnValue(JSON.stringify({ tests: [{ title: 'Login', key: 'TEST-1' }] }));
        vi.mocked(xrayHistory.createHistoryProvider).mockReturnValue({
            getHistory: vi.fn().mockResolvedValue([{ status: 'PASS' }]),
        });
        const cache = new xrayHistory.TestHistoryCache();
        cache.get = vi.fn().mockReturnValue(null);
        cache.set = vi.fn();
        const c = makeCtx();
        const result = await resolveTestHistory(
            [{ title: 'Login', state: 'passed', duration: 1 }] as FlatTest[],
            c,
            cache,
        );
        expect(result).toHaveProperty('Login');
        expect(result.Login).toEqual([{ status: 'PASS' }]);
        expect(cache.set).toHaveBeenCalledWith('TEST-1', [{ status: 'PASS' }]);
    });

    it('uses cached history when available', async () => {
        fs.existsSync = vi.fn().mockImplementation((p: string) => p.includes('mapping.json'));
        _readFileSyncSpy = vi
            .spyOn(fs, 'readFileSync')
            .mockReturnValue(JSON.stringify({ tests: [{ title: 'Login', key: 'TEST-1' }] }));
        const mockGetHistory = vi.fn();
        vi.mocked(xrayHistory.createHistoryProvider).mockReturnValue({
            getHistory: mockGetHistory,
        });
        const cache = new xrayHistory.TestHistoryCache();
        cache.get = vi.fn().mockReturnValue([{ status: 'PASS' }]);
        cache.set = vi.fn();
        const c = makeCtx();
        const result = await resolveTestHistory(
            [{ title: 'Login', state: 'passed', duration: 1 }] as FlatTest[],
            c,
            cache,
        );
        expect(result).toHaveProperty('Login');
        expect(mockGetHistory).not.toHaveBeenCalled();
    });
});

describe('fetchGitHistory', () => {
    afterEach(() => {
        vi.clearAllMocks();
    });

    it('returns empty when neither CI environment detected', async () => {
        vi.mocked(case17Helpers.isGitHubCi).mockReturnValue(false);
        vi.mocked(case17Helpers.isGitLabCi).mockReturnValue(false);
        const result = await fetchGitHistory();
        expect(result.commits).toBe('');
        expect(result.runs).toEqual([]);
        expect(result.flakyTests).toBe('');
    });

    it('fetches from GitHub when GitHub CI detected', async () => {
        vi.mocked(case17Helpers.isGitHubCi).mockReturnValue(true);
        vi.mocked(case17Helpers.isGitLabCi).mockReturnValue(false);

        const runData = {
            workflow_runs: [
                {
                    id: 42,
                    head_commit: { message: 'fix test', author: { name: 'dev' } },
                    created_at: '2024-01-15T10:00:00Z',
                },
            ],
        };
        const artifactData = {
            artifacts: [{ id: 99, name: 'ctrf-report' }],
        };
        mockClient.get
            .mockResolvedValueOnce({ status: 200, data: runData })
            .mockResolvedValueOnce({ status: 200, data: artifactData })
            .mockResolvedValueOnce({ status: 200, data: Buffer.from('{}') });

        const result = await fetchGitHistory();
        expect(mockClient.get).toHaveBeenCalled();
        expect(result.commits).toContain('fix test');
        expect(result.runs).toEqual([]);
        expect(result.flakyTests).toBe('');
    });

    it('handles GitHub API errors gracefully', async () => {
        vi.mocked(case17Helpers.isGitHubCi).mockReturnValue(true);
        vi.mocked(case17Helpers.isGitLabCi).mockReturnValue(false);
        mockClient.get.mockRejectedValue(new Error('Network error'));
        const result = await fetchGitHistory();
        expect(result.commits).toBe('');
        expect(result.runs).toEqual([]);
        expect(result.flakyTests).toBe('');
    });

    it('fetches from GitLab when GitLab CI detected', async () => {
        vi.mocked(case17Helpers.isGitHubCi).mockReturnValue(false);
        vi.mocked(case17Helpers.isGitLabCi).mockReturnValue(true);

        mockClient.get
            .mockResolvedValueOnce({ status: 200, data: [{ id: 1, created_at: '2024-01-15' }] })
            .mockResolvedValueOnce({ status: 200, data: [{ id: 10, name: 'test-job' }] })
            .mockResolvedValueOnce({ status: 200, data: Buffer.from('{}') });

        const result = await fetchGitHistory();
        expect(result.commits).toBe('');
        expect(result.runs).toEqual([]);
        expect(result.flakyTests).toBe('');
    });

    it('handles GitLab API errors gracefully', async () => {
        vi.mocked(case17Helpers.isGitHubCi).mockReturnValue(false);
        vi.mocked(case17Helpers.isGitLabCi).mockReturnValue(true);
        mockClient.get.mockRejectedValue(new Error('Network error'));
        const result = await fetchGitHistory();
        expect(result.commits).toBe('');
        expect(result.runs).toEqual([]);
        expect(result.flakyTests).toBe('');
    });
});
