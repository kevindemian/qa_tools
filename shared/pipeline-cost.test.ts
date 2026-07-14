/**
 * Tests for pipeline-cost — Pipeline Cost Analytics.
 */

import * as reportStyles from './report-styles.js';
import { calculatePipelineCost, generatePipelineCostHtml } from './pipeline-cost.js';
import type { PipelineCostResult } from './pipeline-cost.js';
import type { DataHub } from './types/data-hub.js';
import type { PipelineRun } from './types/ci-cd.js';
import { nullAs, undefinedAs, nonNull } from './test-utils.js';
import { createTestHub } from './__tests__/test-hub.js';

/** Custo é SSOT: derivado de dataHub.raw.runs (PipelineRun do CI), não de MetricsRun local. */
function makeHub(ciRuns: PipelineRun[]): DataHub {
    const hub = createTestHub();
    hub.raw.runs = ciRuns;
    return hub;
}

function makeCiRun(overrides?: Partial<PipelineRun>): PipelineRun {
    const started = '2026-06-01T12:00:00.000Z';
    const updated = '2026-06-01T12:01:00.000Z'; // 60s de duração
    return {
        id: 1,
        conclusion: 'success',
        created_at: started,
        run_started_at: started,
        updated_at: updated,
        ...overrides,
    };
}

function makeCiRuns(): PipelineRun[] {
    return [
        {
            ...makeCiRun(),
            id: 1,
            created_at: '2026-06-01T12:00:00.000Z',
            run_started_at: '2026-06-01T12:00:00.000Z',
            updated_at: '2026-06-01T12:02:00.000Z', // 120s
            conclusion: 'success',
        },
        {
            ...makeCiRun(),
            id: 2,
            created_at: '2026-06-02T12:00:00.000Z',
            run_started_at: '2026-06-02T12:00:00.000Z',
            updated_at: '2026-06-02T12:05:00.000Z', // 300s
            conclusion: 'failure',
        },
        {
            ...makeCiRun(),
            id: 3,
            created_at: '2026-06-03T12:00:00.000Z',
            run_started_at: '2026-06-03T12:00:00.000Z',
            updated_at: '2026-06-03T12:01:00.000Z', // 60s
            conclusion: 'success',
        },
    ];
}

describe('CalculatePipelineCost', () => {
    it('returns zeroed result when DataHub has no CI runs', () => {
        const result = calculatePipelineCost(0.01, makeHub([]));

        expect(result.totalCost).toBe(0);
        expect(result.avgCostPerRun).toBe(0);
        expect(result.totalDurationSec).toBe(0);
        expect(result.costByRun).toStrictEqual([]);
        expect(result.runCount).toBe(0);
        expect(result.period).toStrictEqual({ from: '', to: '' });
        expect(result.costPerMinute).toBe(0.01);
    });

    it('calculates cost correctly for a single run', () => {
        const hub = makeHub([
            makeCiRun({ id: 1, run_started_at: '2026-06-01T12:00:00.000Z', updated_at: '2026-06-01T12:01:00.000Z' }),
        ]);
        const result = calculatePipelineCost(undefined, hub);

        expect(result.runCount).toBe(1);
        expect(result.totalDurationSec).toBe(60);
        expect(result.totalCost).toBeCloseTo(0.01, 5);
        expect(result.avgCostPerRun).toBeCloseTo(0.01, 5);
        expect(result.costByRun).toHaveLength(1);

        const entry = nonNull(result.costByRun[0]);

        expect(entry.durationSec).toBe(60);
        expect(entry.cost).toBeCloseTo(0.01, 5);
    });

    it('aggregates multiple runs correctly', () => {
        const result = calculatePipelineCost(undefined, makeHub(makeCiRuns()));

        expect(result.runCount).toBe(3);
        expect(result.totalDurationSec).toBe(480);
        expect(result.totalCost).toBeCloseTo(((120 + 300 + 60) / 60) * 0.01, 5);
        expect(result.avgCostPerRun).toBeCloseTo(result.totalCost / 3, 5);
        expect(result.costByRun).toHaveLength(3);
    });

    it('uses custom cost per minute', () => {
        const hub = makeHub([
            makeCiRun({ id: 1, run_started_at: '2026-06-01T12:00:00.000Z', updated_at: '2026-06-01T12:01:00.000Z' }),
        ]);
        const result = calculatePipelineCost(0.05, hub);

        expect(result.costPerMinute).toBe(0.05);
        expect(result.totalCost).toBeCloseTo(0.05, 5);
        expect(nonNull(result.costByRun[0]).cost).toBeCloseTo(0.05, 5);
    });

    it('allows explicit zero cost per minute', () => {
        const hub = makeHub([
            makeCiRun({ id: 1, run_started_at: '2026-06-01T12:00:00.000Z', updated_at: '2026-06-01T12:01:00.000Z' }),
        ]);
        const result = calculatePipelineCost(0, hub);

        expect(result.costPerMinute).toBe(0);
        expect(result.totalCost).toBe(0);
        expect(nonNull(result.costByRun[0]).cost).toBe(0);
    });

    it('uses environment variable for cost per minute', () => {
        const prev = process.env['QA_COST_PER_COMPUTE_MINUTE'];
        process.env['QA_COST_PER_COMPUTE_MINUTE'] = '0.10';
        try {
            const hub = makeHub([
                makeCiRun({
                    id: 1,
                    run_started_at: '2026-06-01T12:00:00.000Z',
                    updated_at: '2026-06-01T12:01:00.000Z',
                }),
            ]);
            const result = calculatePipelineCost(undefined, hub);

            expect(result.costPerMinute).toBe(0.1);
            expect(result.totalCost).toBeCloseTo(0.1, 5);
        } finally {
            if (prev === undefined) {
                delete process.env['QA_COST_PER_COMPUTE_MINUTE'];
            } else {
                process.env['QA_COST_PER_COMPUTE_MINUTE'] = prev;
            }
        }
    });

    it('sorts entries by timestamp descending', () => {
        const result = calculatePipelineCost(undefined, makeHub(makeCiRuns()));

        expect(nonNull(result.costByRun[0]).timestamp).toBe('2026-06-03T12:00:00.000Z');
        expect(nonNull(result.costByRun[1]).timestamp).toBe('2026-06-02T12:00:00.000Z');
        expect(nonNull(result.costByRun[2]).timestamp).toBe('2026-06-01T12:00:00.000Z');
    });

    it('determines failed status from conclusion', () => {
        const hub = makeHub([makeCiRun({ id: 1, conclusion: 'failure' })]);
        const result = calculatePipelineCost(undefined, hub);

        expect(nonNull(result.costByRun[0]).status).toBe('failed');
    });

    it('determines passed status from conclusion', () => {
        const hub = makeHub([makeCiRun({ id: 1, conclusion: 'success' })]);
        const result = calculatePipelineCost(undefined, hub);

        expect(nonNull(result.costByRun[0]).status).toBe('passed');
    });

    it('determines unknown status when conclusion is absent', () => {
        const hub = makeHub([
            {
                id: 1,
                created_at: '2026-06-01T12:00:00.000Z',
                run_started_at: '2026-06-01T12:00:00.000Z',
                updated_at: '2026-06-01T12:01:00.000Z',
            },
        ]);
        const result = calculatePipelineCost(undefined, hub);

        expect(nonNull(result.costByRun[0]).status).toBe('unknown');
    });

    it('sets period from sorted timestamps', () => {
        const result = calculatePipelineCost(undefined, makeHub(makeCiRuns()));

        expect(result.period.from).toBe('2026-06-01T12:00:00.000Z');
        expect(result.period.to).toBe('2026-06-03T12:00:00.000Z');
    });

    it('sets timestamp to valid ISO string', () => {
        const result = calculatePipelineCost(undefined, makeHub([]));

        expect(new Date(result.timestamp).toString()).not.toBe('Invalid Date');
        expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('handles duration exceeding one hour', () => {
        const hub = makeHub([
            makeCiRun({ id: 1, run_started_at: '2026-06-01T12:00:00.000Z', updated_at: '2026-06-01T14:00:00.000Z' }),
        ]);
        const result = calculatePipelineCost(undefined, hub);

        expect(result.totalDurationSec).toBe(7200);
        expect(nonNull(result.costByRun[0]).durationSec).toBe(7200);
    });

    it('guards invalid duration (no timestamps) from producing negative/NaN cost', () => {
        const hub = makeHub([{ id: 1, conclusion: 'success', created_at: '2026-06-01T12:00:00.000Z' }]);
        const result = calculatePipelineCost(undefined, hub);

        expect(result.totalDurationSec).toBe(0);
        expect(result.totalCost).toBe(0);
        expect(result.avgCostPerRun).toBe(0);
        expect(nonNull(result.costByRun[0]).cost).toBe(0);
    });
});

describe('GeneratePipelineCostHtml', () => {
    function makeResult(overrides?: Partial<PipelineCostResult>): PipelineCostResult {
        return {
            totalCost: 0.08,
            avgCostPerRun: 0.04,
            totalDurationSec: 480,
            costPerMinute: 0.01,
            costByRun: [
                {
                    timestamp: '2026-06-03T12:00:00.000Z',
                    durationSec: 60,
                    cost: 0.01,
                    status: 'partial',
                },
                {
                    timestamp: '2026-06-02T12:00:00.000Z',
                    durationSec: 300,
                    cost: 0.05,
                    status: 'failed',
                },
                {
                    timestamp: '2026-06-01T12:00:00.000Z',
                    durationSec: 120,
                    cost: 0.02,
                    status: 'passed',
                },
            ],
            runCount: 3,
            period: { from: '2026-06-01T12:00:00.000Z', to: '2026-06-03T12:00:00.000Z' },
            timestamp: '2026-06-03T12:00:00.000Z',
            ...overrides,
        };
    }

    it('generates valid HTML page', () => {
        const html = generatePipelineCostHtml(makeResult());

        expect(html).toContain('<!DOCTYPE html>');
        expect(html).toContain('</html>');
    });

    it('returns error page for null result', () => {
        const html = generatePipelineCostHtml(nullAs<PipelineCostResult>());

        expect(html).toContain('Pipeline Cost Report Error');
    });

    it('returns error page for undefined result', () => {
        const html = generatePipelineCostHtml(undefinedAs<PipelineCostResult>());

        expect(html).toContain('Pipeline Cost Report Error');
    });

    it('shows summary cards with cost data', () => {
        const html = generatePipelineCostHtml(makeResult());

        expect(html).toContain('Total Cost');
        expect(html).toContain('Avg Cost / Run');
        expect(html).toContain('Total Duration');
        expect(html).toContain('Run Count');
        expect(html).toContain('$0.08');
        expect(html).toContain('$0.04');
        expect(html).toContain('3');
    });

    it.each([
        ['formats duration into human-readable string', '8m'],
        ['includes footer', 'Pipeline Cost Analytics'],
        ['includes footer with full attribution text', 'Generated by QA Tools — Pipeline Cost Analytics'],
    ])('%s', (_title, expected) => {
        const html = generatePipelineCostHtml(makeResult());

        expect(html).toContain(expected);
    });

    it('includes run entries in the data table', () => {
        const html = generatePipelineCostHtml(makeResult());

        expect(html).toContain('data-component="table-wrapper"');
        expect(html).toContain('data-component="data-table"');
        expect(html).toContain('failed');
        expect(html).toContain('passed');
        expect(html).toContain('partial');
    });

    it('shows no-data message when costByRun is empty', () => {
        const result = makeResult({ costByRun: [], totalCost: 0, avgCostPerRun: 0, totalDurationSec: 0, runCount: 0 });
        const html = generatePipelineCostHtml(result);

        expect(html).toContain('No pipeline run data available');
        expect(html).not.toContain('data-component="data-table"');
    });

    it('uses custom title', () => {
        const html = generatePipelineCostHtml(makeResult(), 'My Cost Report');

        expect(html).toContain('<title>My Cost Report</title>');
        expect(html).toContain('<h1>My Cost Report</h1>');
    });

    it('defaults title to Pipeline Cost Analytics', () => {
        const html = generatePipelineCostHtml(makeResult({ costByRun: [] }));

        expect(html).toContain('<title>Pipeline Cost Analytics</title>');
        expect(html).toContain('<h1>Pipeline Cost Analytics</h1>');
    });

    it('formats cost values with $ and 2 decimal places', () => {
        const html = generatePipelineCostHtml(makeResult());

        expect(html).toContain('$0.08');
        expect(html).toContain('$0.04');
        expect(html).toContain('$0.02');
        expect(html).toContain('$0.01');
        expect(html).not.toContain('$0.1');
    });

    it('includes theme and dark mode support', () => {
        const html = generatePipelineCostHtml(makeResult({ costByRun: [] }));

        expect(html).toContain('qa-report-theme');
        expect(html).toContain('prefers-color-scheme');
        expect(html).toContain('html.dark');
    });

    it('shows data-component attributes from primitives', () => {
        const html = generatePipelineCostHtml(makeResult());

        expect(html).toContain('data-component="metric-grid"');
        expect(html).toContain('data-component="metric-card"');
        expect(html).toContain('data-component="table-wrapper"');
    });

    it('returns error page when buildCss throws', () => {
        const spy = vi.spyOn(reportStyles, 'buildCss').mockImplementation(() => {
            throw new Error('CSS build failure');
        });
        try {
            const html = generatePipelineCostHtml(makeResult({ costByRun: [] }));

            expect(html).toContain('Pipeline Cost Report Error');
        } finally {
            spy.mockRestore();
        }
    });

    it('formats duration in hours for long runs', () => {
        const result = makeResult({
            costByRun: [
                {
                    timestamp: '2026-06-03T12:00:00.000Z',
                    durationSec: 3660,
                    cost: 0.61,
                    status: 'passed',
                },
            ],
            totalCost: 0.61,
            avgCostPerRun: 0.61,
            totalDurationSec: 3660,
            runCount: 1,
        });
        const html = generatePipelineCostHtml(result);

        expect(html).toContain('1h');
    });
});
