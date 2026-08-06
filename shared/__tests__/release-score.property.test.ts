/**
 * Property-Based Tests — Release Score (B3 SSOT)
 *
 * Invariants that must hold for ALL inputs of `calcReleaseScore` (5-dim model):
 * - score sempre em [0, 100]
 * - Grade boundaries: excellent>=90, good>=80, needs_attention>=70, poor>=60, critical<60
 * - Breakdown: 5 dimensões, labels fixos
 * - Recommendation: 'Ready' quando todas passam; 'Improve' quando alguma falha
 * - Breakdown status espelha o status da dimensão
 * - Score monotônico em cada dimensão
 * - NaN em qualquer dimensão não propaga ao compósito (§24)
 */
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { calcReleaseScore } from '../data-hub/compute/release-score.js';
import type { HealthDimensions } from '../types/data-hub.js';

const KEYS: Array<keyof HealthDimensions> = ['passRate', 'flakyRate', 'coverage', 'suiteSpeed', 'executionRate'];

function pctArb(): fc.Arbitrary<number> {
    return fc.float({ min: 0, max: 100, noDefaultInfinity: true, noNaN: true });
}

function statusArb(): fc.Arbitrary<'pass' | 'fail'> {
    return fc.constantFrom('pass' as const, 'fail' as const);
}

function dimsArb(): fc.Arbitrary<HealthDimensions> {
    return fc
        .tuple(
            pctArb(),
            statusArb(),
            pctArb(),
            statusArb(),
            pctArb(),
            statusArb(),
            pctArb(),
            statusArb(),
            pctArb(),
            statusArb(),
        )
        .map(([a, as, b, bs, c, cs, d, ds, e, es]) => ({
            passRate: { score: a, status: as },
            flakyRate: { score: b, status: bs },
            coverage: { score: c, status: cs },
            suiteSpeed: { score: d, status: ds },
            executionRate: { score: e, status: es },
        }));
}

describe('CalcReleaseScore — property-based', () => {
    it('score sempre em [0, 100]', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(dimsArb(), (dimensions) => {
                const result = calcReleaseScore(dimensions);

                expect(result.score).toBeGreaterThanOrEqual(0);
                expect(result.score).toBeLessThanOrEqual(100);
            }),
            { numRuns: 100 },
        );
    });

    it('grade: excellent>=90, good>=80, needs_attention>=70, poor>=60, critical<60', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(dimsArb(), (dimensions) => {
                const s = calcReleaseScore(dimensions).score;
                let expectedGrade: string;
                if (s >= 90) {
                    expectedGrade = 'excellent';
                } else if (s >= 80) {
                    expectedGrade = 'good';
                } else if (s >= 70) {
                    expectedGrade = 'needs_attention';
                } else if (s >= 60) {
                    expectedGrade = 'poor';
                } else {
                    expectedGrade = 'critical';
                }

                expect(calcReleaseScore(dimensions).grade).toBe(expectedGrade);
            }),
            { numRuns: 100 },
        );
    });

    it('breakdown: sempre 5 dimensões com labels fixos e scores em [0, 100]', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(dimsArb(), (dimensions) => {
                const result = calcReleaseScore(dimensions);
                const labels = (result.breakdown ?? []).map((d) => d.label);

                expect(labels).toStrictEqual(['Pass Rate', 'Flaky Rate', 'Coverage', 'Suite Speed', 'Execution Rate']);

                for (const d of result.breakdown ?? []) {
                    expect(d.score).toBeGreaterThanOrEqual(0);
                    expect(d.score).toBeLessThanOrEqual(100);
                }
            }),
            { numRuns: 100 },
        );
    });

    it('breakdown status espelha o status de cada dimensão', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(dimsArb(), (dimensions) => {
                const result = calcReleaseScore(dimensions);
                const breakdown = result.breakdown ?? [];

                expect(breakdown).toHaveLength(KEYS.length);

                for (const [i, key] of KEYS.entries()) {
                    expect(breakdown[i]?.status).toBe(dimensions[key].status);
                    expect(breakdown[i]?.score).toBe(dimensions[key].score);
                }
            }),
            { numRuns: 100 },
        );
    });

    it('recommendation: "Ready" quando todas as dimensões passam', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(
                fc.integer({ min: 70, max: 100 }),
                fc.integer({ min: 70, max: 100 }),
                fc.integer({ min: 70, max: 100 }),
                fc.integer({ min: 70, max: 100 }),
                fc.integer({ min: 70, max: 100 }),
                (a, b, c, d, e) => {
                    const dimensions: HealthDimensions = {
                        passRate: { score: a, status: 'pass' },
                        flakyRate: { score: b, status: 'pass' },
                        coverage: { score: c, status: 'pass' },
                        suiteSpeed: { score: d, status: 'pass' },
                        executionRate: { score: e, status: 'pass' },
                    };

                    expect(calcReleaseScore(dimensions).recommendation).toContain('Ready');
                },
            ),
            { numRuns: 100 },
        );
    });

    it('recommendation: lista dimensões falhando quando alguma falha', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(dimsArb(), (dimensions) => {
                const anyFail = KEYS.some((k) => dimensions[k].status === 'fail');

                fc.pre(anyFail);

                expect(calcReleaseScore(dimensions).recommendation).toContain('Improve');
            }),
            { numRuns: 100 },
        );
    });

    it('score é monotônico quando uma dimensão aumenta', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(
                fc.integer({ min: 0, max: 99 }),
                fc.integer({ min: 0, max: 99 }),
                fc.integer({ min: 0, max: 99 }),
                fc.integer({ min: 0, max: 99 }),
                fc.integer({ min: 0, max: 99 }),
                (a, b, c, d, e) => {
                    const base: HealthDimensions = {
                        passRate: { score: a, status: 'pass' },
                        flakyRate: { score: b, status: 'pass' },
                        coverage: { score: c, status: 'pass' },
                        suiteSpeed: { score: d, status: 'pass' },
                        executionRate: { score: e, status: 'pass' },
                    };
                    const higher: HealthDimensions = {
                        passRate: { score: a + 1, status: 'pass' },
                        flakyRate: { score: b + 1, status: 'pass' },
                        coverage: { score: c + 1, status: 'pass' },
                        suiteSpeed: { score: d + 1, status: 'pass' },
                        executionRate: { score: e + 1, status: 'pass' },
                    };

                    expect(calcReleaseScore(higher).score).toBeGreaterThanOrEqual(calcReleaseScore(base).score);
                },
            ),
            { numRuns: 100 },
        );
    });

    it('score boundary cases: all-zero gives 0, all-max gives 100', () => {
        const zero: HealthDimensions = {
            passRate: { score: 0, status: 'fail' },
            flakyRate: { score: 0, status: 'fail' },
            coverage: { score: 0, status: 'fail' },
            suiteSpeed: { score: 0, status: 'fail' },
            executionRate: { score: 0, status: 'fail' },
        };

        expect(calcReleaseScore(zero).score).toBe(0);

        const full: HealthDimensions = {
            passRate: { score: 100, status: 'pass' },
            flakyRate: { score: 100, status: 'pass' },
            coverage: { score: 100, status: 'pass' },
            suiteSpeed: { score: 100, status: 'pass' },
            executionRate: { score: 100, status: 'pass' },
        };

        expect(calcReleaseScore(full).score).toBe(100);
    });

    it('timestamp no formato ISO', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(dimsArb(), (dimensions) => {
                expect(calcReleaseScore(dimensions).timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
            }),
            { numRuns: 50 },
        );
    });
});

describe('CalcReleaseScore — edge cases (no mocks)', () => {
    it('naN em qualquer dimensão não crasha e o compósito permanece finito (§24)', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(dimsArb(), (dimensions) => {
                const withNan: HealthDimensions = { ...dimensions };
                withNan.coverage = { score: Number.NaN, status: 'fail' };

                const result = calcReleaseScore(withNan);

                expect(Number.isFinite(result.score)).toBeTruthy();
                expect(result.score).toBeGreaterThanOrEqual(0);
                expect(result.score).toBeLessThanOrEqual(100);
            }),
            { numRuns: 100 },
        );
    });

    it('dimensão ausente (availability false) não é pontuada como 0 nem incluída no compósito', () => {
        expect.hasAssertions();

        const dimensions: HealthDimensions = {
            passRate: { score: 100, status: 'pass' },
            flakyRate: { score: 0, status: 'fail' },
            coverage: { score: 0, status: 'fail' },
            suiteSpeed: { score: 0, status: 'fail' },
            executionRate: { score: 0, status: 'fail' },
        };

        const result = calcReleaseScore(dimensions, undefined, {
            passRate: true,
            flakyRate: false,
            coverage: false,
            suiteSpeed: false,
            executionRate: false,
        });

        expect(result.score).toBe(100);
        expect(result.breakdown?.filter((b) => b.noData)).toHaveLength(4);
    });

    it('todas as dimensões ausentes → grade unknown e recommendation explícita (nunca critical fabricado)', () => {
        const dimensions: HealthDimensions = {
            passRate: { score: 0, status: 'fail' },
            flakyRate: { score: 0, status: 'fail' },
            coverage: { score: 0, status: 'fail' },
            suiteSpeed: { score: 0, status: 'fail' },
            executionRate: { score: 0, status: 'fail' },
        };

        const result = calcReleaseScore(dimensions, undefined, {
            passRate: false,
            flakyRate: false,
            coverage: false,
            suiteSpeed: false,
            executionRate: false,
        });

        expect(result.grade).toBe('unknown');
        expect(result.recommendation).toContain('Insufficient data');
        expect((result.breakdown ?? []).every((b) => b.noData)).toBeTruthy();
    });
});
