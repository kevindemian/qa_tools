/**
 * Integration tests — Pipeline Cost (FT-29)
 *
 * Validates the Pipeline Cost Analytics report end-to-end:
 * - calculatePipelineCost + generatePipelineCostHtml (SSOT: dataHub.raw.runs)
 * - Empty input
 * - Error fallback
 * - Custom title
 * - DataHub path (uses real CI data)
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DataHub } from '../../types/data-hub.js';
import type { PipelineRun } from '../../types/ci-cd.js';
import { createTestHub } from '../test-hub.js';

vi.mock('../../logger.js', () => ({
    rootLogger: { error: vi.fn(), info: vi.fn(), child: vi.fn().mockReturnThis() },
}));

vi.mock('../../config.js', () => ({
    default: { get: vi.fn(() => '') },
    get: vi.fn(() => ''),
}));

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
    const hub = createTestHub();
    hub.raw.runs = runs;
    return hub;
}

describe('Integration: Pipeline Cost (FT-29)', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    describe('FT-29a: calculate and render pipeline cost', () => {
        it('produces complete HTML with summary and data table', async () => {
            expect.hasAssertions();

            const { calculatePipelineCost, generatePipelineCostHtml } = await import('../../pipeline-cost.js');
            const hub = makeDataHub([
                makeCiRun({
                    id: 1,
                    run_started_at: '2026-06-16T00:00:00.000Z',
                    updated_at: '2026-06-16T00:02:00.000Z', // 120s
                    conclusion: 'failure',
                }),
            ]);
            const result = calculatePipelineCost(0.01, hub);
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
            const result = calculatePipelineCost(undefined, makeDataHub([]));
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
            const result = calculatePipelineCost(undefined, makeDataHub([]));
            const html = generatePipelineCostHtml(result, 'My Cost Report');

            expect(html).toContain('My Cost Report');
        });
    });

    describe('DataHub: uses real CI data when available', () => {
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
            const result = calculatePipelineCost(0.01, hub);

            expect(result.runCount).toBe(2);
            expect(result.totalDurationSec).toBe(900); // 300 + 600
            expect(result.totalCost).toBeCloseTo(0.15, 2); // 900s / 60 * 0.01
            expect(result.costByRun).toHaveLength(2);
        });

        it('duration derived from timestamps, not from MetricsStore duration', async () => {
            expect.hasAssertions();

            const { calculatePipelineCost } = await import('../../pipeline-cost.js');
            // CI run spans 1200s (20min) per timestamps.
            const hub = makeDataHub([
                makeCiRun({
                    id: 1,
                    run_started_at: '2026-07-01T10:00:00Z',
                    updated_at: '2026-07-01T10:20:00Z',
                }),
            ]);

            const result = calculatePipelineCost(0.01, hub);

            expect(result.totalDurationSec).toBe(1200);
            expect(result.totalCost).toBeCloseTo(0.2, 2);
        });

        it('returns zeroed result when DataHub has no runs', async () => {
            expect.hasAssertions();

            const { calculatePipelineCost } = await import('../../pipeline-cost.js');
            const hub = makeDataHub([]);

            const result = calculatePipelineCost(0.01, hub);

            expect(result.runCount).toBe(0);
            expect(result.totalDurationSec).toBe(0);
            expect(result.costByRun).toStrictEqual([]);
        });
    });
});
