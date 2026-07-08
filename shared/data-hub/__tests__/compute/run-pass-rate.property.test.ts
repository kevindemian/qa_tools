import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { calcRunPassRate } from '../../compute/run-pass-rate.js';

describe('Compute/run-pass-rate — property-based', () => {
    it('pass rate is always between 0 and 100', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(fc.nat({ max: 10000 }), fc.nat({ max: 10000 }), (passed, failed) => {
                const result = calcRunPassRate({ passed, failed });

                expect(result).toBeGreaterThanOrEqual(0);
                expect(result).toBeLessThanOrEqual(100);
            }),
            { numRuns: 200 },
        );
    });

    it('zero executed always returns 0', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(fc.nat({ max: 1000 }), (n) => {
                expect(calcRunPassRate({ passed: n, failed: 0 })).toBe(n === 0 ? 0 : 100);
            }),
            { numRuns: 50 },
        );
    });

    it('result is never negative', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(fc.nat({ max: 10000 }), fc.nat({ max: 10000 }), (passed, failed) => {
                expect(calcRunPassRate({ passed, failed })).toBeGreaterThanOrEqual(0);
            }),
            { numRuns: 100 },
        );
    });

    it('result never exceeds 100', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(fc.nat({ max: 10000 }), fc.nat({ max: 10000 }), (passed, failed) => {
                expect(calcRunPassRate({ passed, failed })).toBeLessThanOrEqual(100);
            }),
            { numRuns: 100 },
        );
    });

    it('is symmetric: 100% - calcRunPassRate(fail, pass) == calcRunPassRate(pass, fail) for pass>0', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(fc.integer({ min: 1, max: 10000 }), fc.integer({ min: 0, max: 10000 }), (a, b) => {
                const rateA = calcRunPassRate({ passed: a, failed: b });
                const rateB = calcRunPassRate({ passed: b, failed: a });
                const sum = Math.round((rateA + rateB) * 100) / 100;

                expect(Math.abs(sum - 100)).toBeLessThanOrEqual(1);
                expect(rateA).toBeLessThanOrEqual(100);
                expect(rateA).toBeGreaterThanOrEqual(0);
            }),
            { numRuns: 100 },
        );
    });
});
