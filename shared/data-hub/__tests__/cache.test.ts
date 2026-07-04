/**
 * Unit tests for session cache.
 *
 * Tests cache get/set/clear/valid operations.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { getCachedHub, setCachedHub, clearCache } from '../cache.js';
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
        },
        timestamp: new Date(),
        provider: 'github',
        repo,
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
