/**
 * Property-Based Tests — Release Score (FT-14)
 *
 * Dimensão 5 — Métricas:
 * - calculateReleaseScore: score sempre [0, 100]
 * - Grade boundaries: excellent>=90, good>=70, needs_attention>=50, critical<50
 * - invertFlakiness: sempre [0, 100]
 * - Breakdown: 4 dimensões, labels fixos
 * - Recommendation: lista todas dimensões falhando
 * - Weights: tasks 0.25, health 0.30, coverage 0.25, flakiness 0.20
 */
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { calculateReleaseScore } from '../quality/release-score.js';

/* ── Helpers ─────────────────────────────────────────────────── */

function pctArb(): fc.Arbitrary<number> {
    return fc.float({ min: 0, max: 100, noDefaultInfinity: true, noNaN: true });
}

function intPctArb(): fc.Arbitrary<number> {
    return fc.integer({ min: 0, max: 100 });
}

function gateArb(): fc.Arbitrary<'pass' | 'fail'> {
    return fc.constantFrom('pass' as const, 'fail' as const);
}

/* ── Tests ───────────────────────────────────────────────────── */

describe('CalculateReleaseScore — property-based', () => {
    it('score sempre em [0, 100]', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(pctArb(), pctArb(), gateArb(), pctArb(), pctArb(), (tasks, health, gate, coverage, flaky) => {
                const result = calculateReleaseScore(tasks, health, gate, coverage, flaky);

                expect(result.score).toBeGreaterThanOrEqual(0);
                expect(result.score).toBeLessThanOrEqual(100);
            }),
            { numRuns: 100 },
        );
    });

    it('grade: excellent >= 90, good >= 70, needs_attention >= 50, critical < 50', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(pctArb(), pctArb(), gateArb(), pctArb(), pctArb(), (tasks, health, gate, coverage, flaky) => {
                const result = calculateReleaseScore(tasks, health, gate, coverage, flaky);
                const s = result.score;
                let expectedGrade: string;
                if (s >= 90) {
                    expectedGrade = 'excellent';
                } else if (s >= 70) {
                    expectedGrade = 'good';
                } else if (s >= 50) {
                    expectedGrade = 'needs_attention';
                } else {
                    expectedGrade = 'critical';
                }

                expect(result.grade).toBe(expectedGrade);
            }),
            { numRuns: 100 },
        );
    });

    it('breakdown: sempre 4 dimensões com labels fixos', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(pctArb(), pctArb(), gateArb(), pctArb(), pctArb(), (tasks, health, gate, coverage, flaky) => {
                const result = calculateReleaseScore(tasks, health, gate, coverage, flaky);

                expect(result.breakdown).toHaveLength(4);
                expect(result.breakdown.map((d) => d.label)).toStrictEqual([
                    'Tasks',
                    'Health',
                    'Coverage',
                    'Flakiness',
                ]);

                for (const d of result.breakdown) {
                    expect(d.score).toBeGreaterThanOrEqual(0);
                    expect(d.score).toBeLessThanOrEqual(100);
                }
            }),
            { numRuns: 100 },
        );
    });

    it('recommendation: "Ready" quando todas >= 70 e healthGate="pass"', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(
                fc.integer({ min: 70, max: 100 }),
                fc.integer({ min: 70, max: 100 }),
                fc.integer({ min: 70, max: 100 }),
                fc.integer({ min: 0, max: 30 }),
                (tasks, health, coverage, flaky) => {
                    const result = calculateReleaseScore(tasks, health, 'pass', coverage, flaky);

                    expect(result.recommendation).toContain('Ready');
                },
            ),
            { numRuns: 100 },
        );
    });

    it('recommendation: lista dimensões falhando', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(
                fc.integer({ min: 0, max: 69 }),
                fc.integer({ min: 0, max: 69 }),
                gateArb(),
                fc.integer({ min: 0, max: 69 }),
                fc.integer({ min: 71, max: 100 }),
                (tasks, health, gate, coverage, flaky) => {
                    const result = calculateReleaseScore(tasks, health, gate, coverage, flaky);

                    expect(result.recommendation).toContain('Improve');
                },
            ),
            { numRuns: 100 },
        );
    });

    it('breakdown status matches score thresholds per dimension', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(pctArb(), pctArb(), gateArb(), pctArb(), pctArb(), (tasks, health, gate, coverage, flaky) => {
                const result = calculateReleaseScore(tasks, health, gate, coverage, flaky);
                for (const d of result.breakdown) {
                    expect(d.score).toBeGreaterThanOrEqual(0);
                    expect(d.score).toBeLessThanOrEqual(100);

                    let expectedStatus: string;
                    if (d.label === 'Health') {
                        expectedStatus = gate;
                    } else if (d.score >= 70) {
                        expectedStatus = 'pass';
                    } else {
                        expectedStatus = 'fail';
                    }

                    expect(d.status).toBe(expectedStatus);
                }
            }),
            { numRuns: 100 },
        );
    });

    it('flakiness score is inversely monotonic with flakyRate', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(intPctArb(), intPctArb(), (a, b) => {
                const resultA = calculateReleaseScore(100, 100, 'pass', 100, a);
                const resultB = calculateReleaseScore(100, 100, 'pass', 100, b);
                const flkAEntry = resultA.breakdown.find((d) => d.label === 'Flakiness');
                const flkBEntry = resultB.breakdown.find((d) => d.label === 'Flakiness');
                if (flkAEntry === undefined || flkBEntry === undefined) {
                    throw new Error('Flakiness entry not found in breakdown');
                }
                const flkA = flkAEntry.score;
                const flkB = flkBEntry.score;
                let isMonotonic: boolean;
                if (a > b) {
                    isMonotonic = flkA <= flkB;
                } else if (a < b) {
                    isMonotonic = flkA >= flkB;
                } else {
                    isMonotonic = flkA === flkB;
                }

                expect(isMonotonic).toBeTruthy();
            }),
            { numRuns: 100 },
        );
    });

    it('score is monotonic in each positive dimension', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(
                fc.integer({ min: 0, max: 99 }),
                fc.integer({ min: 0, max: 99 }),
                fc.integer({ min: 0, max: 99 }),
                fc.integer({ min: 0, max: 99 }),
                (tasks, health, coverage, flaky) => {
                    const result = calculateReleaseScore(tasks, health, 'pass', coverage, flaky);
                    const higher = calculateReleaseScore(tasks + 1, health + 1, 'pass', coverage + 1, flaky);

                    expect(higher.score).toBeGreaterThanOrEqual(result.score);
                },
            ),
            { numRuns: 100 },
        );
    });

    it('score boundary cases: all-zero gives 0, all-max gives 100', () => {
        const zero = calculateReleaseScore(0, 0, 'pass', 0, 100);

        expect(zero.score).toBe(0);

        const full = calculateReleaseScore(100, 100, 'pass', 100, 0);

        expect(full.score).toBe(100);
    });

    it('timestamp no formato ISO', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(pctArb(), pctArb(), gateArb(), pctArb(), pctArb(), (tasks, health, gate, coverage, flaky) => {
                const result = calculateReleaseScore(tasks, health, gate, coverage, flaky);

                expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
            }),
            { numRuns: 50 },
        );
    });
});

/* ──────────────────────────────────────────────────────────────
 * Edge-case stress tests — NaN, Infinity, weight normalization
 * These tests are designed to BREAK the code, not just validate it.
 * ────────────────────────────────────────────────────────────── */

describe('CalculateReleaseScore — edge cases (no mocks)', () => {
    it('naN in tasksPct does not crash and yields valid score', () => {
        const result = calculateReleaseScore(Number.NaN, 80, 'pass', 80, 2);

        expect(result.score).toBeGreaterThanOrEqual(0);
        expect(result.score).toBeLessThanOrEqual(100);
        expect(result.grade).toBeDefined();
    });

    it('naN in healthScore does not crash and yields valid score', () => {
        const result = calculateReleaseScore(80, Number.NaN, 'pass', 80, 2);

        expect(result.score).toBeGreaterThanOrEqual(0);
        expect(result.score).toBeLessThanOrEqual(100);
    });

    it('naN in coveragePct does not crash and yields valid score', () => {
        const result = calculateReleaseScore(80, 80, 'pass', Number.NaN, 2);

        expect(result.score).toBeGreaterThanOrEqual(0);
        expect(result.score).toBeLessThanOrEqual(100);
    });

    it('naN in flakyRate does not crash and yields valid score', () => {
        const result = calculateReleaseScore(80, 80, 'pass', 80, Number.NaN);

        expect(result.score).toBeGreaterThanOrEqual(0);
        expect(result.score).toBeLessThanOrEqual(100);
    });

    it('undefined tasksPct yields score based on remaining dimensions', () => {
        const result = calculateReleaseScore(undefined, 80, 'pass', 80, 2);

        expect(result.score).toBeGreaterThanOrEqual(0);
        expect(result.score).toBeLessThanOrEqual(100);
        expect(result.breakdown.find((b) => b.label === 'Tasks')?.noData).toBeTruthy();
    });

    it('undefined coveragePct yields score based on remaining dimensions', () => {
        const result = calculateReleaseScore(80, 80, 'pass', undefined, 2);

        expect(result.score).toBeGreaterThanOrEqual(0);
        expect(result.score).toBeLessThanOrEqual(100);
        expect(result.breakdown.find((b) => b.label === 'Coverage')?.noData).toBeTruthy();
    });

    it('all undefined inputs yields score 0', () => {
        const result = calculateReleaseScore(undefined, 80, 'pass', undefined, 2);

        expect(result.score).toBeGreaterThanOrEqual(0);
        expect(result.score).toBeLessThanOrEqual(100);
    });

    it('flakyRate of 100 inverts to 0', () => {
        const result = calculateReleaseScore(80, 80, 'pass', 80, 100);
        const flkEntry = result.breakdown.find((b) => b.label === 'Flakiness');

        expect(flkEntry?.score).toBe(0);
    });

    it('flakyRate of 0 inverts to 100', () => {
        const result = calculateReleaseScore(80, 80, 'pass', 80, 0);
        const flkEntry = result.breakdown.find((b) => b.label === 'Flakiness');

        expect(flkEntry?.score).toBe(100);
    });

    it('weight normalization: when tasksPct is undefined, remaining weights are renormalized', () => {
        const result = calculateReleaseScore(undefined, 80, 'pass', 80, 2);
        const flkScore = 98;
        const expected = Math.round((80 * 0.3 + 80 * 0.25 + flkScore * 0.2) / (0.3 + 0.25 + 0.2));

        expect(result.score).toBe(expected);
    });

    it('all dimensions at 100 yields score 100', () => {
        const result = calculateReleaseScore(100, 100, 'pass', 100, 0);

        expect(result.score).toBe(100);
        expect(result.grade).toBe('excellent');
    });

    it('all dimensions at 0 yields score 0', () => {
        const result = calculateReleaseScore(0, 0, 'fail', 0, 100);

        expect(result.score).toBe(0);
        expect(result.grade).toBe('critical');
    });

    it('recommendation lists all failing dimensions', () => {
        const result = calculateReleaseScore(30, 30, 'fail', 30, 80);

        expect(result.recommendation).toContain('tasks');
        expect(result.recommendation).toContain('health');
        expect(result.recommendation).toContain('coverage');
    });

    it('recommendation says ready when all pass', () => {
        const result = calculateReleaseScore(90, 90, 'pass', 90, 2);

        expect(result.recommendation).toContain('Ready');
    });
});
