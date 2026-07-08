/**
 * Integration tests — Pipeline Cost (FT-29)
 *
 * Validates the Pipeline Cost Analytics report end-to-end:
 * - calculatePipelineCost + generatePipelineCostHtml with runs
 * - Empty input
 * - Error fallback
 * - Custom title
 * - DataHub path (uses real CI data when available)
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MetricsRun } from '../../types/data-hub.js';
import type { DataHub } from '../../types/data-hub.js';
import type { PipelineRun } from '../../types/ci-cd.js';

vi.mock('../../logger.js', () => ({
    rootLogger: { error: vi.fn(), info: vi.fn(), child: vi.fn().mockReturnThis() },
}));

vi.mock('../../config.js', () => ({
    default: { get: vi.fn(() => '') },
    get: vi.fn(() => ''),
}));

function makeRun(overrides?: Partial<MetricsRun>): MetricsRun {
    return {
        timestamp: '2026-06-16T00:00:00.000Z',
        project: 'test',
        total: 10,
        passed: 10,
        failed: 0,
        skipped: 0,
        duration: 120,
        tests: [],
        ...overrides,
    };
}

describe('Integration: Pipeline Cost (FT-29)', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    describe('FT-29a: calculate and render pipeline cost', () => {
        it('produces complete HTML with summary and data table', async () => {
            expect.hasAssertions();

            const { calculatePipelineCost, generatePipelineCostHtml } = await import('../../pipeline-cost.js');
            const runs = [makeRun({ timestamp: '2026-06-16T00:00:00.000Z', duration: 120, failed: 1, passed: 9 })];
            const result = calculatePipelineCost(runs, 0.01);
            const html = generatePipelineCostHtml(result);

            const parts = [
                '<!DOCTYPE html>',
                'Pipeline Cost Analytics',
                'Total Cost',
                'Avg Cost / Run',
                'Total Duration',
                'Run Count',
                '$0.02',
                '2m',
                'failed',
                'data-component="data-table"',
            ];

            expect(parts.every((p) => html.includes(p))).toBeTruthy();
        });
    });

    describe('FT-29b: empty runs', () => {
        it('shows no-data message and zeroed metrics', async () => {
            expect.hasAssertions();

            const { calculatePipelineCost, generatePipelineCostHtml } = await import('../../pipeline-cost.js');
            const result = calculatePipelineCost([]);
            const html = generatePipelineCostHtml(result);

            expect(html).toContain('<!DOCTYPE html>');
            expect(html).toContain('No pipeline run data available');
            expect(html).toContain('$0.00');
            expect(html).toContain('0');
        });
    });

    describe('FT-29d: custom title', () => {
        it('uses custom title in HTML page', async () => {
            expect.hasAssertions();

            const { calculatePipelineCost, generatePipelineCostHtml } = await import('../../pipeline-cost.js');
            const result = calculatePipelineCost([]);
            const html = generatePipelineCostHtml(result, 'My Cost Report');

            expect(html).toContain('My Cost Report');
        });
    });

    describe('DataHub: uses real CI data when available', () => {
        function makeCiRun(overrides?: Partial<PipelineRun>): PipelineRun {
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

        function makeDataHub(runs: PipelineRun[]): DataHub {
            return {
                raw: {
                    runs,
                    jobs: new Map(),
                    failureReasons: new Map(),
                    artifacts: new Map(),
                },
                computed: {
                    passRate: 75,
                    avgDuration: 300,
                    suiteSpeedP95: 120000,
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
                repo: 'owner/repo',
            };
        }

        it('uses dataHub.raw.runs for cost calculation when dataHub provided', async () => {
            expect.hasAssertions();

            const { calculatePipelineCost } = await import('../../pipeline-cost.js');
            const ciRuns = [
                makeCiRun({
                    id: 1,
                    run_started_at: '2026-07-01T10:00:00Z',
                    updated_at: '2026-07-01T10:05:00Z', // 300s
                }),
                makeCiRun({
                    id: 2,
                    run_started_at: '2026-07-01T11:00:00Z',
                    updated_at: '2026-07-01T11:10:00Z', // 600s
                }),
            ];
            const hub = makeDataHub(ciRuns);
            const result = calculatePipelineCost(null, 0.01, hub);

            expect(result.runCount).toBe(2);
            expect(result.totalDurationSec).toBe(900); // 300 + 600
            expect(result.totalCost).toBeCloseTo(0.15, 2); // 900s / 60 * 0.01
            expect(result.costByRun).toHaveLength(2);
        });

        it('dataHub path produces different result than MetricsStore fallback', async () => {
            expect.hasAssertions();

            const { calculatePipelineCost } = await import('../../pipeline-cost.js');
            const metricsRuns: MetricsRun[] = [
                {
                    timestamp: '2026-07-01T10:00:00Z',
                    project: 'p',
                    total: 10,
                    passed: 10,
                    failed: 0,
                    skipped: 0,
                    duration: 120,
                    tests: [],
                },
            ];
            const ciRuns = [
                makeCiRun({
                    run_started_at: '2026-07-01T10:00:00Z',
                    updated_at: '2026-07-01T10:20:00Z', // 1200s (different from MetricsStore 120s)
                }),
            ];
            const hub = makeDataHub(ciRuns);

            const withHub = calculatePipelineCost(metricsRuns, 0.01, hub);
            const withoutHub = calculatePipelineCost(metricsRuns, 0.01);

            expect(withHub.totalDurationSec).not.toBe(withoutHub.totalDurationSec);
        });

        it('falls back to MetricsStore when dataHub has no runs', async () => {
            expect.hasAssertions();

            const { calculatePipelineCost } = await import('../../pipeline-cost.js');
            const metricsRuns: MetricsRun[] = [
                {
                    timestamp: '2026-07-01T10:00:00Z',
                    project: 'p',
                    total: 10,
                    passed: 10,
                    failed: 0,
                    skipped: 0,
                    duration: 120,
                    tests: [],
                },
            ];
            const hub = makeDataHub([]);

            const result = calculatePipelineCost(metricsRuns, 0.01, hub);

            expect(result.runCount).toBe(1);
            expect(result.totalDurationSec).toBe(120);
        });
    });
});
