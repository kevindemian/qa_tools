/**
 * Tests for pipeline-cost — Pipeline Cost Analytics.
 */

import * as reportStyles from './report-styles.js';
import { calculatePipelineCost, generatePipelineCostHtml } from './pipeline-cost.js';
import type { PipelineCostResult } from './pipeline-cost.js';
import type { MetricsRun } from './metrics.js';
import { nullAs, undefinedAs, nonNull } from './test-utils.js';

function makeRun(overrides?: Partial<MetricsRun>): MetricsRun {
    return {
        timestamp: '2026-06-01T12:00:00.000Z',
        project: 'test-project',
        total: 10,
        passed: 10,
        failed: 0,
        skipped: 0,
        duration: 120,
        tests: [],
        ...overrides,
    };
}

function makeRuns(): MetricsRun[] {
    return [
        makeRun({
            timestamp: '2026-06-01T12:00:00.000Z',
            duration: 120,
            total: 10,
            passed: 10,
            failed: 0,
            skipped: 0,
        }),
        makeRun({
            timestamp: '2026-06-02T12:00:00.000Z',
            duration: 300,
            total: 10,
            passed: 9,
            failed: 1,
            skipped: 0,
        }),
        makeRun({
            timestamp: '2026-06-03T12:00:00.000Z',
            duration: 60,
            total: 20,
            passed: 18,
            failed: 0,
            skipped: 2,
        }),
    ];
}

describe('calculatePipelineCost', () => {
    it('returns zeroed result for null input', () => {
        const result = calculatePipelineCost(nullAs<MetricsRun[]>());
        expect(result.totalCost).toBe(0);
        expect(result.avgCostPerRun).toBe(0);
        expect(result.totalDurationSec).toBe(0);
        expect(result.costByRun).toEqual([]);
        expect(result.runCount).toBe(0);
        expect(result.period).toEqual({ from: '', to: '' });
        expect(result.costPerMinute).toBe(0.01);
    });

    it('returns zeroed result for undefined input', () => {
        const result = calculatePipelineCost(undefinedAs<MetricsRun[]>());
        expect(result.totalCost).toBe(0);
        expect(result.avgCostPerRun).toBe(0);
        expect(result.totalDurationSec).toBe(0);
        expect(result.costByRun).toEqual([]);
        expect(result.runCount).toBe(0);
    });

    it('returns zeroed result for empty array', () => {
        const result = calculatePipelineCost([]);
        expect(result.totalCost).toBe(0);
        expect(result.avgCostPerRun).toBe(0);
        expect(result.totalDurationSec).toBe(0);
        expect(result.costByRun).toEqual([]);
        expect(result.runCount).toBe(0);
    });

    it('calculates cost correctly for a single run', () => {
        const runs = [makeRun({ duration: 60 })];
        const result = calculatePipelineCost(runs);

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
        const runs = makeRuns();
        const result = calculatePipelineCost(runs);

        expect(result.runCount).toBe(3);
        expect(result.totalDurationSec).toBe(480);
        expect(result.totalCost).toBeCloseTo(((120 + 300 + 60) / 60) * 0.01, 5);
        expect(result.avgCostPerRun).toBeCloseTo(result.totalCost / 3, 5);
        expect(result.costByRun).toHaveLength(3);
    });

    it('uses custom cost per minute', () => {
        const runs = [makeRun({ duration: 60 })];
        const result = calculatePipelineCost(runs, 0.05);

        expect(result.costPerMinute).toBe(0.05);
        expect(result.totalCost).toBeCloseTo(0.05, 5);
        expect(nonNull(result.costByRun[0]).cost).toBeCloseTo(0.05, 5);
    });

    it('uses environment variable for cost per minute', () => {
        const prev = process.env.QA_COST_PER_COMPUTE_MINUTE;
        process.env.QA_COST_PER_COMPUTE_MINUTE = '0.10';
        try {
            const runs = [makeRun({ duration: 60 })];
            const result = calculatePipelineCost(runs);

            expect(result.costPerMinute).toBe(0.1);
            expect(result.totalCost).toBeCloseTo(0.1, 5);
        } finally {
            if (prev === undefined) {
                delete process.env.QA_COST_PER_COMPUTE_MINUTE;
            } else {
                process.env.QA_COST_PER_COMPUTE_MINUTE = prev;
            }
        }
    });

    it('sorts entries by timestamp descending', () => {
        const runs = makeRuns();
        const result = calculatePipelineCost(runs);

        expect(nonNull(result.costByRun[0]).timestamp).toBe('2026-06-03T12:00:00.000Z');
        expect(nonNull(result.costByRun[1]).timestamp).toBe('2026-06-02T12:00:00.000Z');
        expect(nonNull(result.costByRun[2]).timestamp).toBe('2026-06-01T12:00:00.000Z');
    });

    it('determines failed status correctly', () => {
        const runs = [makeRun({ failed: 2, passed: 8, total: 10 })];
        const result = calculatePipelineCost(runs);
        expect(nonNull(result.costByRun[0]).status).toBe('failed');
    });

    it('determines passed status correctly', () => {
        const runs = [makeRun({ failed: 0, passed: 10, total: 10 })];
        const result = calculatePipelineCost(runs);
        expect(nonNull(result.costByRun[0]).status).toBe('passed');
    });

    it('determines partial status correctly', () => {
        const runs = [makeRun({ failed: 0, passed: 8, total: 10, skipped: 2 })];
        const result = calculatePipelineCost(runs);
        expect(nonNull(result.costByRun[0]).status).toBe('partial');
    });

    it('sets period from sorted timestamps', () => {
        const runs = makeRuns();
        const result = calculatePipelineCost(runs);

        expect(result.period.from).toBe('2026-06-01T12:00:00.000Z');
        expect(result.period.to).toBe('2026-06-03T12:00:00.000Z');
    });

    it('sets timestamp to valid ISO string', () => {
        const result = calculatePipelineCost([]);
        expect(() => new Date(result.timestamp)).not.toThrow();
        expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('handles duration exceeding one hour', () => {
        const runs = [makeRun({ duration: 7200 })];
        const result = calculatePipelineCost(runs);
        expect(result.totalDurationSec).toBe(7200);
        expect(nonNull(result.costByRun[0]).durationSec).toBe(7200);
    });
});

describe('generatePipelineCostHtml', () => {
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

    it('formats duration into human-readable string', () => {
        const html = generatePipelineCostHtml(makeResult());
        expect(html).toContain('8m');
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

    it('includes footer', () => {
        const html = generatePipelineCostHtml(makeResult());
        expect(html).toContain('Pipeline Cost Analytics');
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
