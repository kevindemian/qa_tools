/**
 * Property-Based Tests — Pipeline Cost (FT-29)
 *
 * Invariants:
 * - calculatePipelineCost: cost = (durationSec / 60) * costPerMinute
 * - totalCost = sum of entry costs
 * - totalDurationSec = sum of durations
 * - avgCostPerRun = totalCost / runCount
 * - status logic: failed > 0 → 'failed', passed === total → 'passed', else 'partial'
 * - null/undefined/empty → zeroed result
 * - generatePipelineCostHtml always produces valid HTML with DOCTYPE
 */
import * as fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';
import { calculatePipelineCost, generatePipelineCostHtml } from '../pipeline-cost.js';
import type { FlatTest } from '../result_parser.js';

vi.mock('../logger.js', () => ({
    rootLogger: { error: vi.fn(), info: vi.fn(), child: vi.fn().mockReturnThis() },
}));

vi.mock('../config.js', () => ({
    default: { get: vi.fn(() => '') },
    get: vi.fn(() => ''),
}));

/* ── Helpers ─────────────────────────────────────────────────── */

const costPerMinuteArb: fc.Arbitrary<number> = fc.integer({ min: 1, max: 100 }).map((n) => n / 100);

const emptyTests: FlatTest[] = [];

const metricsRunArb = fc
    .record({
        timestamp: fc.integer({ min: 1577836800000, max: 1814400000000 }).map((ts) => new Date(ts).toISOString()),
        project: fc.constant('test'),
        total: fc.nat({ max: 100 }),
        passed: fc.nat({ max: 100 }),
        failed: fc.nat({ max: 100 }),
        skipped: fc.nat({ max: 100 }),
        duration: fc.nat({ max: 36000 }),
        tests: fc.constant(emptyTests),
    })
    .filter((r) => r.passed + r.failed + r.skipped <= r.total || r.total === 0)
    .map(
        (
            r,
        ): {
            timestamp: string;
            project: string;
            total: number;
            passed: number;
            failed: number;
            skipped: number;
            duration: number;
            tests: FlatTest[];
        } => r,
    );

/* ── Tests ───────────────────────────────────────────────────── */

describe('CalculatePipelineCost — property-based', () => {
    it('cost per run = (durationSec / 60) * costPerMinute', () => {expect.hasAssertions();

        fc.assert(
            fc.property(fc.array(metricsRunArb, { minLength: 1, maxLength: 20 }), costPerMinuteArb, (runs, cpm) => {
                const result = calculatePipelineCost(runs, cpm);
                for (const entry of result.costByRun) {
                    const expected = (entry.durationSec / 60) * cpm;

                    expect(entry.cost).toBeCloseTo(expected, 5);
                }
            }),
            { numRuns: 50 },
        );
    });

    it('totalCost = sum of all entry costs', () => {expect.hasAssertions();

        fc.assert(
            fc.property(fc.array(metricsRunArb, { minLength: 1, maxLength: 20 }), costPerMinuteArb, (runs, cpm) => {
                const result = calculatePipelineCost(runs, cpm);
                const sum = result.costByRun.reduce((s, e) => s + e.cost, 0);

                expect(result.totalCost).toBeCloseTo(sum, 5);
            }),
            { numRuns: 50 },
        );
    });

    it('totalDurationSec = sum of all durations', () => {expect.hasAssertions();

        fc.assert(
            fc.property(fc.array(metricsRunArb, { minLength: 1, maxLength: 20 }), costPerMinuteArb, (runs, cpm) => {
                const result = calculatePipelineCost(runs, cpm);
                const sum = result.costByRun.reduce((s, e) => s + e.durationSec, 0);

                expect(result.totalDurationSec).toBe(sum);
            }),
            { numRuns: 50 },
        );
    });

    it('avgCostPerRun = totalCost / runCount', () => {expect.hasAssertions();

        fc.assert(
            fc.property(fc.array(metricsRunArb, { minLength: 1, maxLength: 20 }), costPerMinuteArb, (runs, cpm) => {
                const result = calculatePipelineCost(runs, cpm);
                const expected = result.totalCost / result.runCount;

                expect(result.avgCostPerRun).toBeCloseTo(expected, 5);
            }),
            { numRuns: 50 },
        );
    });

    it('status: failed > 0 → failed, passed === total → passed, else partial', () => {expect.hasAssertions();

        fc.assert(
            fc.property(fc.array(metricsRunArb, { minLength: 1, maxLength: 20 }), costPerMinuteArb, (runs, cpm) => {
                const result = calculatePipelineCost(runs, cpm);
                const sortedRuns = [...runs].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
                for (let i = 0; i < result.costByRun.length; i++) {
                    const entry = Reflect.get(result.costByRun, i) as { status: string; timestamp: string } | undefined;
                    const run = Reflect.get(sortedRuns, i) as { failed: number; passed: number; total: number; timestamp: string } | undefined;
                    if (!entry || !run) continue;
                    const expectedStatus = run.failed > 0 ? 'failed' : run.passed === run.total ? 'passed' : 'partial';
                    
                    expect(entry.status).toBe(expectedStatus);
                }
            }),
            { numRuns: 50 },
        );
    });

    it('entries sorted by timestamp descending', () => {expect.hasAssertions();

        fc.assert(
            fc.property(fc.array(metricsRunArb, { minLength: 1, maxLength: 20 }), costPerMinuteArb, (runs, cpm) => {
                const result = calculatePipelineCost(runs, cpm);
                for (let i = 1; i < result.costByRun.length; i++) {
                    const prev = Reflect.get(result.costByRun, i - 1) as { timestamp: string } | undefined;
                    const curr = Reflect.get(result.costByRun, i) as { timestamp: string } | undefined;
                    if (!prev || !curr) continue;

                    expect(prev.timestamp.localeCompare(curr.timestamp)).toBeGreaterThanOrEqual(0);
                }
            }),
            { numRuns: 50 },
        );
    });

    it('period.from is earliest, period.to is latest', () => {expect.hasAssertions();

        fc.assert(
            fc.property(fc.array(metricsRunArb, { minLength: 1, maxLength: 20 }), costPerMinuteArb, (runs, cpm) => {
                const result = calculatePipelineCost(runs, cpm);
                const timestamps = runs.map((r) => r.timestamp).sort();

                expect(result.period.from).toBe(timestamps[0]);
                expect(result.period.to).toBe(timestamps[timestamps.length - 1]);
            }),
            { numRuns: 50 },
        );
    });

    it('returns zeroed result for null input', () => {expect.hasAssertions();

        fc.assert(
            fc.property(fc.boolean(), () => {
                const result = calculatePipelineCost(null);

                expect(result.totalCost).toBe(0);
                expect(result.runCount).toBe(0);
                expect(result.totalDurationSec).toBe(0);
                expect(result.costByRun).toStrictEqual([]);
            }),
            { numRuns: 10 },
        );
    });

    it('returns zeroed result for undefined input', () => {expect.hasAssertions();

        fc.assert(
            fc.property(fc.boolean(), () => {
                const result = calculatePipelineCost(undefined);

                expect(result.totalCost).toBe(0);
                expect(result.runCount).toBe(0);
                expect(result.totalDurationSec).toBe(0);
                expect(result.costByRun).toStrictEqual([]);
            }),
            { numRuns: 10 },
        );
    });

    it('returns zeroed result for empty array', () => {expect.hasAssertions();

        fc.assert(
            fc.property(fc.boolean(), () => {
                const result = calculatePipelineCost([]);

                expect(result.totalCost).toBe(0);
                expect(result.runCount).toBe(0);
                expect(result.totalDurationSec).toBe(0);
                expect(result.costByRun).toStrictEqual([]);
            }),
            { numRuns: 10 },
        );
    });

    it('uses default cost per minute of 0.01', () => {expect.hasAssertions();

        fc.assert(
            fc.property(fc.array(metricsRunArb, { minLength: 1, maxLength: 10 }), (runs) => {
                const result = calculatePipelineCost(runs);

                expect(result.costPerMinute).toBe(0.01);
            }),
            { numRuns: 50 },
        );
    });
});

describe('GeneratePipelineCostHtml — property-based', () => {
    it('always produces valid HTML with DOCTYPE', () => {expect.hasAssertions();

        fc.assert(
            fc.property(
                fc.array(metricsRunArb, { maxLength: 10 }),
                fc.option(fc.string({ minLength: 0, maxLength: 20 }), { nil: undefined }),
                costPerMinuteArb,
                (runs, customTitle, cpm) => {
                    const result = calculatePipelineCost(runs, cpm);
                    const html = generatePipelineCostHtml(result, customTitle ?? undefined);

                    expect(html).toContain('<!DOCTYPE html>');
                    expect(html).toContain('</html>');
                },
            ),
            { numRuns: 50 },
        );
    });

    it('contains summary cards', () => {expect.hasAssertions();

        fc.assert(
            fc.property(fc.array(metricsRunArb, { maxLength: 10 }), costPerMinuteArb, (runs, cpm) => {
                const result = calculatePipelineCost(runs, cpm);
                const html = generatePipelineCostHtml(result);

                expect(html).toContain('Total Cost');
                expect(html).toContain('Avg Cost / Run');
                expect(html).toContain('Total Duration');
                expect(html).toContain('Run Count');
            }),
            { numRuns: 50 },
        );
    });

    it('returns error page for null/undefined result', () => {expect.hasAssertions();

        fc.assert(
            fc.property(fc.boolean(), () => {
                const html = generatePipelineCostHtml(null);

                expect(html).toContain('Pipeline Cost Report Error');
            }),
            { numRuns: 10 },
        );
    });
});
