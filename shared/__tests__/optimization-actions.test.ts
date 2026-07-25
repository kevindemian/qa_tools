/**
 * computeOptimizationActions — Testes robustos.
 *
 * Testa compute/optimization-actions.ts com PBT, edge cases e negativos.
 * Fluxo real — zero mocks internos.
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { computeOptimizationActions } from '../data-hub/compute/optimization-actions.js';

// ─── Tests ──────────────────────────────────────────────────────────

describe('ComputeOptimizationActions', () => {
    describe('Empty input', () => {
        it('returns empty result for empty maps', () => {
            expect.hasAssertions();

            const r = computeOptimizationActions({}, {});

            expect(r.optimizations).toHaveLength(0);
            expect(r.totalTests).toBe(0);
            expect(r.totalDuration).toBe(0);
            expect(r.potentialSavings).toBe(0);
        });

        it('skips entries with empty durations array', () => {
            expect.hasAssertions();

            const r = computeOptimizationActions({ test: [] }, {});

            expect(r.optimizations).toHaveLength(0);
            expect(r.totalTests).toBe(0);
        });
    });

    describe('Action classification (deterministic)', () => {
        it('quarantine for high flakiness', () => {
            expect.hasAssertions();

            const r = computeOptimizationActions({ flaky: [1000] }, { flaky: 0.5 });

            expect(r.optimizations).toHaveLength(1);
            expect(r.optimizations[0]?.action).toBe('quarantine');
            expect(r.optimizations[0]?.impact).toBe('high');
        });

        it('split for > 3x threshold', () => {
            expect.hasAssertions();

            // default threshold 5s, split at > 15s → need avgDuration > 15000ms
            const r = computeOptimizationActions({ slow: [20000] }, { slow: 0 });

            expect(r.optimizations).toHaveLength(1);
            expect(r.optimizations[0]?.action).toBe('split');
            expect(r.optimizations[0]?.impact).toBe('high');
        });

        it('parallelize for > 2x threshold', () => {
            expect.hasAssertions();

            const r = computeOptimizationActions({ medium: [12000] }, { medium: 0 });

            expect(r.optimizations).toHaveLength(1);
            expect(r.optimizations[0]?.action).toBe('parallelize');
            expect(r.optimizations[0]?.impact).toBe('medium');
        });

        it('remove_wait for > 1.5x with low flakiness', () => {
            expect.hasAssertions();

            const r = computeOptimizationActions({ wait: [9000] }, { wait: 0.05 });

            expect(r.optimizations).toHaveLength(1);
            expect(r.optimizations[0]?.action).toBe('remove_wait');
            expect(r.optimizations[0]?.impact).toBe('medium');
        });

        it('speed_up for > threshold', () => {
            expect.hasAssertions();

            const r = computeOptimizationActions({ slowish: [6000] }, { slowish: 0 });

            expect(r.optimizations).toHaveLength(1);
            expect(r.optimizations[0]?.action).toBe('speed_up');
            expect(r.optimizations[0]?.impact).toBe('low');
        });

        it('none for within threshold', () => {
            expect.hasAssertions();

            const r = computeOptimizationActions({ fast: [4000] }, { fast: 0 });

            expect(r.optimizations).toHaveLength(1);
            expect(r.optimizations[0]?.action).toBe('none');
            expect(r.optimizations[0]?.impact).toBe('low');
        });
    });

    describe('Mathematical invariants (PBT)', () => {
        it('optimizations sorted by impact (high first)', () => {
            expect.hasAssertions();

            const impactOrder = { high: 0, medium: 1, low: 2, none: 3 };
            fc.assert(
                fc.property(
                    fc.dictionary(
                        fc.string({ minLength: 1, maxLength: 10 }),
                        fc.array(fc.nat({ max: 60000 }), { minLength: 1, maxLength: 10 }),
                    ),
                    fc.dictionary(
                        fc.string({ minLength: 1, maxLength: 10 }),
                        fc.float({ min: 0, max: 1, noDefaultInfinity: true, noNaN: true }),
                    ),
                    (durations, flakiness) => {
                        const r = computeOptimizationActions(durations, flakiness);
                        for (let i = 1; i < r.optimizations.length; i++) {
                            const a = impactOrder[r.optimizations[i - 1]?.impact as keyof typeof impactOrder];
                            const b = impactOrder[r.optimizations[i]?.impact as keyof typeof impactOrder];

                            expect(a).toBeLessThanOrEqual(b);
                        }
                    },
                ),
                { numRuns: 100 },
            );
        });

        it('totalTests equals number of tests with non-empty durations', () => {
            expect.hasAssertions();

            fc.assert(
                fc.property(
                    fc.dictionary(
                        fc.string({ minLength: 1, maxLength: 10 }),
                        fc.array(fc.nat({ max: 60000 }), { minLength: 0, maxLength: 10 }),
                    ),
                    (durations) => {
                        const r = computeOptimizationActions(durations, {});
                        const expected = Object.values(durations).filter((d) => d.length > 0).length;

                        expect(r.totalTests).toBe(expected);
                    },
                ),
                { numRuns: 100 },
            );
        });

        it('quarantine always has impact=high', () => {
            expect.hasAssertions();

            fc.assert(
                fc.property(
                    fc.array(fc.nat({ max: 60000 }), { minLength: 1, maxLength: 5 }),
                    fc.float({ min: Math.fround(0.31), max: 1, noDefaultInfinity: true, noNaN: true }),
                    (durs, flaky) => {
                        const r = computeOptimizationActions({ test: durs }, { test: flaky });

                        expect(r.optimizations.length).toBeGreaterThanOrEqual(0);

                        const quarantine = r.optimizations.filter((o) => o.action === 'quarantine');
                        for (const q of quarantine) {
                            expect(q.impact).toBe('high');
                        }
                    },
                ),
                { numRuns: 50 },
            );
        });
    });

    describe('Threshold clamping', () => {
        it('negative slowThreshold clamped to 5', () => {
            expect.hasAssertions();

            const r = computeOptimizationActions({ test: [4000] }, {}, -1);

            expect(r.slowThreshold).toBe(5);
        });

        it('negative flakyThreshold clamped to 0.3', () => {
            expect.hasAssertions();

            const r = computeOptimizationActions({ test: [1000] }, { test: 0.5 }, 5, -0.1);

            expect(r.flakyThreshold).toBeCloseTo(0.3);
        });

        it('flakyThreshold > 1 clamped to 0.3', () => {
            expect.hasAssertions();

            const r = computeOptimizationActions({ test: [1000] }, { test: 0.5 }, 5, 2);

            expect(r.flakyThreshold).toBeCloseTo(0.3);
        });
    });

    describe('Edge cases', () => {
        it('potentialSavings accumulates across tests', () => {
            expect.hasAssertions();

            const r = computeOptimizationActions({ a: [10000], b: [12000] }, { a: 0, b: 0 });

            expect(r.potentialSavings).toBeGreaterThan(0);
        });

        it('flakiness > flakyThreshold AND slow > threshold → quarantine wins', () => {
            expect.hasAssertions();

            const r = computeOptimizationActions({ both: [20000] }, { both: 0.5 });

            expect(r.optimizations[0]?.action).toBe('quarantine');
        });

        it('custom thresholds work', () => {
            expect.hasAssertions();

            const r = computeOptimizationActions({ test: [1500] }, { test: 0 }, 1, 0.5);

            // 1.5s > 1s threshold → speed_up
            expect(r.optimizations[0]?.action).toBe('speed_up');
        });
    });
});
