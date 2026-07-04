/**
 * Unit tests for DataHub ↔ CiDataHub adapter.
 *
 * Tests bidirectional conversion between new and legacy types.
 */
import { describe, it, expect } from 'vitest';
import { dataHubToCiDataHub, ciDataHubToDataHub } from '../adapter.js';
import type { DataHub } from '../../types/data-hub.js';
import type { CiDataHub } from '../../ci-data.js';

/* ── Helpers ────────────────────────────────────────────────────────────── */

function makeDataHub(): DataHub {
    return {
        raw: {
            runs: [{ id: 1, conclusion: 'success' }],
            jobs: new Map([[1, [{ id: 1, name: 'test', stage: 'test', status: 'success', duration: 10 }]]]),
            artifacts: new Map(),
            failureReasons: new Map(),
        },
        computed: {
            passRate: 100,
            avgDuration: 600,
            suiteSpeedP95: 1500,
            flakyRate: [{ title: 'flaky-test', rate: 20, runs: 5 }],
            coverage: 85,
            pipelineCost: { totalMinutes: 10, estimatedCost: 0.08 },
            defectTrends: [],
            branchBreakdown: { main: { passRate: 100, count: 1 } },
            topFailingJobs: [{ name: 'lint', failureRate: 10, count: 1 }],
            topFailureReasons: [{ pattern: 'timeout', count: 3 }],
            releaseScore: {
                score: 92,
                dimensions: {} as never,
                grade: 'excellent',
            },
            quarantineStatus: { flakyCount: 1, quarantinedCount: 0 },
        },
        timestamp: new Date(1767225600000), // 2026-01-01T00:00:00Z in UTC
        provider: 'github',
        repo: 'test/repo',
    };
}

function makeCiDataHub(): CiDataHub {
    return {
        runs: [{ id: 1, conclusion: 'success' }],
        jobs: new Map([[1, [{ id: 1, name: 'test', stage: 'test', status: 'success', duration: 10 }]]]),
        artifacts: new Map(),
        failureReasons: new Map(),
        passRate: 100,
        avgDuration: 600,
        suiteSpeedP95: 1500,
        topFailingJobs: [{ name: 'lint', failureRate: 10, count: 1 }],
        branchBreakdown: { main: { passRate: 100, count: 1 } },
        topFailureReasons: [{ pattern: 'timeout', count: 3 }],
        flakyTests: [{ title: 'flaky-test', rate: 20, runs: 5 }],
        lastFetched: new Date(1767225600000), // 2026-01-01T00:00:00Z in UTC
        provider: 'github',
        repo: 'test/repo',
        recentRunsCount: 1,
    };
}

/* ── Tests ──────────────────────────────────────────────────────────────── */

describe('Adapter', () => {
    it('converts DataHub to CiDataHub', () => {
        const hub = makeDataHub();
        const ciData = dataHubToCiDataHub(hub);

        expect(ciData.runs).toBe(hub.raw.runs);
        expect(ciData.jobs).toBe(hub.raw.jobs);
        expect(ciData.passRate).toBe(100);
        expect(ciData.provider).toBe('github');
        expect(ciData.repo).toBe('test/repo');
        expect(ciData.flakyTests).toHaveLength(1);
        expect(ciData.flakyTests[0]?.title).toBe('flaky-test');
    });

    it('converts CiDataHub to DataHub', () => {
        const ciData = makeCiDataHub();
        const hub = ciDataHubToDataHub(ciData);

        expect(hub.raw.runs).toBe(ciData.runs);
        expect(hub.raw.jobs).toBe(ciData.jobs);
        expect(hub.computed.passRate).toBe(100);
        expect(hub.provider).toBe('github');
        expect(hub.repo).toBe('test/repo');
        expect(hub.computed.flakyRate).toHaveLength(1);
        expect(hub.computed.flakyRate[0]?.title).toBe('flaky-test');
    });

    it('preserves raw data references in conversion', () => {
        const hub = makeDataHub();
        const ciData = dataHubToCiDataHub(hub);

        expect(ciData.runs).toBe(hub.raw.runs);
        expect(ciData.jobs).toBe(hub.raw.jobs);
        expect(ciData.failureReasons).toBe(hub.raw.failureReasons);
        expect(ciData.artifacts).toBe(hub.raw.artifacts);
    });

    it('preserves computed metrics in conversion', () => {
        const ciData = makeCiDataHub();
        const hub = ciDataHubToDataHub(ciData);

        expect(hub.computed.passRate).toBe(ciData.passRate);
        expect(hub.computed.avgDuration).toBe(ciData.avgDuration);
        expect(hub.computed.suiteSpeedP95).toBe(ciData.suiteSpeedP95);
        expect(hub.computed.branchBreakdown).toBe(ciData.branchBreakdown);
    });
});
