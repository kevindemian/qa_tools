import fs from 'fs';

jest.mock('../../shared/http-client', () => ({ createHttpClient: jest.fn() }));
jest.mock('../../shared/config', () => {
    const mockGet = jest.fn((key: string) => {
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
            getDefault: jest.fn(() => ({
                get: mockGet,
            })),
        },
        get: mockGet,
    };
});

jest.mock('adm-zip', () => {
    return jest.fn().mockImplementation(() => ({
        getEntries: jest.fn().mockReturnValue([]),
    }));
});

jest.mock('../xray-history', () => ({
    createHistoryProvider: jest.fn().mockReturnValue({
        getHistory: jest.fn().mockResolvedValue([]),
    }),
    TestHistoryCache: jest.fn().mockImplementation(() => ({
        get: jest.fn(),
        set: jest.fn(),
    })),
}));

jest.mock('./case17-helpers', () => ({
    CTRF_LAST_FILE: 'last-results.ctrf.json',
    GIT_HISTORY_RUNS: 5,
    isValidCtrfData: jest.fn((data: unknown): data is never => {
        if (!data || typeof data !== 'object') return false;
        const obj = data as Record<string, unknown>;
        if (!obj.results || typeof obj.results !== 'object') return false;
        return Array.isArray((obj.results as Record<string, unknown>).tests);
    }),
    isGitHubCi: jest.fn(),
    isGitLabCi: jest.fn(),
}));

const { createHttpClient } = require('../../shared/http-client');
const mockClient = { get: jest.fn() };
jest.mocked(createHttpClient).mockReturnValue(mockClient);

import { resolveMapping, computeDiff, fetchGitHistory, resolveTestHistory } from './case17-test-utils';
import type { CommandContext } from './context';
import type { FlatTest } from '../../shared/result_parser';
import { createMockContext } from '../../shared/test-utils/factories/context-factory';

describe('resolveMapping', () => {
    const _origExistsSync = fs.existsSync;
    let _readFileSyncSpy: jest.SpyInstance | null = null;

    afterEach(() => {
        jest.clearAllMocks();
        fs.existsSync = _origExistsSync;
        _readFileSyncSpy?.mockRestore();
        _readFileSyncSpy = null;
    });

    it('returns empty map when no candidates exist', () => {
        fs.existsSync = jest.fn().mockReturnValue(false);
        const result = resolveMapping();
        expect(result.size).toBe(0);
    });

    it('parses mapping from first valid candidate', () => {
        fs.existsSync = jest.fn().mockImplementation((p: string) => p.includes('mapping.json'));
        _readFileSyncSpy = jest
            .spyOn(fs, 'readFileSync')
            .mockReturnValue(JSON.stringify({ tests: [{ title: 'Login Test', key: 'TEST-42' }] }));
        const result = resolveMapping();
        expect(result.size).toBe(1);
        expect(result.get('Login Test')).toBe('TEST-42');
    });

    it('returns empty map on parse error', () => {
        fs.existsSync = jest.fn().mockImplementation((p: string) => p.includes('mapping.json'));
        _readFileSyncSpy = jest.spyOn(fs, 'readFileSync').mockReturnValue('invalid json');
        const result = resolveMapping();
        expect(result.size).toBe(0);
    });

    it('returns empty map when tests array empty', () => {
        fs.existsSync = jest.fn().mockImplementation((p: string) => p.includes('mapping.json'));
        _readFileSyncSpy = jest.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify({ tests: [] }));
        const result = resolveMapping();
        expect(result.size).toBe(0);
    });
});

describe('computeDiff', () => {
    const _origExistsSync = fs.existsSync;
    let _readFileSyncSpy: jest.SpyInstance | null = null;

    afterEach(() => {
        jest.clearAllMocks();
        fs.existsSync = _origExistsSync;
        _readFileSyncSpy?.mockRestore();
        _readFileSyncSpy = null;
    });

    it('returns empty diff when no last file exists', () => {
        fs.existsSync = jest.fn().mockReturnValue(false);
        const result = computeDiff([]);
        expect(result.newFailures).toEqual([]);
        expect(result.newPasses).toEqual([]);
        expect(result.flaky).toEqual([]);
    });

    it('detects new passes from CTRF diff', () => {
        fs.existsSync = jest.fn().mockReturnValue(true);
        _readFileSyncSpy = jest.spyOn(fs, 'readFileSync').mockReturnValue(
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

    it('returns empty diff on invalid CTRF data', () => {
        fs.existsSync = jest.fn().mockReturnValue(true);
        _readFileSyncSpy = jest.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify({ invalid: true }));
        const result = computeDiff([]);
        expect(result.newFailures).toEqual([]);
    });

    it('detects new failures from CTRF diff', () => {
        fs.existsSync = jest.fn().mockReturnValue(true);
        _readFileSyncSpy = jest.spyOn(fs, 'readFileSync').mockReturnValue(
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

    it('returns empty diff on invalid CTRF data', () => {
        fs.existsSync = jest.fn().mockReturnValue(true);
        _readFileSyncSpy = jest.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify({ invalid: true }));
        const result = computeDiff([]);
        expect(result.newFailures).toEqual([]);
    });

    it('detects new failures from CTRF diff', () => {
        fs.existsSync = jest.fn().mockReturnValue(true);
        _readFileSyncSpy = jest.spyOn(fs, 'readFileSync').mockReturnValue(
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

    it('detects flaky tests (last was failed)', () => {
        fs.existsSync = jest.fn().mockReturnValue(true);
        _readFileSyncSpy = jest.spyOn(fs, 'readFileSync').mockReturnValue(
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

    it('detects flaky tests (last was failed)', () => {
        fs.existsSync = jest.fn().mockReturnValue(true);
        _readFileSyncSpy = jest.spyOn(fs, 'readFileSync').mockReturnValue(
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

    it('handles JSON parse error in catch block', () => {
        fs.existsSync = jest.fn().mockReturnValue(true);
        _readFileSyncSpy = jest.spyOn(fs, 'readFileSync').mockReturnValue('not json');
        const result = computeDiff([]);
        expect(result.newFailures).toEqual([]);
        expect(result.newPasses).toEqual([]);
        expect(result.flaky).toEqual([]);
    });
});

describe('resolveTestHistory', () => {
    let _origExistsSync: typeof fs.existsSync;
    let _readFileSyncSpy: jest.SpyInstance | null = null;

    beforeEach(() => {
        _origExistsSync = fs.existsSync;
    });

    afterEach(() => {
        jest.clearAllMocks();
        fs.existsSync = _origExistsSync;
        _readFileSyncSpy?.mockRestore();
        _readFileSyncSpy = null;
    });

    function makeCtx(overrides?: Partial<CommandContext>): CommandContext {
        return { ...createMockContext(), ...overrides };
    }

    it('returns empty when no mapping file exists', async () => {
        fs.existsSync = jest.fn().mockReturnValue(false);
        const c = makeCtx();
        const cache = new (require('../xray-history').TestHistoryCache)();
        const result = await resolveTestHistory([], c, cache);
        expect(result).toEqual({});
    });

    it('returns empty when no tests match mapping', async () => {
        fs.existsSync = jest.fn().mockImplementation((p: string) => p.includes('mapping.json'));
        _readFileSyncSpy = jest
            .spyOn(fs, 'readFileSync')
            .mockReturnValue(JSON.stringify({ tests: [{ title: 'Login', key: 'TEST-1' }] }));
        const c = makeCtx();
        const cache = new (require('../xray-history').TestHistoryCache)();
        const result = await resolveTestHistory(
            [{ title: 'Other', state: 'passed', duration: 1 }] as FlatTest[],
            c,
            cache,
        );
        expect(result).toEqual({});
    });

    it('fetches history from provider for uncached keys', async () => {
        fs.existsSync = jest.fn().mockImplementation((p: string) => p.includes('mapping.json'));
        _readFileSyncSpy = jest
            .spyOn(fs, 'readFileSync')
            .mockReturnValue(JSON.stringify({ tests: [{ title: 'Login', key: 'TEST-1' }] }));
        const { createHistoryProvider } = require('../xray-history');
        createHistoryProvider.mockReturnValue({
            getHistory: jest.fn().mockResolvedValue([{ status: 'PASS' }]),
        });
        const cache = new (require('../xray-history').TestHistoryCache)();
        cache.get = jest.fn().mockReturnValue(null);
        cache.set = jest.fn();
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
        fs.existsSync = jest.fn().mockImplementation((p: string) => p.includes('mapping.json'));
        _readFileSyncSpy = jest
            .spyOn(fs, 'readFileSync')
            .mockReturnValue(JSON.stringify({ tests: [{ title: 'Login', key: 'TEST-1' }] }));
        const { createHistoryProvider } = require('../xray-history');
        createHistoryProvider.mockReturnValue({
            getHistory: jest.fn(),
        });
        const cache = new (require('../xray-history').TestHistoryCache)();
        cache.get = jest.fn().mockReturnValue([{ status: 'PASS' }]);
        cache.set = jest.fn();
        const c = makeCtx();
        const result = await resolveTestHistory(
            [{ title: 'Login', state: 'passed', duration: 1 }] as FlatTest[],
            c,
            cache,
        );
        expect(result).toHaveProperty('Login');
        expect(createHistoryProvider().getHistory).not.toHaveBeenCalled();
    });
});

describe('fetchGitHistory', () => {
    afterEach(() => {
        jest.clearAllMocks();
    });

    it('returns empty when neither CI environment detected', async () => {
        const helpers = require('./case17-helpers');
        jest.mocked(helpers.isGitHubCi).mockReturnValue(false);
        jest.mocked(helpers.isGitLabCi).mockReturnValue(false);
        const result = await fetchGitHistory();
        expect(result.commits).toBe('');
        expect(result.runs).toEqual([]);
        expect(result.flakyTests).toBe('');
    });

    it('fetches from GitHub when GitHub CI detected', async () => {
        const helpers = require('./case17-helpers');
        jest.mocked(helpers.isGitHubCi).mockReturnValue(true);
        jest.mocked(helpers.isGitLabCi).mockReturnValue(false);

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
            .mockResolvedValueOnce({ data: runData })
            .mockResolvedValueOnce({ data: artifactData })
            .mockResolvedValueOnce({ data: Buffer.from('{}') });

        const result = await fetchGitHistory();
        expect(mockClient.get).toHaveBeenCalled();
        expect(result.commits).toContain('fix test');
        expect(result.runs).toEqual([]);
        expect(result.flakyTests).toBe('');
    });

    it('handles GitHub API errors gracefully', async () => {
        const helpers = require('./case17-helpers');
        jest.mocked(helpers.isGitHubCi).mockReturnValue(true);
        jest.mocked(helpers.isGitLabCi).mockReturnValue(false);
        mockClient.get.mockRejectedValue(new Error('Network error'));
        const result = await fetchGitHistory();
        expect(result.commits).toBe('');
        expect(result.runs).toEqual([]);
        expect(result.flakyTests).toBe('');
    });

    it('fetches from GitLab when GitLab CI detected', async () => {
        const helpers = require('./case17-helpers');
        jest.mocked(helpers.isGitHubCi).mockReturnValue(false);
        jest.mocked(helpers.isGitLabCi).mockReturnValue(true);

        mockClient.get
            .mockResolvedValueOnce({ data: [{ id: 1, created_at: '2024-01-15' }] })
            .mockResolvedValueOnce({ data: [{ id: 10, name: 'test-job' }] })
            .mockResolvedValueOnce({ data: Buffer.from('{}') });

        const result = await fetchGitHistory();
        expect(result.commits).toBe('');
        expect(result.runs).toEqual([]);
        expect(result.flakyTests).toBe('');
    });

    it('handles GitLab API errors gracefully', async () => {
        const helpers = require('./case17-helpers');
        jest.mocked(helpers.isGitHubCi).mockReturnValue(false);
        jest.mocked(helpers.isGitLabCi).mockReturnValue(true);
        mockClient.get.mockRejectedValue(new Error('Network error'));
        const result = await fetchGitHistory();
        expect(result.commits).toBe('');
        expect(result.runs).toEqual([]);
        expect(result.flakyTests).toBe('');
    });
});
