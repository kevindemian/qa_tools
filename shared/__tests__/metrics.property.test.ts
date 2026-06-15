/**
 * Property-Based Tests — Metrics (FT-04)
 *
 * Verifies invariants of metrics calculations using fast-check.
 * Properties defined from domain logic, not current implementation.
 *
 * Dimensão 5 — Métricas: validação de fórmulas e invariantes.
 */
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { calculateFlakiness, calculateFlakyRate, getTrends } from '../metrics.js';
import type { MetricsRun, MetricsStore } from '../metrics.js';

/* ──────────────────────────────────────────────────────────────
 * Property-Based Arbitraries
 * ────────────────────────────────────────────────────────────── */

/** Valid test states */
const TestStateArb = fc.constantFrom('passed' as const, 'failed' as const, 'skipped' as const);

/** A single FlatTest */
const FlatTestArb: fc.Arbitrary<{
    title: string;
    state: 'passed' | 'failed' | 'skipped';
    duration: number;
}> = fc.record({
    title: fc.string({ minLength: 1, maxLength: 30 }),
    state: TestStateArb,
    duration: fc.nat({ max: 60000 }),
});

/** A single MetricsRun — enforces total >= passed + failed + skipped */
const MetricsRunArb = fc
    .tuple(fc.nat({ max: 1000 }), fc.nat({ max: 1000 }), fc.nat({ max: 1000 }))
    .chain(([passed, failed, skipped]) => {
        const executed = passed + failed + skipped;
        return fc.record({
            timestamp: fc.string({ minLength: 1, maxLength: 30 }),
            project: fc.string({ minLength: 1, maxLength: 20 }),
            total: fc.constant(executed),
            passed: fc.constant(passed),
            failed: fc.constant(failed),
            skipped: fc.constant(skipped),
            duration: fc.nat({ max: 3600000 }),
            tests: fc.array(FlatTestArb, { minLength: 0, maxLength: 50 }),
        });
    });

/** Generate a run array where the same test names may repeat across runs */
function runsWithSharedTestNames(
    maxRuns = 5,
    maxTestsPerRun = 10,
    sharedTestNames: string[],
): fc.Arbitrary<MetricsRun[]> {
    const namePool =
        sharedTestNames.length > 0 ? fc.constantFrom(...sharedTestNames) : fc.string({ minLength: 1, maxLength: 10 });

    const runArb = fc.array(
        fc.record({
            title: namePool,
            state: TestStateArb,
            duration: fc.nat({ max: 60000 }),
        }),
        { minLength: 1, maxLength: maxTestsPerRun },
    );

    return fc.array(
        fc.record({
            timestamp: fc.string({ minLength: 1, maxLength: 30 }),
            project: fc.constant('p'),
            total: fc.nat({ max: 1000 }),
            passed: fc.nat({ max: 1000 }),
            failed: fc.nat({ max: 1000 }),
            skipped: fc.nat({ max: 1000 }),
            duration: fc.nat({ max: 3600000 }),
            tests: runArb,
        }),
        { minLength: 1, maxLength: maxRuns },
    );
}

/* ──────────────────────────────────────────────────────────────
 * Properties — calculateFlakyRate
 * ────────────────────────────────────────────────────────────── */

describe('calculateFlakyRate — property-based', () => {
    it('always returns a value in [0, 100]', () => {
        fc.assert(
            fc.property(
                fc.array(MetricsRunArb, { minLength: 0, maxLength: 10 }),
                fc.nat({ max: 10 }),
                (runs, minRuns) => {
                    const store: MetricsStore = { runs };
                    const rate = calculateFlakyRate(store, Math.max(1, minRuns));
                    expect(rate).toBeGreaterThanOrEqual(0);
                    expect(rate).toBeLessThanOrEqual(100);
                },
            ),
            { numRuns: 100 },
        );
    });

    it('returns 0 for empty store', () => {
        const store: MetricsStore = { runs: [] };
        expect(calculateFlakyRate(store)).toBe(0);
        expect(calculateFlakyRate(store, 1)).toBe(0);
        expect(calculateFlakyRate(store, 10)).toBe(0);
    });

    it('returns 0 when no test ever fails', () => {
        fc.assert(
            fc.property(runsWithSharedTestNames(5, 10, ['t1', 't2', 't3']), (runs) => {
                // Force all tests to 'passed'
                for (const run of runs) {
                    for (const t of run.tests) {
                        t.state = 'passed' as const;
                    }
                }
                const store: MetricsStore = { runs };
                const rate = calculateFlakyRate(store, 2);
                expect(rate).toBe(0);
            }),
            { numRuns: 50 },
        );
    });

    it('returns 100 when every test is flaky in every run above minRuns', () => {
        fc.assert(
            fc.property(
                fc.nat({ max: 5 }).map((n) => n + 2), // numTestNames: 2-7
                fc.nat({ max: 4 }).map((n) => n + 2), // numRuns: 2-6
                (numTestNames, numRuns) => {
                    const testNames = Array.from({ length: numTestNames }, (_, i) => `t${i}`);
                    const runs: MetricsRun[] = [];

                    // Create runs where each test alternates pass/fail across runs
                    for (let r = 0; r < numRuns; r++) {
                        const state: 'passed' | 'failed' = r % 2 === 0 ? 'passed' : 'failed';
                        const tests = testNames.map((name) => ({
                            title: name,
                            state,
                            duration: 100,
                        }));
                        runs.push({
                            timestamp: `2026-01-${String(r + 1).padStart(2, '0')}`,
                            project: 'p',
                            total: numTestNames,
                            passed: r % 2 === 0 ? numTestNames : 0,
                            failed: r % 2 === 0 ? 0 : numTestNames,
                            skipped: 0,
                            duration: 1000,
                            tests,
                        });
                    }

                    const store: MetricsStore = { runs };
                    const rate = calculateFlakyRate(store, 2);
                    expect(rate).toBe(100);
                },
            ),
            { numRuns: 50 },
        );
    });

    it('denominator excludes tests with fewer appearances than minRuns', () => {
        fc.assert(
            fc.property(
                fc
                    .tuple(
                        fc.array(fc.string({ minLength: 1, maxLength: 5 }), { minLength: 2, maxLength: 5 }),
                        fc.nat({ max: 4 }).map((n) => n + 2),
                    )
                    .chain(([sharedNames, numRuns]) => {
                        // Create runs: sharedNames appear in all runs
                        const runs: MetricsRun[] = [];
                        for (let r = 0; r < numRuns; r++) {
                            const s: 'passed' | 'failed' = r % 2 === 0 ? 'passed' : 'failed';
                            const tests = sharedNames.map((name) => ({
                                title: name,
                                state: s,
                                duration: 100,
                            }));
                            runs.push({
                                timestamp: `${r}`,
                                project: 'p',
                                total: sharedNames.length,
                                passed: r % 2 === 0 ? sharedNames.length : 0,
                                failed: r % 2 === 0 ? 0 : sharedNames.length,
                                skipped: 0,
                                duration: 1000,
                                tests,
                            });
                        }
                        // Add one extra test that appears only once
                        (runs[0] as MetricsRun).tests.push({
                            title: 'singleton-once',
                            state: 'passed' as const,
                            duration: 50,
                        });
                        return fc.constant(runs);
                    }),
                (runs) => {
                    const store: MetricsStore = { runs };
                    const minRuns = 2;

                    // All sharedNames appear numRuns times (>= minRuns) and are flaky
                    // The singleton appears only once (< minRuns)
                    // Denominator should exclude the singleton
                    // Expected: flakyCount = sharedNames.length, totalTests = sharedNames.length → 100%
                    const rate = calculateFlakyRate(store, minRuns);

                    expect(rate).toBe(100);
                },
            ),
            { numRuns: 50 },
        );
    });
});

/* ──────────────────────────────────────────────────────────────
 * Properties — calculateFlakiness
 * ────────────────────────────────────────────────────────────── */

describe('calculateFlakiness — property-based', () => {
    it('each entry has consistent counts: pass + fail + skip = totalRuns', () => {
        fc.assert(
            fc.property(
                fc.array(MetricsRunArb, { minLength: 0, maxLength: 8 }),
                fc.nat({ max: 5 }),
                (runs, minRuns) => {
                    const store: MetricsStore = { runs };
                    const entries = calculateFlakiness(store, Math.max(1, minRuns));
                    for (const entry of entries) {
                        expect(entry.passCount + entry.failCount + entry.skipCount).toBe(entry.totalRuns);
                    }
                },
            ),
            { numRuns: 100 },
        );
    });

    it('each entry has rate = failCount / totalRuns in [0, 1]', () => {
        fc.assert(
            fc.property(
                fc.array(MetricsRunArb, { minLength: 0, maxLength: 8 }),
                fc.nat({ max: 5 }),
                (runs, minRuns) => {
                    const store: MetricsStore = { runs };
                    const entries = calculateFlakiness(store, Math.max(1, minRuns));
                    for (const entry of entries) {
                        expect(entry.rate).toBe(entry.failCount / entry.totalRuns);
                        expect(entry.rate).toBeGreaterThanOrEqual(0);
                        expect(entry.rate).toBeLessThanOrEqual(1);
                    }
                },
            ),
            { numRuns: 100 },
        );
    });

    it('only returns entries where fail > 0 and pass > 0', () => {
        fc.assert(
            fc.property(
                fc.array(MetricsRunArb, { minLength: 0, maxLength: 8 }),
                fc.nat({ max: 5 }),
                (runs, minRuns) => {
                    const store: MetricsStore = { runs };
                    const entries = calculateFlakiness(store, Math.max(1, minRuns));
                    for (const entry of entries) {
                        expect(entry.failCount).toBeGreaterThan(0);
                        expect(entry.passCount).toBeGreaterThan(0);
                    }
                },
            ),
            { numRuns: 100 },
        );
    });

    it('only returns entries where totalRuns >= minRuns', () => {
        fc.assert(
            fc.property(
                fc.array(MetricsRunArb, { minLength: 0, maxLength: 8 }),
                fc.nat({ max: 5 }),
                (runs, minRuns) => {
                    const store: MetricsStore = { runs };
                    const entries = calculateFlakiness(store, Math.max(1, minRuns));
                    for (const entry of entries) {
                        expect(entry.totalRuns).toBeGreaterThanOrEqual(Math.max(1, minRuns));
                    }
                },
            ),
            { numRuns: 100 },
        );
    });
});

/* ──────────────────────────────────────────────────────────────
 * Properties — getTrends
 * ────────────────────────────────────────────────────────────── */

describe('getTrends — property-based', () => {
    it('always returns at most `window` entries', () => {
        fc.assert(
            fc.property(
                fc.array(MetricsRunArb, { minLength: 0, maxLength: 20 }),
                fc.nat({ max: 20 }),
                (runs, window) => {
                    const store: MetricsStore = { runs };
                    const trends = getTrends(store, Math.max(1, window));
                    expect(trends.length).toBeLessThanOrEqual(Math.max(1, window));
                },
            ),
            { numRuns: 100 },
        );
    });

    it('each passRate is in [0, 100]', () => {
        fc.assert(
            fc.property(fc.array(MetricsRunArb, { minLength: 0, maxLength: 10 }), (runs) => {
                const store: MetricsStore = { runs };
                const trends = getTrends(store);
                for (const t of trends) {
                    expect(t.passRate).toBeGreaterThanOrEqual(0);
                    expect(t.passRate).toBeLessThanOrEqual(100);
                }
            }),
            { numRuns: 100 },
        );
    });

    it('passRate = passed/(passed+failed)*100, or 0 when no executed tests', () => {
        fc.assert(
            fc.property(fc.array(MetricsRunArb, { minLength: 0, maxLength: 10 }), (runs) => {
                const store: MetricsStore = { runs };
                const trends = getTrends(store);
                trends.forEach((t, i) => {
                    const run = store.runs[store.runs.length - trends.length + i];
                    if (run) {
                        const denom = run.passed + run.failed;
                        const expectedRate = denom > 0 ? (run.passed / denom) * 100 : 0;
                        expect(t.passRate).toBeCloseTo(expectedRate, 5);
                    }
                });
            }),
            { numRuns: 100 },
        );
    });

    it('returns empty array for empty store', () => {
        const store: MetricsStore = { runs: [] };
        expect(getTrends(store)).toEqual([]);
    });
});
