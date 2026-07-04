/**
 * Unit tests for CI Data Hub — repositório central de métricas do CI/CD.
 *
 * Tests the pure calculation functions and the factory with mocked GitProvider.
 */
import { describe, it, expect, vi } from 'vitest';
import { createCiDataHub } from '../ci-data.js';
import type { GitProvider, PipelineRun, PipelineJob } from '../types/ci-cd.js';

/* ── Mock GitProvider ──────────────────────────────────────────────────── */

function createMockProvider(overrides?: Partial<GitProvider>): GitProvider {
    return {
        getRecentPipelines: vi.fn().mockResolvedValue([]),
        getPipelineJobs: vi.fn().mockResolvedValue([]),
        listPipelineArtifacts: vi.fn().mockResolvedValue([]),
        downloadArtifact: vi.fn().mockResolvedValue({ buffer: Buffer.from(''), filename: '' }),
        triggerPipeline: vi.fn(),
        getSchedules: vi.fn(),
        runSchedule: vi.fn(),
        createMergeRequest: vi.fn(),
        updateMergeRequest: vi.fn(),
        getMergeRequest: vi.fn(),
        searchMergeRequests: vi.fn(),
        acceptMergeRequest: vi.fn(),
        isApproved: vi.fn(),
        getCICDVariables: vi.fn(),
        getBranch: vi.fn(),
        getPipeline: vi.fn(),
        getDiff: vi.fn(),
        getJobLogs: vi.fn(),
        provider: 'github' as const,
        ...overrides,
    };
}

/* ── Fixtures ──────────────────────────────────────────────────────────── */

function makeRun(overrides?: Partial<PipelineRun>): PipelineRun {
    return {
        id: 1,
        conclusion: 'success',
        head_branch: 'main',
        created_at: '2026-07-01T10:00:00Z',
        updated_at: '2026-07-01T10:05:00Z',
        run_started_at: '2026-07-01T10:00:00Z',
        ...overrides,
    };
}

function makeJob(overrides?: Partial<PipelineJob>): PipelineJob {
    return {
        id: 1,
        name: 'test',
        stage: 'test',
        status: 'success',
        duration: 120,
        ...overrides,
    };
}

/* ── Tests ─────────────────────────────────────────────────────────────── */

describe('CreateCiDataHub', () => {
    it('creates hub with empty runs', async () => {
        expect.hasAssertions();

        const provider = createMockProvider();
        const hub = await createCiDataHub(provider, 'owner/repo');

        expect(hub.runs).toStrictEqual([]);
        expect(hub.passRate).toBe(0);
        expect(hub.avgDuration).toBe(0);
        expect(hub.recentRunsCount).toBe(0);
        expect(hub.provider).toBe('github');
        expect(hub.repo).toBe('owner/repo');
    });

    it('computes passRate correctly', async () => {
        expect.hasAssertions();

        const runs = [
            makeRun({ id: 1, conclusion: 'success' }),
            makeRun({ id: 2, conclusion: 'success' }),
            makeRun({ id: 3, conclusion: 'failure' }),
            makeRun({ id: 4, conclusion: 'success' }),
        ];
        const provider = createMockProvider({
            getRecentPipelines: vi.fn().mockResolvedValue(runs),
        });

        const hub = await createCiDataHub(provider, 'o/r');

        expect(hub.passRate).toBe(75);
        expect(hub.recentRunsCount).toBe(4);
    });

    it('computes passRate as 0 when no runs have success conclusion', async () => {
        expect.hasAssertions();

        const runs = [makeRun({ id: 1, conclusion: 'in_progress' }), makeRun({ id: 2, conclusion: 'in_progress' })];
        const provider = createMockProvider({
            getRecentPipelines: vi.fn().mockResolvedValue(runs),
        });

        const hub = await createCiDataHub(provider, 'o/r');

        expect(hub.passRate).toBe(0);
    });

    it('computes avgDuration from run_started_at and updated_at', async () => {
        expect.hasAssertions();

        const runs = [
            makeRun({
                id: 1,
                run_started_at: '2026-07-01T10:00:00Z',
                updated_at: '2026-07-01T10:05:00Z', // 5 min = 300s
            }),
            makeRun({
                id: 2,
                run_started_at: '2026-07-01T11:00:00Z',
                updated_at: '2026-07-01T11:10:00Z', // 10 min = 600s
            }),
        ];
        const provider = createMockProvider({
            getRecentPipelines: vi.fn().mockResolvedValue(runs),
        });

        const hub = await createCiDataHub(provider, 'o/r');

        expect(hub.avgDuration).toBe(450); // (300 + 600) / 2
    });

    it('computes suiteSpeedP95 from job durations', async () => {
        expect.hasAssertions();

        const runs = [makeRun({ id: 1 })];
        const jobs = [
            makeJob({ id: 10, duration: 100 }), // 100s = 100000ms
            makeJob({ id: 11, duration: 200 }), // 200s = 200000ms
        ];
        const provider = createMockProvider({
            getRecentPipelines: vi.fn().mockResolvedValue(runs),
            getPipelineJobs: vi.fn().mockResolvedValue(jobs),
        });

        const hub = await createCiDataHub(provider, 'o/r');

        // P95 of [100000, 200000] = 200000
        expect(hub.suiteSpeedP95).toBe(200000);
    });

    it('computes topFailingJobs sorted by failure rate', async () => {
        expect.hasAssertions();

        const runs = [makeRun({ id: 1 }), makeRun({ id: 2 }), makeRun({ id: 3 })];
        const jobsForRun1 = [
            makeJob({ id: 10, name: 'test', status: 'failure' }),
            makeJob({ id: 11, name: 'lint', status: 'success' }),
        ];
        const jobsForRun2 = [
            makeJob({ id: 20, name: 'test', status: 'failure' }),
            makeJob({ id: 21, name: 'lint', status: 'failure' }),
        ];
        const jobsForRun3 = [
            makeJob({ id: 30, name: 'test', status: 'success' }),
            makeJob({ id: 31, name: 'lint', status: 'success' }),
        ];

        const provider = createMockProvider({
            getRecentPipelines: vi.fn().mockResolvedValue(runs),
            getPipelineJobs: vi
                .fn()
                .mockResolvedValueOnce(jobsForRun1)
                .mockResolvedValueOnce(jobsForRun2)
                .mockResolvedValueOnce(jobsForRun3),
        });

        const hub = await createCiDataHub(provider, 'o/r');

        expect(hub.topFailingJobs.length).toBeGreaterThan(0);

        // test: 2 failures in 3 runs = 66.67%
        // lint: 1 failure in 3 runs = 33.33%
        const topJob = hub.topFailingJobs[0];

        expect(topJob).toBeDefined();
        expect(topJob?.name).toBe('test');
        expect(topJob?.failureRate).toBeCloseTo(66.67, 0);
    });

    it('computes branchBreakdown', async () => {
        expect.hasAssertions();

        const runs = [
            makeRun({ id: 1, head_branch: 'main', conclusion: 'success' }),
            makeRun({ id: 2, head_branch: 'main', conclusion: 'failure' }),
            makeRun({ id: 3, head_branch: 'feature', conclusion: 'success' }),
        ];
        const provider = createMockProvider({
            getRecentPipelines: vi.fn().mockResolvedValue(runs),
        });

        const hub = await createCiDataHub(provider, 'o/r');

        expect(hub.branchBreakdown['main']).toStrictEqual({ passRate: 50, count: 2 });
        expect(hub.branchBreakdown['feature']).toStrictEqual({ passRate: 100, count: 1 });
    });

    it('handles missing run IDs gracefully', async () => {
        expect.hasAssertions();

        const runs = [makeRun({ id: 1 }), makeRun({ id: 2 })];
        const provider = createMockProvider({
            getRecentPipelines: vi.fn().mockResolvedValue(runs),
            getPipelineJobs: vi.fn().mockResolvedValue([makeJob()]),
        });

        const hub = await createCiDataHub(provider, 'o/r');

        expect(hub.recentRunsCount).toBe(2);
        expect(hub.jobs.size).toBe(2); // both runs have jobs
    });

    it('handles provider errors gracefully', async () => {
        expect.hasAssertions();

        const runs = [makeRun({ id: 1 })];
        const provider = createMockProvider({
            getRecentPipelines: vi.fn().mockResolvedValue(runs),
            getPipelineJobs: vi.fn().mockRejectedValue(new Error('API error')),
        });

        const hub = await createCiDataHub(provider, 'o/r');

        expect(hub.runs).toHaveLength(1);
        expect(hub.jobs.size).toBe(0);
    });

    it('sets lastFetched to current time', async () => {
        expect.hasAssertions();

        const before = Date.now();
        const provider = createMockProvider();
        const hub = await createCiDataHub(provider, 'o/r');
        const after = Date.now();

        expect(hub.lastFetched.getTime()).toBeGreaterThanOrEqual(before);
        expect(hub.lastFetched.getTime()).toBeLessThanOrEqual(after);
    });

    it('computes topFailureReasons from failed job logs', async () => {
        expect.hasAssertions();

        const runs = [makeRun({ id: 1 })];
        const failedJob = makeJob({ id: 10, status: 'failure' });
        const logText = 'Error: Connection timeout after 30s\nFailure: Assertion failed\nSomething else';
        const provider = createMockProvider({
            getRecentPipelines: vi.fn().mockResolvedValue(runs),
            getPipelineJobs: vi.fn().mockResolvedValue([failedJob]),
            downloadArtifact: vi.fn().mockResolvedValue({ buffer: Buffer.from(''), filename: logText }),
        });

        const hub = await createCiDataHub(provider, 'o/r');

        expect(hub.topFailureReasons.length).toBeGreaterThan(0);
        expect(hub.topFailureReasons[0]?.pattern).toContain('Error');
    });

    it('computes flakyTests from mixed job statuses across runs', async () => {
        expect.hasAssertions();

        const runs = [makeRun({ id: 1 }), makeRun({ id: 2 })];
        const jobsForRun1 = [makeJob({ id: 10, name: 'flaky-test', status: 'success' })];
        const jobsForRun2 = [makeJob({ id: 20, name: 'flaky-test', status: 'failure' })];
        const provider = createMockProvider({
            getRecentPipelines: vi.fn().mockResolvedValue(runs),
            getPipelineJobs: vi.fn().mockResolvedValueOnce(jobsForRun1).mockResolvedValueOnce(jobsForRun2),
        });

        const hub = await createCiDataHub(provider, 'o/r');

        expect(hub.flakyTests.length).toBeGreaterThan(0);
        expect(hub.flakyTests[0]?.title).toBe('flaky-test');
        expect(hub.flakyTests[0]?.rate).toBe(50);
    });

    it('handles runs with string IDs', async () => {
        expect.hasAssertions();

        const runs = [makeRun({ id: '123' })];
        const provider = createMockProvider({
            getRecentPipelines: vi.fn().mockResolvedValue(runs),
            getPipelineJobs: vi.fn().mockResolvedValue([makeJob({ id: 10 })]),
        });

        const hub = await createCiDataHub(provider, 'o/r');

        expect(hub.recentRunsCount).toBe(1);
    });

    it('handles runs with null id', async () => {
        expect.hasAssertions();

        const runs = [makeRun({ id: undefined })];
        const provider = createMockProvider({
            getRecentPipelines: vi.fn().mockResolvedValue(runs),
        });

        const hub = await createCiDataHub(provider, 'o/r');

        expect(hub.recentRunsCount).toBe(1);
    });

    it('handles downloadArtifact failure for failed jobs gracefully', async () => {
        expect.hasAssertions();

        const runs = [makeRun({ id: 1 })];
        const failedJob = makeJob({ id: 10, status: 'failure' });
        const provider = createMockProvider({
            getRecentPipelines: vi.fn().mockResolvedValue(runs),
            getPipelineJobs: vi.fn().mockResolvedValue([failedJob]),
            downloadArtifact: vi.fn().mockRejectedValue(new Error('Artifact not found')),
        });

        const hub = await createCiDataHub(provider, 'o/r');

        expect(hub.runs).toHaveLength(1);
        expect(hub.topFailureReasons).toHaveLength(0);
    });
});
