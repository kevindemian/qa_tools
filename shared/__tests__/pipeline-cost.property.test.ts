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
import { calculatePipelineCost, generatePipelineCostHtml, DEFAULT_COST_PER_MINUTE } from '../quality/pipeline-cost.js';
import type { DataHub } from '../types/data-hub.js';
import type { PipelineRun } from '../types/ci-cd.js';
import type { PerRunCost } from '../types/data-hub.js';
import { createTestHub } from './test-hub.js';
import { nonNull } from '../test-utils.js';

vi.mock('../logger.js', () => ({
    rootLogger: { error: vi.fn(), info: vi.fn(), child: vi.fn().mockReturnThis() },
}));

vi.mock('../config-accessor.js', () => ({
    default: { get: vi.fn(() => '') },
    get: vi.fn(() => ''),
}));

/* ── Helpers ─────────────────────────────────────────────────── */

const costPerMinuteArb: fc.Arbitrary<number> = fc.integer({ min: 1, max: 100 }).map((n) => n / 100);

let runIdCounter = 0;

function makeCiRun(r: { id?: number; createdAt: string; durationSec: number; conclusion?: string }): PipelineRun {
    runIdCounter += 1;
    const id = r.id ?? runIdCounter;
    const run: PipelineRun = {
        id,
        created_at: r.createdAt,
        run_started_at: r.createdAt,
        updated_at: new Date(new Date(r.createdAt).getTime() + r.durationSec * 1000).toISOString(),
    };
    if (r.conclusion !== undefined) {
        run.conclusion = r.conclusion;
    }
    return run;
}

const ciRunArb = fc
    .record({
        createdAt: fc.integer({ min: 1577836800000, max: 1814400000000 }).map((ts) => new Date(ts).toISOString()),
        durationSec: fc.integer({ min: 60, max: 36000 }),
        conclusion: fc.option(fc.constantFrom('success', 'failure', 'cancelled'), { nil: undefined }),
    })
    .map((r): PipelineRun => {
        runIdCounter += 1;
        const run: PipelineRun = {
            id: runIdCounter,
            created_at: r.createdAt,
            run_started_at: r.createdAt,
            updated_at: new Date(new Date(r.createdAt).getTime() + r.durationSec * 1000).toISOString(),
        };
        if (r.conclusion !== undefined) {
            run.conclusion = r.conclusion;
        }
        return run;
    });

function makeHub(ciRuns: PipelineRun[], overrideSsot?: PerRunCost[]): DataHub {
    const ssot: PerRunCost[] =
        overrideSsot ??
        ciRuns.map((r) => {
            const start = new Date(r.run_started_at ?? r.created_at ?? '').getTime();
            const end = new Date(r.updated_at ?? r.created_at ?? '').getTime();
            const rawMinutes = Number.isFinite(start) && Number.isFinite(end) ? (end - start) / 60_000 : 0;
            const durationMinutesRounded = Math.round(Math.max(rawMinutes, 0) * 100) / 100;
            const safeRate = 0.01;
            const cost = Math.round(durationMinutesRounded * safeRate * 100) / 100;
            return {
                runId: Number(r.id) || runIdCounter,
                timestamp: r.updated_at ?? r.created_at ?? '',
                minutes: durationMinutesRounded,
                cost,
                branch: 'main',
            };
        });
    const hub = createTestHub({ perRunCosts: ssot });
    hub.raw.runs = ciRuns;
    return hub;
}

/* ── Tests ───────────────────────────────────────────────────── */

describe('CalculatePipelineCost — property-based', () => {
    it('cost per run = (durationSec / 60) * costPerMinute', () => {
        expect.hasAssertions();

        const runWithCpmArb = fc
            .tuple(
                fc.integer({ min: 1577836800000, max: 1814400000000 }).map((ts) => new Date(ts).toISOString()),
                fc.integer({ min: 60, max: 36000 }),
                costPerMinuteArb,
            )
            .map(([createdAt, durationSec, cpm]) => {
                const run = makeCiRun({ createdAt, durationSec });
                return { run, cpm };
            });

        fc.assert(
            fc.property(runWithCpmArb, ({ run, cpm }) => {
                const hub = makeHub([run]);
                const result = calculatePipelineCost(cpm, hub);

                const durationSec =
                    (new Date(run.updated_at ?? '').getTime() - new Date(run.run_started_at ?? '').getTime()) / 1000;
                const rawMinutes = Math.max(durationSec / 60, 0);
                const minutesRounded = Math.round(rawMinutes * 100) / 100;
                const expectedCost = Math.round(minutesRounded * cpm * 100) / 100;

                expect(result.costByRun).toHaveLength(1);
                expect(nonNull(result.costByRun[0]).cost).toBeCloseTo(expectedCost, 5);
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
                // PipelineCostEntry has no runId — match by updated_at timestamp
                const runByTimestamp = new Map<string, PipelineRun>();
                for (const run of runs) {
                    if (!run.updated_at) continue;
                    runByTimestamp.set(run.updated_at, run);
                }
                for (const entry of result.costByRun) {
                    const run = runByTimestamp.get(entry.timestamp);
                    if (!run) continue;
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
                const timestamps = runs.map((r) => r.updated_at ?? '').sort((a, b) => a.localeCompare(b));

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
                expect(result.totalDurationSec).toBe(0);
                expect(result.avgCostPerRun).toBe(0);
                expect(result.runCount).toBe(0);
                expect(result.costByRun).toStrictEqual([]);
            }),
            { numRuns: 50 },
        );
    });

    it('uses default cost per minute of 0.01', () => {
        expect.hasAssertions();

        const hub = makeHub([
            {
                id: 1,
                created_at: '2020-01-01T00:00:00.000Z',
                run_started_at: '2020-01-01T00:00:00.000Z',
                updated_at: '2020-01-01T00:01:00.000Z',
            },
        ]);
        const result = calculatePipelineCost(undefined, hub);

        expect(result.costPerMinute).toBeCloseTo(0.01, 5);
        expect(Number.isFinite(result.totalCost)).toBeTruthy();
    });

    it('allows explicit zero cost per minute', () => {
        expect.hasAssertions();

        const hub = makeHub(
            [
                {
                    id: 1,
                    created_at: '2020-01-01T00:00:00.000Z',
                    run_started_at: '2020-01-01T00:00:00.000Z',
                    updated_at: '2020-01-01T00:01:00.000Z',
                },
            ],
            [{ runId: 1, timestamp: '2020-01-01T00:01:00.000Z', minutes: 1, cost: 0, branch: 'main' }],
        );
        const result = calculatePipelineCost(0, hub);

        expect(result.costPerMinute).toBe(0);
        expect(result.totalCost).toBe(0);
        expect(nonNull(result.costByRun[0]).cost).toBe(0);
    });

    it('uses environment variable for cost per minute', () => {
        expect.hasAssertions();

        const prev = process.env['QA_COST_PER_COMPUTE_MINUTE'];
        process.env['QA_COST_PER_COMPUTE_MINUTE'] = '0.10';
        try {
            const hub = makeHub(
                [
                    {
                        id: 1,
                        created_at: '2020-01-01T00:00:00.000Z',
                        run_started_at: '2020-01-01T00:00:00.000Z',
                        updated_at: '2020-01-01T00:01:00.000Z',
                    },
                ],
                [{ runId: 1, timestamp: '2020-01-01T00:01:00.000Z', minutes: 1, cost: 0.1, branch: 'main' }],
            );
            const result = calculatePipelineCost(undefined, hub);

            expect(result.costPerMinute).toBeCloseTo(0.1, 5);
            expect(result.totalCost).toBeCloseTo(0.1, 5);
        } finally {
            if (prev === undefined) {
                delete process.env['QA_COST_PER_COMPUTE_MINUTE'];
            } else {
                process.env['QA_COST_PER_COMPUTE_MINUTE'] = prev;
            }
        }
    });

    it('negative cost per minute is rejected (Rule 24) and falls back to default', () => {
        expect.hasAssertions();

        const hub = makeHub(
            [{ id: 1, run_started_at: '2020-01-01T12:00:00.000Z', updated_at: '2020-01-01T12:01:00.000Z' }],
            [{ runId: 1, timestamp: '2020-01-01T12:01:00.000Z', minutes: 1, cost: 0.01, branch: 'main' }],
        );
        const result = calculatePipelineCost(-0.5, hub);

        expect(result.costPerMinute).toBe(DEFAULT_COST_PER_MINUTE);
        expect(result.totalCost).toBeGreaterThanOrEqual(0);
        expect(nonNull(result.costByRun[0]).cost).toBeGreaterThanOrEqual(0);
    });

    it('nan cost per minute is rejected (Rule 24) and falls back to default', () => {
        expect.hasAssertions();

        const hub = makeHub(
            [{ id: 1, run_started_at: '2020-01-01T12:00:00.000Z', updated_at: '2020-01-01T12:01:00.000Z' }],
            [{ runId: 1, timestamp: '2020-01-01T12:01:00.000Z', minutes: 1, cost: 0.01, branch: 'main' }],
        );
        const result = calculatePipelineCost(Number.NaN, hub);

        expect(result.costPerMinute).toBe(DEFAULT_COST_PER_MINUTE);
        expect(Number.isFinite(result.totalCost)).toBeTruthy();
    });
});

describe('GeneratePipelineCostHtml — data attributes', () => {
    it('includes data-part="target" with threshold values', () => {
        expect.hasAssertions();

        const result = {
            totalCost: 0.01,
            avgCostPerRun: 0.01,
            totalDurationSec: 60,
            costPerMinute: 0.01,
            costByRun: [{ timestamp: '2020-01-01T12:01:00.000Z', durationSec: 60, cost: 0.01, status: 'passed' }],
            runCount: 1,
            period: { from: '2020-01-01T12:00:00.000Z', to: '2020-01-01T12:00:00.000Z' },
            timestamp: '2020-01-01T12:01:00.000Z',
        };

        const html = generatePipelineCostHtml(result);

        expect(html).toContain('data-part="target"');
        expect(html).toContain('target: <$50.00');
        expect(html).toContain('target: <$10.00');
    });

    it('includes data-part="timestamp"', () => {
        expect.hasAssertions();

        const result = {
            totalCost: 0.01,
            avgCostPerRun: 0.01,
            totalDurationSec: 60,
            costPerMinute: 0.01,
            costByRun: [{ timestamp: '2020-01-01T12:01:00.000Z', durationSec: 60, cost: 0.01, status: 'passed' }],
            runCount: 1,
            period: { from: '2020-01-01T12:00:00.000Z', to: '2020-01-01T12:00:00.000Z' },
            timestamp: '2020-01-01T12:01:00.000Z',
        };

        const html = generatePipelineCostHtml(result);

        expect(html).toContain('data-part="timestamp"');
    });
});

describe('GeneratePipelineCostHtml — EmptyState', () => {
    it('shows EmptyState when costByRun is empty', () => {
        expect.hasAssertions();

        const result = {
            totalCost: 0,
            avgCostPerRun: 0,
            totalDurationSec: 0,
            costPerMinute: 0.01,
            costByRun: [],
            runCount: 0,
            period: { from: '', to: '' },
            timestamp: '2020-01-01T12:00:00.000Z',
        };

        const html = generatePipelineCostHtml(result);

        expect(html).toContain('No pipeline run data available');
    });
});
