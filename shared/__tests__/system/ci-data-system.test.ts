/**
 * System tests — CI Data Hub
 *
 * Tests the complete data flow: DataProvider → DataHubImpl → consumers.
 * Validates that DataHub data propagates correctly through the entire
 * consumer chain: health-score, pipeline-cost, traceability-matrix.
 *
 * Uses mocked DataProvider to simulate CI API responses.
 */
import { describe, expect, it, vi } from 'vitest';
import type { PipelineRun, PipelineJob } from '../../types/ci-cd.js';
import type { DataProvider, RawData } from '../../types/data-hub.js';
import { DataHubImpl } from '../../data-hub/hub.js';

vi.mock('../../logger.js', () => ({
    rootLogger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn(), child: vi.fn().mockReturnThis() },
}));

/* ── Mock DataProvider ──────────────────────────────────────────────────── */

function createMockDataProvider(rawData: RawData): DataProvider {
    return {
        name: 'mock-github',
        source: 'github',
        fetchRawData: vi.fn().mockResolvedValue(rawData),
    };
}

/* ── Mock Persistence ──────────────────────────────────────────────────── */

const mockPersistence = {
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

/* ── Fixtures ──────────────────────────────────────────────────────────── */

function makeRun(id: number, overrides?: Partial<PipelineRun>): PipelineRun {
    return {
        id,
        conclusion: 'success',
        head_branch: 'main',
        created_at: '2026-07-01T10:00:00Z',
        updated_at: '2026-07-01T10:05:00Z',
        run_started_at: '2026-07-01T10:00:00Z',
        ...overrides,
    };
}

function makeJob(id: number, overrides?: Partial<PipelineJob>): PipelineJob {
    return {
        id,
        name: 'test',
        stage: 'test',
        status: 'success',
        duration: 120,
        ...overrides,
    };
}

/* ── System Tests ──────────────────────────────────────────────────────── */

describe('System: CI Data Hub — Full Pipeline Flow', () => {
    describe('Hub creation from provider data', () => {
        it('creates hub with metrics derived from provider data', async () => {
            expect.hasAssertions();

            const runs = [
                makeRun(1, { conclusion: 'success' }),
                makeRun(2, { conclusion: 'success' }),
                makeRun(3, { conclusion: 'failure' }),
            ];
            const jobsMap = new Map<number, PipelineJob[]>([
                [1, [makeJob(10), makeJob(11, { name: 'lint', status: 'success' })]],
                [2, [makeJob(20), makeJob(21, { name: 'lint', status: 'success' })]],
                [3, [makeJob(30, { status: 'failure' }), makeJob(31, { name: 'lint', status: 'success' })]],
            ]);

            const rawData: RawData = { runs, jobs: jobsMap, failureReasons: new Map(), artifacts: new Map() };
            const provider = createMockDataProvider(rawData);
            const { hub } = await DataHubImpl.create([provider], { repo: 'owner/repo' }, mockPersistence);

            expect(hub.computed.passRate).toBeCloseTo(66.67, 0);
            expect(hub.raw.runs).toHaveLength(3);
            expect(hub.provider).toBe('github');
            expect(hub.raw.jobs.size).toBe(3);
            expect(hub.computed.topFailingJobs.length).toBeGreaterThan(0);
        });

        it('handles provider returning empty runs', async () => {
            expect.hasAssertions();

            const rawData: RawData = { runs: [], jobs: new Map(), failureReasons: new Map(), artifacts: new Map() };
            const provider = createMockDataProvider(rawData);
            const { hub } = await DataHubImpl.create([provider], { repo: 'owner/repo' }, mockPersistence);

            expect(hub.raw.runs).toHaveLength(0);
            expect(hub.computed.passRate).toBe(0);
            expect(hub.computed.avgDuration).toBe(0);
        });
    });

    describe('Hub data → health-score consumer', () => {
        it('health score uses DataHub passRate instead of MetricsStore when provided', async () => {
            expect.hasAssertions();

            const { calculateHealthScore } = await import('../../health-score.js');
            const runs = [makeRun(1, { conclusion: 'success' }), makeRun(2, { conclusion: 'failure' })];
            const rawData: RawData = { runs, jobs: new Map(), failureReasons: new Map(), artifacts: new Map() };
            const provider = createMockDataProvider(rawData);
            const { hub } = await DataHubImpl.create([provider], { repo: 'owner/repo' }, mockPersistence);

            const withHub = calculateHealthScore({ dataHub: hub });

            // DataHub passRate (50%) is used instead of store (90%)
            // Score for 50% with target 95%: (50-50)/(95-50)*100 = 0
            expect(withHub.dimensions.passRate.score).toBe(0);
        });
    });

    describe('Hub data → pipeline-cost consumer', () => {
        it('pipeline cost uses DataHub runs for real cost calculation', async () => {
            expect.hasAssertions();

            const { calculatePipelineCost } = await import('../../pipeline-cost.js');
            const runs = [
                makeRun(1, {
                    run_started_at: '2026-07-01T10:00:00Z',
                    updated_at: '2026-07-01T10:05:00Z',
                }),
                makeRun(2, {
                    run_started_at: '2026-07-01T11:00:00Z',
                    updated_at: '2026-07-01T11:10:00Z',
                }),
            ];
            const rawData: RawData = { runs, jobs: new Map(), failureReasons: new Map(), artifacts: new Map() };
            const provider = createMockDataProvider(rawData);
            const { hub } = await DataHubImpl.create([provider], { repo: 'owner/repo' }, mockPersistence);

            const result = calculatePipelineCost(0.01, hub);

            expect(result.runCount).toBe(2);
            expect(result.totalDurationSec).toBe(900);
            expect(result.totalCost).toBeGreaterThan(0);
        });
    });

    describe('Hub data → traceability-matrix consumer', () => {
        it('traceability matrix uses DataHub flaky tests for flakiness', async () => {
            expect.hasAssertions();

            const { buildTraceabilityMatrix } = await import('../../traceability-matrix.js');
            const runs = [makeRun(1)];
            const jobsMap = new Map<number, PipelineJob[]>([
                [1, [makeJob(10, { status: 'failure' }), makeJob(11, { status: 'success' })]],
            ]);

            const rawData: RawData = { runs, jobs: jobsMap, failureReasons: new Map(), artifacts: new Map() };
            const provider = createMockDataProvider(rawData);
            const { hub } = await DataHubImpl.create([provider], { repo: 'owner/repo' }, mockPersistence);

            const metrics = [
                {
                    timestamp: '2026-07-01T10:00:00Z',
                    project: 'test',
                    total: 2,
                    passed: 1,
                    failed: 1,
                    skipped: 0,
                    duration: 1000,
                    tests: [
                        { title: 'TC-001', state: 'passed' as const, duration: 500 },
                        { title: 'TC-002', state: 'failed' as const, duration: 500 },
                    ],
                },
            ];

            const coverageResult = {
                items: [{ epic: 'EPIC-1', hasTest: true, linkedTestKeys: ['TC-001', 'TC-002'], issueKey: 'STORY-1' }],
                totals: { total: 1, covered: 1 },
                byEpic: { 'EPIC-1': { total: 1, covered: 1, rawPct: 100 } },
            };

            const result = buildTraceabilityMatrix(metrics, coverageResult, hub);

            expect(result.nodes.length).toBeGreaterThan(0);
        });
    });

    describe('DataHub SSOT: hub is always the source of truth', () => {
        it('empty DataHub uses computed metrics (SSOT), not MetricsStore fallback', async () => {
            expect.hasAssertions();

            const { calculateHealthScore } = await import('../../health-score.js');

            const rawData: RawData = { runs: [], jobs: new Map(), failureReasons: new Map(), artifacts: new Map() };
            const provider = createMockDataProvider(rawData);
            const { hub } = await DataHubImpl.create([provider], { repo: 'owner/repo' }, mockPersistence);

            const withHub = calculateHealthScore({ dataHub: hub });

            // DataHub is SSOT — hub computed metrics are used (0 passRate from empty hub)
            // Store would compute ~90% pass rate, but hub overrides
            expect(withHub.dimensions.passRate.score).toBe(0);
        });
    });

    describe('Error resilience: provider failures', () => {
        it('hub handles provider API errors gracefully', async () => {
            expect.hasAssertions();

            const provider: DataProvider = {
                name: 'mock-failing',
                source: 'github',
                fetchRawData: vi.fn().mockRejectedValue(new Error('API rate limit')),
            };

            const { hub } = await DataHubImpl.create([provider], { repo: 'owner/repo' }, mockPersistence);

            expect(hub.raw.runs).toHaveLength(0);
            expect(hub.computed.passRate).toBe(0);
        });
    });
});
