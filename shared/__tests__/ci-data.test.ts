/**
 * Unit tests for CI Data Hub — repositório central de métricas do CI/CD.
 *
 * Tests the DataHubImpl.create flow with mocked DataProvider.
 */
import { describe, it, expect, vi } from 'vitest';
import type { PipelineRun, PipelineJob } from '../types/ci-cd.js';
import type { DataProvider, RawData } from '../types/data-hub.js';
import { DataHubImpl } from '../data-hub/hub.js';

/* ── Mock DataProvider ──────────────────────────────────────────────────── */

function createMockProvider(rawData: RawData): DataProvider {
    return {
        name: 'mock-github',
        source: 'github',
        fetchRawData: vi.fn().mockResolvedValue(rawData),
    };
}

function createFailingProvider(error: Error): DataProvider {
    return {
        name: 'mock-failing',
        source: 'github',
        fetchRawData: vi.fn().mockRejectedValue(error),
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

function makeRawData(overrides?: Partial<RawData>): RawData {
    return {
        runs: [],
        jobs: new Map(),
        failureReasons: new Map(),
        artifacts: new Map(),
        ...overrides,
    };
}

/* ── Mock Persistence ──────────────────────────────────────────────────── */

const mockPersistence = {
    loadMetricsStore: vi.fn().mockReturnValue({ runs: [] }),
    saveMetricsStore: vi.fn(),
    loadCoverageHistory: vi.fn().mockReturnValue([]),
    saveCoverageSnapshot: vi.fn(),
    loadFailureClassifications: vi.fn().mockReturnValue([]),
    saveFailureClassification: vi.fn(),
    saveRun: vi.fn(),
    saveParseResult: vi.fn().mockReturnValue({
        timestamp: new Date().toISOString(),
        project: '',
        total: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
        duration: 0,
        tests: [],
    }),
    saveQualityMetrics: vi.fn(),
    loadQualityMetricsHistory: vi.fn().mockReturnValue([]),
    flush: vi.fn(),
};

/* ── Tests ─────────────────────────────────────────────────────────────── */

describe('DataHubImpl.create', () => {
    it('creates hub with empty runs', async () => {
        expect.hasAssertions();

        const provider = createMockProvider(makeRawData());
        const { hub } = await DataHubImpl.create([provider], { repo: 'owner/repo' }, mockPersistence);

        expect(hub.raw.runs).toStrictEqual([]);
        expect(hub.computed.passRate).toBe(0);
        expect(hub.computed.avgDuration).toBe(0);
        expect(hub.raw.runs).toHaveLength(0);
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
        const provider = createMockProvider(makeRawData({ runs }));

        const { hub } = await DataHubImpl.create([provider], { repo: 'o/r' }, mockPersistence);

        expect(hub.computed.passRate).toBe(75);
        expect(hub.raw.runs).toHaveLength(4);
    });

    it('computes passRate as 0 when no runs have success conclusion', async () => {
        expect.hasAssertions();

        const runs = [makeRun({ id: 1, conclusion: 'in_progress' }), makeRun({ id: 2, conclusion: 'in_progress' })];
        const provider = createMockProvider(makeRawData({ runs }));

        const { hub } = await DataHubImpl.create([provider], { repo: 'o/r' }, mockPersistence);

        expect(hub.computed.passRate).toBe(0);
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
        const provider = createMockProvider(makeRawData({ runs }));

        const { hub } = await DataHubImpl.create([provider], { repo: 'o/r' }, mockPersistence);

        expect(hub.computed.avgDuration).toBe(450); // (300 + 600) / 2
    });

    it('computes suiteSpeedP95 from job durations', async () => {
        expect.hasAssertions();

        const runs = [makeRun({ id: 1 })];
        const jobs = [
            makeJob({ id: 10, duration: 100 }), // 100s = 100000ms
            makeJob({ id: 11, duration: 200 }), // 200s = 200000ms
        ];
        const jobsMap = new Map<number, PipelineJob[]>([[1, jobs]]);
        const provider = createMockProvider(makeRawData({ runs, jobs: jobsMap }));

        const { hub } = await DataHubImpl.create([provider], { repo: 'o/r' }, mockPersistence);

        // P95 of [100000, 200000] = 200000
        expect(hub.computed.suiteSpeedP95).toBe(200000);
    });

    it('computes topFailingJobs sorted by failure rate', async () => {
        expect.hasAssertions();

        const runs = [makeRun({ id: 1 }), makeRun({ id: 2 }), makeRun({ id: 3 })];
        const jobsMap = new Map<number, PipelineJob[]>([
            [
                1,
                [
                    makeJob({ id: 10, name: 'test', status: 'failure' }),
                    makeJob({ id: 11, name: 'lint', status: 'success' }),
                ],
            ],
            [
                2,
                [
                    makeJob({ id: 20, name: 'test', status: 'failure' }),
                    makeJob({ id: 21, name: 'lint', status: 'failure' }),
                ],
            ],
            [
                3,
                [
                    makeJob({ id: 30, name: 'test', status: 'success' }),
                    makeJob({ id: 31, name: 'lint', status: 'success' }),
                ],
            ],
        ]);

        const provider = createMockProvider(makeRawData({ runs, jobs: jobsMap }));
        const { hub } = await DataHubImpl.create([provider], { repo: 'o/r' }, mockPersistence);

        expect(hub.computed.topFailingJobs.length).toBeGreaterThan(0);

        // test: 2 failures in 3 runs = 66.67%
        // lint: 1 failure in 3 runs = 33.33%
        const topJob = hub.computed.topFailingJobs[0];

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
        const provider = createMockProvider(makeRawData({ runs }));

        const { hub } = await DataHubImpl.create([provider], { repo: 'o/r' }, mockPersistence);

        expect(hub.computed.branchBreakdown['main']).toStrictEqual({ passRate: 50, count: 2 });
        expect(hub.computed.branchBreakdown['feature']).toStrictEqual({ passRate: 100, count: 1 });
    });

    it('handles missing run IDs gracefully', async () => {
        expect.hasAssertions();

        const runs = [makeRun({ id: 1 }), makeRun({ id: 2 })];
        const jobsMap = new Map<number, PipelineJob[]>([
            [1, [makeJob()]],
            [2, [makeJob()]],
        ]);
        const provider = createMockProvider(makeRawData({ runs, jobs: jobsMap }));

        const { hub } = await DataHubImpl.create([provider], { repo: 'o/r' }, mockPersistence);

        expect(hub.raw.runs).toHaveLength(2);
        expect(hub.raw.jobs.size).toBe(2); // both runs have jobs
    });

    it('handles provider errors gracefully', async () => {
        expect.hasAssertions();

        const provider = createFailingProvider(new Error('API error'));

        const { hub } = await DataHubImpl.create([provider], { repo: 'o/r' }, mockPersistence);

        expect(hub.raw.runs).toHaveLength(0);
        expect(hub.raw.jobs.size).toBe(0);
    });

    it('sets timestamp to current time', async () => {
        expect.hasAssertions();

        const before = Date.now();
        const provider = createMockProvider(makeRawData());
        const { hub } = await DataHubImpl.create([provider], { repo: 'o/r' }, mockPersistence);
        const after = Date.now();

        expect(hub.timestamp.getTime()).toBeGreaterThanOrEqual(before);
        expect(hub.timestamp.getTime()).toBeLessThanOrEqual(after);
    });

    it('computes topFailureReasons from failure reasons', async () => {
        expect.hasAssertions();

        const runs = [makeRun({ id: 1 })];
        const failureReasons = new Map<number, string[]>([
            [1, ['Error: Connection timeout', 'Failure: Assertion failed']],
        ]);
        const provider = createMockProvider(makeRawData({ runs, failureReasons }));

        const { hub } = await DataHubImpl.create([provider], { repo: 'o/r' }, mockPersistence);

        expect(hub.computed.topFailureReasons.length).toBeGreaterThan(0);
        expect(hub.computed.topFailureReasons[0]?.pattern).toContain('Error');
    });

    it('computes flakyTests from mixed job statuses across runs', async () => {
        expect.hasAssertions();

        const runs = [makeRun({ id: 1 }), makeRun({ id: 2 })];
        const jobsMap = new Map<number, PipelineJob[]>([
            [1, [makeJob({ id: 10, name: 'flaky-test', status: 'success' })]],
            [2, [makeJob({ id: 20, name: 'flaky-test', status: 'failure' })]],
        ]);
        const provider = createMockProvider(makeRawData({ runs, jobs: jobsMap }));

        const { hub } = await DataHubImpl.create([provider], { repo: 'o/r' }, mockPersistence);

        expect(hub.computed.flakyRate.length).toBeGreaterThan(0);
        expect(hub.computed.flakyRate[0]?.title).toBe('flaky-test');
        expect(hub.computed.flakyRate[0]?.rate).toBe(50);
    });

    it('handles runs with string IDs', async () => {
        expect.hasAssertions();

        const runs = [makeRun({ id: 123 as number })];
        const jobsMap = new Map<number, PipelineJob[]>([[123, [makeJob({ id: 10 })]]]);
        const provider = createMockProvider(makeRawData({ runs, jobs: jobsMap }));

        const { hub } = await DataHubImpl.create([provider], { repo: 'o/r' }, mockPersistence);

        expect(hub.raw.runs).toHaveLength(1);
    });

    it('handles runs with null id', async () => {
        expect.hasAssertions();

        const runs = [makeRun({ id: undefined })];
        const provider = createMockProvider(makeRawData({ runs }));

        const { hub } = await DataHubImpl.create([provider], { repo: 'o/r' }, mockPersistence);

        expect(hub.raw.runs).toHaveLength(1);
    });
});
