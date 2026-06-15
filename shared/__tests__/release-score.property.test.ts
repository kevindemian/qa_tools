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

function gateArb(): fc.Arbitrary<'pass' | 'fail'> {
    return fc.constantFrom('pass' as const, 'fail' as const);
}

/* ── Tests ───────────────────────────────────────────────────── */

describe('calculateReleaseScore — property-based', () => {
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

    it('breakdown scores correspondem a Math.round dos inputs', () => {
        fc.assert(
            fc.property(pctArb(), pctArb(), gateArb(), pctArb(), pctArb(), (tasks, health, gate, coverage, flaky) => {
                const result = calculateReleaseScore(tasks, health, gate, coverage, flaky);
                for (const d of result.breakdown) {
                    switch (d.label) {
                        case 'Tasks':
                            expect(d.score).toBe(Math.round(tasks));
                            break;
                        case 'Health':
                            expect(d.score).toBe(Math.round(health));
                            break;
                        case 'Coverage':
                            expect(d.score).toBe(Math.round(coverage));
                            break;
                        case 'Flakiness': {
                            const expected = Math.round(Math.max(0, Math.min(100, 100 - flaky)));
                            expect(d.score).toBe(expected);
                            break;
                        }
                    }
                }
            }),
            { numRuns: 100 },
        );
    });

    it('pesos somam 1.0 e score = round(weighted sum)', () => {
        fc.assert(
            fc.property(pctArb(), pctArb(), gateArb(), pctArb(), pctArb(), (tasks, health, gate, coverage, flaky) => {
                const result = calculateReleaseScore(tasks, health, gate, coverage, flaky);
                const flkScore = Math.max(0, Math.min(100, 100 - flaky));
                const expected = Math.round(tasks * 0.25 + health * 0.3 + coverage * 0.25 + flkScore * 0.2);
                expect(result.score).toBe(expected);
            }),
            { numRuns: 100 },
        );
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
