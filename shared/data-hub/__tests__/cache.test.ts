/**
 * Unit tests for session cache.
 *
 * Tests cache get/set/clear/valid operations for multi-project support.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getCachedHub, setCachedHub, clearCache, clearRepoCache, isCacheValid, getCacheSize } from '../cache.js';
import type { DataHub } from '../../types/data-hub.js';

/* ── Helpers ────────────────────────────────────────────────────────────── */

function makeHub(repo = 'test/repo'): DataHub {
    return {
        raw: {
            runs: [],
            jobs: new Map(),
            artifacts: new Map(),
            failureReasons: new Map(),
        },
        computed: {
            passRate: 0,
            avgDuration: 0,
            suiteSpeedP95: 0,
            flakyRate: [],
            coverage: 0,
            pipelineCost: { totalMinutes: 0, estimatedCost: 0 },
            defectTrends: [],
            branchBreakdown: {},
            topFailingJobs: [],
            topFailureReasons: [],
            releaseScore: { score: 0, dimensions: {} as never, grade: 'critical' },
            quarantineStatus: { flakyCount: 0, quarantinedCount: 0 },
            testPassRate: 0,
            testCounts: { passed: 0, failed: 0, skipped: 0, total: 0 },
            framework: 'unknown',
        },
        timestamp: new Date(),
        provider: 'github',
        repo,
        saveRun: vi.fn(),
        saveCoverageSnapshot: vi.fn(),
        saveFailureClassification: vi.fn(),
        flush: vi.fn(),
    };
}

/* ── Tests ──────────────────────────────────────────────────────────────── */

describe('Session Cache', () => {
    beforeEach(() => {
        clearCache();
    });

    it('returns undefined on cache miss', () => {
        const result = getCachedHub('test/repo');

        expect(result).toBeUndefined();
    });

    it('returns cached hub on cache hit', () => {
        const hub = makeHub('test/repo');
        setCachedHub('test/repo', hub);

        const result = getCachedHub('test/repo');

        expect(result).toBe(hub);
    });

    it('returns undefined for different repo', () => {
        const hub = makeHub('repo-a');
        setCachedHub('repo-a', hub);

        const result = getCachedHub('repo-b');

        expect(result).toBeUndefined();
    });

    it('clears cache', () => {
        const hub = makeHub('test/repo');
        setCachedHub('test/repo', hub);
        clearCache();

        const result = getCachedHub('test/repo');

        expect(result).toBeUndefined();
    });
});

/* ── Multi-project cache ────────────────────────────────────────────────── */

describe('Multi-project Cache', () => {
    beforeEach(() => {
        clearCache();
    });

    it('stores multiple repos independently', () => {
        const hubA = makeHub('repo-a');
        const hubB = makeHub('repo-b');
        setCachedHub('repo-a', hubA);
        setCachedHub('repo-b', hubB);

        expect(getCachedHub('repo-a')).toBe(hubA);
        expect(getCachedHub('repo-b')).toBe(hubB);
        expect(getCacheSize()).toBe(2);
    });

    it('clearRepoCache evicts only specified repo', () => {
        const hubA = makeHub('repo-a');
        const hubB = makeHub('repo-b');
        setCachedHub('repo-a', hubA);
        setCachedHub('repo-b', hubB);

        clearRepoCache('repo-a');

        expect(getCachedHub('repo-a')).toBeUndefined();
        expect(getCachedHub('repo-b')).toBe(hubB);
        expect(getCacheSize()).toBe(1);
    });

    it('isCacheValid returns correct status', () => {
        expect(isCacheValid('repo-a')).toBeFalsy();

        setCachedHub('repo-a', makeHub('repo-a'));

        expect(isCacheValid('repo-a')).toBeTruthy();
        expect(isCacheValid('repo-b')).toBeFalsy();
    });

    it('overwrites existing cache entry for same repo', () => {
        const hubV1 = makeHub('repo-a');
        const hubV2 = makeHub('repo-a');
        setCachedHub('repo-a', hubV1);
        setCachedHub('repo-a', hubV2);

        expect(getCachedHub('repo-a')).toBe(hubV2);
        expect(getCacheSize()).toBe(1);
    });

    it('getCacheSize returns accurate count', () => {
        expect(getCacheSize()).toBe(0);

        setCachedHub('a', makeHub('a'));

        expect(getCacheSize()).toBe(1);

        setCachedHub('b', makeHub('b'));

        expect(getCacheSize()).toBe(2);

        clearRepoCache('a');

        expect(getCacheSize()).toBe(1);

        clearCache();

        expect(getCacheSize()).toBe(0);
    });
});
