import { describe, it, expect } from 'vitest';
import { calcRunPassRate } from '../../compute/run-pass-rate.js';

describe('Compute/run-pass-rate', () => {
    describe('CalcRunPassRate', () => {
        it('returns 0 when no tests executed', () => {
            expect.hasAssertions();
            expect(calcRunPassRate({ passed: 0, failed: 0 })).toBe(0);
        });

        it('returns 100 when all tests pass', () => {
            expect.hasAssertions();
            expect(calcRunPassRate({ passed: 50, failed: 0 })).toBe(100);
        });

        it('returns 0 when all tests fail', () => {
            expect.hasAssertions();
            expect(calcRunPassRate({ passed: 0, failed: 25 })).toBe(0);
        });

        it('returns correct percentage for mixed results', () => {
            expect.hasAssertions();
            // 3 passed, 1 failed → 3/4 * 100 = 75
            expect(calcRunPassRate({ passed: 3, failed: 1 })).toBe(75);
        });

        it('rounds to 2 decimal places', () => {
            expect.hasAssertions();
            // 1/3 * 100 = 33.333... → 33.33
            expect(calcRunPassRate({ passed: 1, failed: 2 })).toBeCloseTo(33.33, 1);
        });

        it('handles single test', () => {
            expect.hasAssertions();
            expect(calcRunPassRate({ passed: 1, failed: 0 })).toBe(100);
            expect(calcRunPassRate({ passed: 0, failed: 1 })).toBe(0);
        });

        it('handles large numbers', () => {
            expect.hasAssertions();
            expect(calcRunPassRate({ passed: 999, failed: 1 })).toBeCloseTo(99.9, 1);
        });
    });
});
