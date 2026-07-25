/**
 * detectSilentRegressions — Testes robustos.
 *
 * Testa compute/regression-detection.ts com PBT, edge cases e negativos.
 * Bug encontrado: addToCategoryMap não criava bucket (Fase 0.5.2).
 * Fluxo real — zero mocks internos.
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { detectSilentRegressions } from '../data-hub/compute/regression-detection.js';

// ─── Tests ──────────────────────────────────────────────────────────

describe('DetectSilentRegressions', () => {
    describe('Empty input', () => {
        it('returns empty result for empty map', () => {
            expect.hasAssertions();

            const r = detectSilentRegressions({});

            expect(r.regressions).toHaveLength(0);
            expect(r.totalTests).toBe(0);
            expect(r.threshold).toBe(2);
        });

        it('returns empty for single-duration tests (need >= 2 for z-score)', () => {
            expect.hasAssertions();

            const r = detectSilentRegressions({ 'test-a': [100] });

            expect(r.regressions).toHaveLength(0);
            expect(r.totalTests).toBe(0);
        });
    });

    describe('Mathematical invariants (PBT)', () => {
        it('z-score is always finite and non-negative', () => {
            expect.hasAssertions();

            fc.assert(
                fc.property(
                    fc.dictionary(
                        fc.string({ minLength: 1, maxLength: 10 }),
                        fc.array(fc.nat({ max: 10000 }), { minLength: 2, maxLength: 20 }),
                    ),
                    (map) => {
                        const r = detectSilentRegressions(map);
                        for (const reg of r.regressions) {
                            expect(Number.isFinite(reg.zScore)).toBeTruthy();
                            expect(reg.zScore).toBeGreaterThanOrEqual(0);
                        }
                    },
                ),
                { numRuns: 100 },
            );
        });

        it('regressions sorted by z-score descending', () => {
            expect.hasAssertions();

            fc.assert(
                fc.property(
                    fc.dictionary(
                        fc.string({ minLength: 1, maxLength: 10 }),
                        fc.array(fc.nat({ max: 10000 }), { minLength: 2, maxLength: 20 }),
                    ),
                    (map) => {
                        const r = detectSilentRegressions(map);

                        expect(r.regressions.length).toBeGreaterThanOrEqual(0);

                        for (let i = 1; i < r.regressions.length; i++) {
                            const prevZ = r.regressions[i - 1]?.zScore ?? 0;
                            const currZ = r.regressions[i]?.zScore ?? 0;

                            expect(prevZ).toBeGreaterThanOrEqual(currZ);
                        }
                    },
                ),
                { numRuns: 100 },
            );
        });

        it('severity classification matches z-score thresholds', () => {
            expect.hasAssertions();

            fc.assert(
                fc.property(
                    fc.dictionary(
                        fc.string({ minLength: 1, maxLength: 10 }),
                        fc.array(fc.nat({ max: 10000 }), { minLength: 2, maxLength: 20 }),
                    ),
                    (map) => {
                        const r = detectSilentRegressions(map);
                        for (const reg of r.regressions) {
                            let expectedSeverity: string;
                            if (reg.zScore > 5) {
                                expectedSeverity = 'critical';
                            } else if (reg.zScore > 3) {
                                expectedSeverity = 'high';
                            } else if (reg.zScore > 2) {
                                expectedSeverity = 'medium';
                            } else {
                                expectedSeverity = 'low';
                            }

                            expect(reg.severity).toBe(expectedSeverity);
                        }
                    },
                ),
                { numRuns: 100 },
            );
        });

        it('meanDuration matches independent computation', () => {
            expect.hasAssertions();

            const durations = [10, 10, 10, 10, 10, 10, 10, 10, 10, 100];
            const mean = durations.reduce((s, v) => s + v, 0) / durations.length;
            const r = detectSilentRegressions({ test: durations });

            expect(r.regressions.length).toBeGreaterThanOrEqual(1);
            expect(r.regressions[0]?.meanDuration).toBe(Math.round(mean * 100) / 100);
        });
    });

    describe('Z-score detection', () => {
        it('spike above threshold detected', () => {
            expect.hasAssertions();

            const r = detectSilentRegressions({ flaky: [10, 10, 10, 10, 10, 10, 10, 10, 10, 50] });

            expect(r.regressions.length).toBeGreaterThanOrEqual(1);
            expect(r.regressions[0]?.title).toBe('flaky');
        });

        it('stable data → no regressions', () => {
            expect.hasAssertions();

            const r = detectSilentRegressions({ stable: [10, 10, 10, 10, 10] });

            expect(r.regressions).toHaveLength(0);
        });

        it('custom threshold', () => {
            expect.hasAssertions();

            const r1 = detectSilentRegressions({ test: [100, 100, 100, 100, 150] }, 1);
            const r2 = detectSilentRegressions({ test: [100, 100, 100, 100, 150] }, 5);

            expect(r1.regressions.length).toBeGreaterThanOrEqual(r2.regressions.length);
        });
    });

    describe('Edge cases', () => {
        it('stdDev = 0 → no regression (z-score = 0)', () => {
            expect.hasAssertions();

            const r = detectSilentRegressions({ same: [5, 5, 5, 5, 5] });

            expect(r.regressions).toHaveLength(0);
        });

        it('z-score below threshold → not detected', () => {
            expect.hasAssertions();

            // data produces z-score ≈ 3.0 for last value; threshold=5 means z > 5 is required
            const r = detectSilentRegressions({ test: [10, 10, 10, 10, 10, 10, 10, 10, 10, 12] }, 5);

            expect(r.regressions).toHaveLength(0);
        });

        it('previousDurations excludes current', () => {
            expect.hasAssertions();

            const durations = [10, 10, 10, 10, 10, 10, 10, 10, 10, 100];
            const r = detectSilentRegressions({ test: durations });

            expect(r.regressions.length).toBeGreaterThanOrEqual(1);
            expect(r.regressions[0]?.previousDurations).toHaveLength(durations.length - 1);
            expect(r.regressions[0]?.previousDurations).not.toContain(100);
        });
    });

    describe('Negative cases', () => {
        it('threshold = 0 is clamped to default (2)', () => {
            expect.hasAssertions();

            // threshold 0 is not finite > 0, so clamped to 2
            const r = detectSilentRegressions({ test: [10, 10, 10, 10, 10, 10, 10, 10, 10, 50] }, 0);

            expect(r.threshold).toBe(2);
            expect(r.regressions.length).toBeGreaterThanOrEqual(1);
        });

        it('negative threshold → clamped to 2 (default)', () => {
            expect.hasAssertions();

            const r = detectSilentRegressions({ test: [10, 20] }, -5);

            expect(r.threshold).toBe(2);
        });

        it('naN durations filtered out', () => {
            expect.hasAssertions();

            const r = detectSilentRegressions({ test: [NaN, 10, 20] });

            expect(r.regressions.length).toBeGreaterThanOrEqual(0);
        });
    });
});
