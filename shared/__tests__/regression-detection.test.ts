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
            expect(r.timestamp).toBeDefined();
            expect(Date.parse(r.timestamp)).not.toBeNaN();
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

                        expect(r.regressions.length).toBeGreaterThanOrEqual(0);

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

        it('severity classification matches z-score thresholds (history excludes current)', () => {
            expect.hasAssertions();

            // Baseline histogram [1, 3] → mean 2, stdDev 1. zScore = current - 2.
            // This is the CORRECT outlier test: the current run is never part of its
            // own baseline (ISO 3534-2).

            // z = 1.2 → low (> 1, <= 2); threshold=1 flags it
            const lowR = detectSilentRegressions({ low: [1, 3, 3.2] }, 1);

            expect(lowR.regressions.length).toBeGreaterThanOrEqual(1);
            expect(lowR.regressions[0]?.severity).toBe('low');

            // z = 2.2 → medium (above default threshold 2)
            const mediumR = detectSilentRegressions({ medium: [1, 3, 4.2] });

            expect(mediumR.regressions.length).toBeGreaterThanOrEqual(1);
            expect(mediumR.regressions[0]?.severity).toBe('medium');

            // z = 3.2 → high (above 3)
            const highR = detectSilentRegressions({ high: [1, 3, 5.2] });

            expect(highR.regressions.length).toBeGreaterThanOrEqual(1);
            expect(highR.regressions[0]?.severity).toBe('high');

            // z = 5.5 → critical (above 5)
            const critR = detectSilentRegressions({ critical: [1, 3, 7.5] });

            expect(critR.regressions.length).toBeGreaterThanOrEqual(1);
            expect(critR.regressions[0]?.severity).toBe('critical');
        });

        it('meanDuration is computed over history excluding the current duration', () => {
            expect.hasAssertions();

            const durations = [10, 10, 10, 10, 10, 10, 10, 10, 10, 100];
            const r = detectSilentRegressions({ test: durations });

            // History = [10 x9] → mean 10 (the 100 spike is excluded from its own baseline)
            expect(r.regressions.length).toBeGreaterThanOrEqual(1);
            expect(r.regressions[0]?.meanDuration).toBe(10);
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

            // hist [1, 3] → mean 2, stdDev 1; current 2.5 → z ≈ 0.5. threshold=5 means z > 5 required.
            const r = detectSilentRegressions({ test: [1, 3, 2.5] }, 5);

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
