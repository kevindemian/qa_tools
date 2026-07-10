/**
 * E2E tests — CI Data Hub
 *
 * Simulates the complete pipeline: DataProvider → DataHubImpl → consumer chain → output.
 * Validates that data flows correctly from provider through hub to all downstream consumers
 * and produces correct HTML/JSON output.
 *
 * Uses mocked DataProvider to simulate real CI API responses.
 */
import { describe, expect, it, vi } from 'vitest';
import type { PipelineRun, PipelineJob } from '../../types/ci-cd.js';
import type { DataProvider, RawData } from '../../types/data-hub.js';
import { DataHubImpl } from '../../data-hub/hub.js';
import { createFlatTests } from '../../test-utils/factories/flat-test-factory.js';

vi.mock('../../logger.js', () => ({
    rootLogger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn(), child: vi.fn().mockReturnThis() },
}));

vi.mock('../../config.js', () => ({
    default: { get: vi.fn(() => '') },
    get: vi.fn(() => ''),
}));

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

/* ── E2E Tests ─────────────────────────────────────────────────────────── */

describe('E2E: CI Data Hub — Complete Pipeline Flow', () => {
    describe('Full flow: API → Hub → Pipeline Cost → HTML', () => {
        it('produces correct cost data from CI runs', async () => {
            expect.hasAssertions();

            const { calculatePipelineCost, generatePipelineCostHtml } = await import('../../pipeline-cost.js');

            const runs = [
                makeRun(1, {
                    run_started_at: '2026-07-01T10:00:00Z',
                    updated_at: '2026-07-01T10:05:00Z',
                    conclusion: 'success',
                }),
                makeRun(2, {
                    run_started_at: '2026-07-01T11:00:00Z',
                    updated_at: '2026-07-01T11:10:00Z',
                    conclusion: 'failure',
                }),
                makeRun(3, {
                    run_started_at: '2026-07-01T12:00:00Z',
                    updated_at: '2026-07-01T12:03:00Z',
                    conclusion: 'success',
                }),
            ];

            const jobsMap = new Map<number, PipelineJob[]>([
                [1, [makeJob(10), makeJob(11, { name: 'lint' })]],
                [2, [makeJob(20, { status: 'failure' }), makeJob(21, { name: 'lint' })]],
                [3, [makeJob(30), makeJob(31, { name: 'lint' })]],
            ]);

            const rawData: RawData = { runs, jobs: jobsMap, failureReasons: new Map(), artifacts: new Map() };
            const provider = createMockProvider(rawData);
            const { hub } = await DataHubImpl.create([provider], { repo: 'owner/repo' }, mockPersistence);
            const costResult = calculatePipelineCost(null, 0.01, hub);
            const html = generatePipelineCostHtml(costResult);

            expect(hub.computed.passRate).toBeCloseTo(66.67, 0);
            expect(costResult.runCount).toBe(3);
            expect(costResult.totalDurationSec).toBe(1080);
            expect(html).toContain('<!DOCTYPE html>');
            expect(html).toContain('Pipeline Cost Analytics');
        });
    });

    describe('Full flow: API → Hub → Health Score', () => {
        it('health score reflects CI data quality', async () => {
            expect.hasAssertions();

            const { calculateHealthScore } = await import('../../health-score.js');

            const runs = [
                makeRun(1, { conclusion: 'success' }),
                makeRun(2, { conclusion: 'success' }),
                makeRun(3, { conclusion: 'success' }),
                makeRun(4, { conclusion: 'failure' }),
            ];
            const rawData: RawData = { runs, jobs: new Map(), failureReasons: new Map(), artifacts: new Map() };
            const provider = createMockProvider(rawData);
            const { hub } = await DataHubImpl.create([provider], { repo: 'owner/repo' }, mockPersistence);

            const result = calculateHealthScore({ dataHub: hub });

            expect(result.overall).toBeGreaterThanOrEqual(0);
            expect(result.overall).toBeLessThanOrEqual(100);
            expect(result.grade).toBeDefined();
            expect(result.dimensions.passRate.score).toBeGreaterThanOrEqual(0);
        });
    });

    describe('Full flow: API → Hub → Traceability Matrix → HTML', () => {
        it('traceability matrix produces valid HTML with CI flaky data', async () => {
            expect.hasAssertions();

            const { buildTraceabilityMatrix, generateTraceabilityHtml } = await import('../../traceability-matrix.js');

            const runs = [makeRun(1)];
            const jobsMap = new Map<number, PipelineJob[]>([
                [1, [makeJob(10, { status: 'failure' }), makeJob(11, { status: 'success' })]],
            ]);

            const rawData: RawData = { runs, jobs: jobsMap, failureReasons: new Map(), artifacts: new Map() };
            const provider = createMockProvider(rawData);
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
            const html = generateTraceabilityHtml(result);

            expect(html).toContain('<!DOCTYPE html>');
            expect(html).toContain('Traceability Matrix');
            expect(html).toContain('EPIC-1');
            expect(html).toContain('STORY-1');
        });
    });

    describe('Full flow: Provider error → Empty hub → Fallback', () => {
        it('complete pipeline works when provider fails', async () => {
            expect.hasAssertions();

            const { calculatePipelineCost } = await import('../../pipeline-cost.js');
            const { calculateHealthScore } = await import('../../health-score.js');

            const provider = createFailingProvider(new Error('Network error'));
            const { hub } = await DataHubImpl.create([provider], { repo: 'owner/repo' }, mockPersistence);

            const store = {
                runs: [
                    {
                        timestamp: '2026-07-01T10:00:00Z',
                        project: 'test',
                        total: 10,
                        passed: 9,
                        failed: 1,
                        skipped: 0,
                        duration: 5000,
                        tests: createFlatTests(10, { failFirst: true }),
                    },
                ],
            };

            const costResult = calculatePipelineCost(store.runs, 0.01, hub);
            const healthResult = calculateHealthScore({ dataHub: hub });

            expect(hub.raw.runs).toHaveLength(0);
            expect(costResult.runCount).toBe(1);
            expect(healthResult.overall).toBeGreaterThanOrEqual(0);
        });
    });

    describe('Full flow: Mixed conclusions → Correct metrics', () => {
        it('handles all conclusion types correctly', async () => {
            expect.hasAssertions();

            const runs = [
                makeRun(1, { conclusion: 'success' }),
                makeRun(2, { conclusion: 'failure' }),
                makeRun(3, { conclusion: 'cancelled' }),
                makeRun(4, { conclusion: 'success' }),
                makeRun(5, { conclusion: 'success' }),
            ];
            const rawData: RawData = { runs, jobs: new Map(), failureReasons: new Map(), artifacts: new Map() };
            const provider = createMockProvider(rawData);
            const { hub } = await DataHubImpl.create([provider], { repo: 'owner/repo' }, mockPersistence);

            expect(hub.computed.passRate).toBeCloseTo(60, 0);
            expect(hub.raw.runs).toHaveLength(5);
        });
    });
});
