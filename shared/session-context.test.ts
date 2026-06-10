import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionContext } from './session-context.js';

vi.mock('./git-sha.js', () => ({
    getHeadSha: vi.fn(),
    getCurrentBranch: vi.fn(),
}));

vi.mock('./store-backend.js', () => ({
    detectStoreBackend: vi.fn(),
    detectProjectGitDir: vi.fn(),
}));

vi.mock('./git-artifact-downloader.js', () => ({
    fetchLatestTestRun: vi.fn(),
}));

vi.mock('./store.js', async () => {
    const actual = await vi.importActual('./store.js');
    return {
        ...actual,
        Store: vi.fn(),
    };
});

import { getHeadSha, getCurrentBranch } from './git-sha.js';
import { detectStoreBackend, detectProjectGitDir } from './store-backend.js';
import { fetchLatestTestRun } from './git-artifact-downloader.js';

function createMockStore() {
    return {
        lookup: vi.fn(),
        put: vi.fn(),
        listByProject: vi.fn(() => []),
        appendBranch: vi.fn(),
        getBranch: vi.fn(() => []),
        saveReport: vi.fn(),
        loadReport: vi.fn(),
        loadMetrics: vi.fn(),
        saveMetrics: vi.fn(),
        flush: vi.fn(),
    };
}

describe('SessionContext', () => {
    let ctx: InstanceType<typeof SessionContext>;

    beforeEach(() => {
        ctx = new SessionContext();
    });

    it('initializes with defaults', () => {
        expect(ctx.isBusy).toBe(false);
        expect(ctx.lastOperation).toBe('');
        expect(ctx.sessionCounters).toEqual([]);
        expect(ctx.packageManager).toBeUndefined();
        expect(ctx.git_directory).toBe('no_dir_selected');
        expect(ctx.inMemoryTasksId).toEqual([]);
        expect(ctx.inMemoryTasksText).toEqual([]);
        expect(ctx.project_name).toBe('');
        expect(ctx.results).toEqual([]);
    });

    it('resetResults clears results array', () => {
        ctx.results.push({ status: 'ok', label: 'T1', message: '' });
        ctx.resetResults();
        expect(ctx.results).toEqual([]);
    });

    it('withBusy sets isBusy during execution', async () => {
        expect(ctx.isBusy).toBe(false);

        const result = await ctx.withBusy(async () => {
            await undefined;
            expect(ctx.isBusy).toBe(true);
            return 42;
        });

        expect(result).toBe(42);
        expect(ctx.isBusy).toBe(false);
    });

    it('withBusy ensures isBusy is false on error', async () => {
        await expect(
            ctx.withBusy(() => {
                throw new Error('fail');
            }),
        ).rejects.toThrow('fail');

        expect(ctx.isBusy).toBe(false);
    });

    it('pushHistory appends to sessionCounters', () => {
        ctx.pushHistory('test-op', 'detail-1', 'ok');
        expect(ctx.sessionCounters).toEqual([{ op: 'test-op', detail: 'detail-1', status: 'ok' }]);
    });

    it('pushHistory appends multiple entries', () => {
        ctx.pushHistory('op1', 'd1', 'ok');
        ctx.pushHistory('op2', 'd2', 'error');
        expect(ctx.sessionCounters.length).toBe(2);
        expect(ctx.sessionCounters[0]?.op).toBe('op1');
        expect(ctx.sessionCounters[1]?.op).toBe('op2');
    });

    describe('buildContextLine', () => {
        it('returns project name when no operations', () => {
            expect(ctx.buildContextLine('PROJ')).toBe('PROJ');
        });

        it('includes counter summary when operations exist', () => {
            ctx.pushHistory('op1', 'd1', 'ok');
            ctx.pushHistory('op2', 'd2', 'error');
            const line = ctx.buildContextLine('PROJ');
            expect(line).toContain('PROJ');
            expect(line).toContain('1 ok');
            expect(line).toContain('1 erro');
        });

        it('includes lastOperation when set', () => {
            ctx.pushHistory('test-op', 'detail-1', 'ok');
            const line = ctx.buildContextLine('PROJ');
            expect(line).toContain('test-op');
        });

        it('returns empty string when projectName is empty', () => {
            const line = ctx.buildContextLine('');
            expect(line).toBe('');
        });
    });
});

describe('resolveSessionContext', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('resolves sha, branch, and store from git context', async () => {
        const { resolveSessionContext } = await import('./session-context.js');
        vi.mocked(getHeadSha).mockReturnValue('abc123def456');
        vi.mocked(getCurrentBranch).mockReturnValue('main');
        vi.mocked(detectProjectGitDir).mockReturnValue('/project');
        vi.mocked(detectStoreBackend).mockReturnValue({
            init: vi.fn(),
            read: vi.fn(() => null),
            write: vi.fn(),
            exists: vi.fn(() => false),
            flush: vi.fn(),
        });

        const ctx = new SessionContext();
        const result = await resolveSessionContext(ctx, 'test-project');

        expect(result.sha).toBe('abc123def456');
        expect(result.branch).toBe('main');
        expect(result.store).toBeDefined();
        expect(ctx.sha).toBe('abc123def456');
        expect(ctx.branch).toBe('main');
        expect(ctx.store).toBeDefined();
        expect(detectStoreBackend).toHaveBeenCalledWith('/project');
    });

    it('returns null sha when git is unavailable', async () => {
        const { resolveSessionContext } = await import('./session-context.js');
        vi.mocked(getHeadSha).mockReturnValue(null);
        vi.mocked(getCurrentBranch).mockReturnValue(null);
        vi.mocked(detectProjectGitDir).mockReturnValue(null);

        const ctx = new SessionContext();
        const result = await resolveSessionContext(ctx, 'test-project');

        expect(result.sha).toBeNull();
        expect(result.branch).toBeNull();
        expect(result.store).toBeDefined();
    });
});

describe('resolveTestDataSource', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns cached result when SHA cache hit', async () => {
        const { resolveTestDataSource } = await import('./session-context.js');
        const store = createMockStore();
        vi.mocked(store.loadReport).mockReturnValue({
            tests: [
                { title: 'T1', state: 'passed', duration: 100 },
                { title: 'T2', state: 'failed', duration: 50, error: 'fail' },
            ],
        });

        const result = await resolveTestDataSource('project', 'sha123', 'main', store as never);

        expect(result).not.toBeNull();
        if (result) {
            expect(result.source).toBe('cache');
            expect(result.result.tests).toHaveLength(2);
            expect(result.result.stats.passed).toBe(1);
            expect(result.result.stats.failed).toBe(1);
        }
        expect(store.loadReport).toHaveBeenCalledWith('sha123');
    });

    it('returns null when cache miss and no CI download', async () => {
        const { resolveTestDataSource } = await import('./session-context.js');
        const store = createMockStore();
        vi.mocked(store.loadReport).mockReturnValue(null);
        vi.mocked(fetchLatestTestRun).mockResolvedValue(null);

        const result = await resolveTestDataSource('project', null, null, store as never);

        expect(result).toBeNull();
    });

    it('returns CI result when CI download succeeds', async () => {
        const { resolveTestDataSource } = await import('./session-context.js');
        const store = createMockStore();
        vi.mocked(store.loadReport).mockReturnValue(null);
        vi.mocked(fetchLatestTestRun).mockResolvedValue({
            tests: [
                { title: 'T1', state: 'passed', duration: 100 },
                { title: 'T2', state: 'failed', duration: 50, error: 'fail' },
            ],
            stats: { passed: 1, failed: 1, skipped: 0, total: 2, duration: 150 },
        } as never);

        const result = await resolveTestDataSource('project', 'sha456', 'main', store as never);

        expect(result).not.toBeNull();
        if (result) {
            expect(result.source).toBe('ci');
        }
        expect(store.saveReport).toHaveBeenCalledWith('sha456', expect.any(Array));
        expect(store.put).toHaveBeenCalled();
        expect(store.flush).toHaveBeenCalled();
    });

    it('falls back to branch baseline when cache and CI fail', async () => {
        const { resolveTestDataSource } = await import('./session-context.js');
        const store = createMockStore();
        vi.mocked(store.loadReport).mockReturnValue(null);
        vi.mocked(fetchLatestTestRun).mockResolvedValue(null);
        vi.mocked(store.getBranch).mockReturnValue([{ sha: 'baseline-sha', timestamp: 1000 }] as never);
        vi.mocked(store.loadReport)
            .mockReturnValueOnce(null)
            .mockReturnValueOnce({
                tests: [{ title: 'T1', state: 'passed', duration: 100 }],
            });

        const result = await resolveTestDataSource('project', 'sha789', 'main', store as never);

        expect(result).not.toBeNull();
        if (result) {
            expect(result.source).toBe('cache');
            expect(result.result.tests).toHaveLength(1);
        }
    });

    it('handles corrupted cache entry gracefully', async () => {
        const { resolveTestDataSource } = await import('./session-context.js');
        const store = createMockStore();
        vi.mocked(store.loadReport).mockImplementation(() => {
            throw new Error('corrupted');
        });

        const result = await resolveTestDataSource('project', 'sha123', 'main', store as never);

        expect(result).toBeNull();
    });

    it('stores CI result in cache when sha is available', async () => {
        const { resolveTestDataSource } = await import('./session-context.js');
        const store = createMockStore();
        vi.mocked(store.loadReport).mockReturnValue(null);
        vi.mocked(fetchLatestTestRun).mockResolvedValue({
            tests: [{ title: 'T1', state: 'passed', duration: 100 }],
            stats: { passed: 1, failed: 0, skipped: 0, total: 1, duration: 100 },
        } as never);

        await resolveTestDataSource('project', 'sha-abc', 'feature-x', store as never);

        expect(store.saveReport).toHaveBeenCalledWith('sha-abc', expect.any(Array));
        expect(store.put).toHaveBeenCalledWith(
            'sha-abc',
            expect.objectContaining({
                project: 'project',
                branch: 'feature-x',
                sha: 'sha-abc',
            }),
        );
    });

    it('skips CI download when no sha provided', async () => {
        const { resolveTestDataSource } = await import('./session-context.js');
        const store = createMockStore();
        vi.mocked(store.loadReport).mockReturnValue(null);
        vi.mocked(fetchLatestTestRun).mockResolvedValue({
            tests: [{ title: 'T1', state: 'passed', duration: 100 }],
            stats: { passed: 1, failed: 0, skipped: 0, total: 1, duration: 100 },
        } as never);

        const result = await resolveTestDataSource('project', null, null, store as never);

        expect(result).not.toBeNull();
        if (result) {
            expect(result.source).toBe('ci');
        }
        expect(store.saveReport).not.toHaveBeenCalled();
    });

    it('handles loadReport returning non-array tests', async () => {
        const { resolveTestDataSource } = await import('./session-context.js');
        const store = createMockStore();
        vi.mocked(store.loadReport).mockReturnValue({ tests: 'not-an-array' });
        vi.mocked(fetchLatestTestRun).mockResolvedValue(null);

        const result = await resolveTestDataSource('project', 'sha123', 'main', store as never);

        expect(result).toBeNull();
    });

    it('handles loadReport returning empty array', async () => {
        const { resolveTestDataSource } = await import('./session-context.js');
        const store = createMockStore();
        vi.mocked(store.loadReport).mockReturnValue({ tests: [] });
        vi.mocked(fetchLatestTestRun).mockResolvedValue(null);

        const result = await resolveTestDataSource('project', 'sha123', 'main', store as never);

        expect(result).toBeNull();
    });

    it('handles branch baseline entry with no sha', async () => {
        const { resolveTestDataSource } = await import('./session-context.js');
        const store = createMockStore();
        vi.mocked(store.loadReport).mockReturnValue(null);
        vi.mocked(fetchLatestTestRun).mockResolvedValue(null);
        vi.mocked(store.getBranch).mockReturnValue([{ sha: null, timestamp: 1000 }] as never);

        const result = await resolveTestDataSource('project', 'sha789', 'main', store as never);

        expect(result).toBeNull();
    });
});
