/**
 * Property-Based Tests — Pipeline Cost (FT-29)
 *
 * Invariants (SSOT: custo derivado de dataHub.raw.runs / PipelineRun do CI):
 * - calculatePipelineCost: cost = (durationSec / 60) * costPerMinute
 * - totalCost = sum of entry costs
 * - totalDurationSec = sum of durations
 * - avgCostPerRun = totalCost / runCount
 * - status logic: conclusion success → 'passed', failure → 'failed', else 'unknown'
 * - DataHub sem runs → resultado zerado
 * - generatePipelineCostHtml always produces valid HTML with DOCTYPE
 */
import * as fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';
import { calculatePipelineCost, generatePipelineCostHtml } from '../pipeline-cost.js';
import type { DataHub } from '../types/data-hub.js';
import type { PipelineRun } from '../types/ci-cd.js';
import { createTestHub } from './test-hub.js';

vi.mock('../logger.js', () => ({
    rootLogger: { error: vi.fn(), info: vi.fn(), child: vi.fn().mockReturnThis() },
}));

vi.mock('../config.js', () => ({
    default: { get: vi.fn(() => '') },
    get: vi.fn(() => ''),
}));

/* ── Helpers ─────────────────────────────────────────────────── */

const costPerMinuteArb: fc.Arbitrary<number> = fc.integer({ min: 1, max: 100 }).map((n) => n / 100);

const ciRunArb = fc
    .record({
        createdAt: fc.integer({ min: 1577836800000, max: 1814400000000 }).map((ts) => new Date(ts).toISOString()),
        durationSec: fc.nat({ max: 36000 }),
        conclusion: fc.option(fc.constantFrom('success', 'failure', 'cancelled'), { nil: undefined }),
    })
    .map((r): PipelineRun => {
        const run: PipelineRun = {
            id: 1,
            created_at: r.createdAt,
            run_started_at: r.createdAt,
            updated_at: new Date(new Date(r.createdAt).getTime() + r.durationSec * 1000).toISOString(),
        };
        if (r.conclusion !== undefined) {
            run.conclusion = r.conclusion;
        }
        return run;
    });

function makeHub(ciRuns: PipelineRun[]): DataHub {
    const hub = createTestHub();
    hub.raw.runs = ciRuns;
    return hub;
}

/* ── Tests ───────────────────────────────────────────────────── */

describe('CalculatePipelineCost — property-based', () => {
    it('cost per run = (durationSec / 60) * costPerMinute', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(fc.array(ciRunArb, { minLength: 1, maxLength: 20 }), costPerMinuteArb, (runs, cpm) => {
                const result = calculatePipelineCost(cpm, makeHub(runs));
                for (const entry of result.costByRun) {
                    const expected = (entry.durationSec / 60) * cpm;

                    expect(entry.cost).toBeCloseTo(expected, 5);
                }
            }),
            { numRuns: 50 },
        );
    });

    it('totalCost = sum of all entry costs', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(fc.array(ciRunArb, { minLength: 1, maxLength: 20 }), costPerMinuteArb, (runs, cpm) => {
                const result = calculatePipelineCost(cpm, makeHub(runs));
                const sum = result.costByRun.reduce((s, e) => s + e.cost, 0);

                expect(result.totalCost).toBeCloseTo(sum, 5);
            }),
            { numRuns: 50 },
        );
    });

    it('totalDurationSec = sum of all durations', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(fc.array(ciRunArb, { minLength: 1, maxLength: 20 }), costPerMinuteArb, (runs, cpm) => {
                const result = calculatePipelineCost(cpm, makeHub(runs));
                const sum = result.costByRun.reduce((s, e) => s + e.durationSec, 0);

                expect(result.totalDurationSec).toBe(sum);
            }),
            { numRuns: 50 },
        );
    });

    it('avgCostPerRun = totalCost / runCount', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(fc.array(ciRunArb, { minLength: 1, maxLength: 20 }), costPerMinuteArb, (runs, cpm) => {
                const result = calculatePipelineCost(cpm, makeHub(runs));
                const expected = result.totalCost / result.runCount;

                expect(result.avgCostPerRun).toBeCloseTo(expected, 5);
            }),
            { numRuns: 50 },
        );
    });

    it('status: success → passed, failure → failed, else unknown', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(fc.array(ciRunArb, { minLength: 1, maxLength: 20 }), costPerMinuteArb, (runs, cpm) => {
                const result = calculatePipelineCost(cpm, makeHub(runs));
                const sortedRuns = [...runs].sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''));
                for (let i = 0; i < result.costByRun.length; i++) {
                    const entry = Reflect.get(result.costByRun, i) as { status: string; timestamp: string } | undefined;
                    const run = Reflect.get(sortedRuns, i) as { conclusion?: string; created_at?: string } | undefined;
                    if (!entry || !run) continue;
                    let expectedStatus: string;
                    if (run.conclusion === 'success') {
                        expectedStatus = 'passed';
                    } else if (run.conclusion === 'failure') {
                        expectedStatus = 'failed';
                    } else {
                        expectedStatus = 'unknown';
                    }

                    expect(entry.status).toBe(expectedStatus);
                }
            }),
            { numRuns: 50 },
        );
    });

    it('entries sorted by timestamp descending', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(fc.array(ciRunArb, { minLength: 1, maxLength: 20 }), costPerMinuteArb, (runs, cpm) => {
                const result = calculatePipelineCost(cpm, makeHub(runs));
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

    it('period.from is earliest, period.to is latest', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(fc.array(ciRunArb, { minLength: 1, maxLength: 20 }), costPerMinuteArb, (runs, cpm) => {
                const result = calculatePipelineCost(cpm, makeHub(runs));
                const timestamps = runs.map((r) => r.created_at ?? '').sort((a, b) => a.localeCompare(b));

                expect(result.period.from).toBe(timestamps[0]);
                expect(result.period.to).toBe(timestamps[timestamps.length - 1]);
            }),
            { numRuns: 50 },
        );
    });

    it('returns zeroed result when DataHub has no runs', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(fc.boolean(), () => {
                const result = calculatePipelineCost(undefined, makeHub([]));

                expect(result.totalCost).toBe(0);
                expect(result.runCount).toBe(0);
                expect(result.totalDurationSec).toBe(0);
                expect(result.costByRun).toStrictEqual([]);
            }),
            { numRuns: 10 },
        );
    });

    it('uses default cost per minute of 0.01', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(fc.array(ciRunArb, { minLength: 1, maxLength: 10 }), (runs) => {
                const result = calculatePipelineCost(undefined, makeHub(runs));

                expect(result.costPerMinute).toBeCloseTo(0.01);
            }),
            { numRuns: 50 },
        );
    });
});

describe('GeneratePipelineCostHtml — property-based', () => {
    it('always produces valid HTML with DOCTYPE', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(
                fc.array(ciRunArb, { maxLength: 10 }),
                fc.option(fc.string({ minLength: 0, maxLength: 20 }), { nil: undefined }),
                costPerMinuteArb,
                (runs, customTitle, cpm) => {
                    const result = calculatePipelineCost(cpm, makeHub(runs));
                    const html = generatePipelineCostHtml(result, customTitle ?? undefined);

                    expect(html).toContain('<!DOCTYPE html>');
                    expect(html).toContain('</html>');
                },
            ),
            { numRuns: 50 },
        );
    });

    it('contains summary cards', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(fc.array(ciRunArb, { maxLength: 10 }), costPerMinuteArb, (runs, cpm) => {
                const result = calculatePipelineCost(cpm, makeHub(runs));
                const html = generatePipelineCostHtml(result);

                expect(html).toContain('Total Cost');
                expect(html).toContain('Avg Cost / Run');
                expect(html).toContain('Total Duration');
                expect(html).toContain('Run Count');
            }),
            { numRuns: 50 },
        );
    });

    it('returns error page for null/undefined result', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(fc.boolean(), () => {
                const html = generatePipelineCostHtml(null);

                expect(html).toContain('Pipeline Cost Report Error');
            }),
            { numRuns: 10 },
        );
    });
});
