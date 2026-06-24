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
import { calculateReleaseScore } from '../release-score.js';

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
        fc.assert(
            fc.property(pctArb(), pctArb(), gateArb(), pctArb(), pctArb(), (tasks, health, gate, coverage, flaky) => {
                const result = calculateReleaseScore(tasks, health, gate, coverage, flaky);
                const s = result.score;
                if (s >= 90) expect(result.grade).toBe('excellent');
                else if (s >= 70) expect(result.grade).toBe('good');
                else if (s >= 50) expect(result.grade).toBe('needs_attention');
                else expect(result.grade).toBe('critical');
            }),
            { numRuns: 100 },
        );
    });

    it('breakdown: sempre 4 dimensões com labels fixos', () => {
        fc.assert(
            fc.property(pctArb(), pctArb(), gateArb(), pctArb(), pctArb(), (tasks, health, gate, coverage, flaky) => {
                const result = calculateReleaseScore(tasks, health, gate, coverage, flaky);

                expect(result.breakdown).toHaveLength(4);
                expect(result.breakdown.map((d) => d.label)).toEqual(['Tasks', 'Health', 'Coverage', 'Flakiness']);

                for (const d of result.breakdown) {
                    expect(d.score).toBeGreaterThanOrEqual(0);
                    expect(d.score).toBeLessThanOrEqual(100);
                }
            }),
            { numRuns: 100 },
        );
    });

    it('recommendation: "Ready" quando todas >= 70 e healthGate="pass"', () => {
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
        fc.assert(
            fc.property(pctArb(), pctArb(), gateArb(), pctArb(), pctArb(), (tasks, health, gate, coverage, flaky) => {
                const result = calculateReleaseScore(tasks, health, gate, coverage, flaky);
                for (const d of result.breakdown) {
                    expect(d.score).toBeGreaterThanOrEqual(0);
                    expect(d.score).toBeLessThanOrEqual(100);

                    if (d.label === 'Health') {
                        expect(d.status).toBe(gate);
                    } else {
                        expect(d.status).toBe(d.score >= 70 ? 'pass' : 'fail');
                    }
                }
            }),
            { numRuns: 100 },
        );
    });

    it('flakiness score is inversely monotonic with flakyRate', () => {
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
                if (a > b) {
                    expect(flkA).toBeLessThanOrEqual(flkB);
                } else if (a < b) {
                    expect(flkA).toBeGreaterThanOrEqual(flkB);
                } else {
                    expect(flkA).toBe(flkB);
                }
            }),
            { numRuns: 100 },
        );
    });

    it('score is monotonic in each positive dimension', () => {
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
        fc.assert(
            fc.property(pctArb(), pctArb(), gateArb(), pctArb(), pctArb(), (tasks, health, gate, coverage, flaky) => {
                const result = calculateReleaseScore(tasks, health, gate, coverage, flaky);

                expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
            }),
            { numRuns: 50 },
        );
    });
});
