import { describe, it, expect } from 'vitest';
import type { HealthDimensions } from '../../../types/data-hub.js';
import { calcReleaseScore, makeDimensionScore } from '../../compute/release-score.js';

const allPass: HealthDimensions = {
    passRate: { score: 100, status: 'pass' },
    flakyRate: { score: 100, status: 'pass' },
    coverage: { score: 100, status: 'pass' },
    suiteSpeed: { score: 100, status: 'pass' },
    executionRate: { score: 100, status: 'pass' },
};

const allFail: HealthDimensions = {
    passRate: { score: 0, status: 'fail' },
    flakyRate: { score: 0, status: 'fail' },
    coverage: { score: 0, status: 'fail' },
    suiteSpeed: { score: 0, status: 'fail' },
    executionRate: { score: 0, status: 'fail' },
};

describe('Compute/release-score', () => {
    describe('CalcReleaseScore', () => {
        it('returns 100 for all perfect dimensions', () => {
            expect.hasAssertions();
            expect(calcReleaseScore(allPass).score).toBe(100);
        });

        it('returns 0 for all zero dimensions', () => {
            expect.hasAssertions();
            expect(calcReleaseScore(allFail).score).toBe(0);
        });

        it('returns grade for perfect score', () => {
            expect.hasAssertions();
            expect(calcReleaseScore(allPass).grade).toBe('excellent');
        });

        it('returns critical for zero score', () => {
            expect.hasAssertions();
            expect(calcReleaseScore(allFail).grade).toBe('critical');
        });

        it('weighted average with custom weights', () => {
            expect.hasAssertions();

            const dims: HealthDimensions = {
                passRate: { score: 100, status: 'pass' },
                flakyRate: { score: 0, status: 'fail' },
                coverage: { score: 100, status: 'pass' },
                suiteSpeed: { score: 0, status: 'fail' },
                executionRate: { score: 100, status: 'pass' },
            };
            const weights = { passRate: 1, flakyRate: 1, coverage: 1, suiteSpeed: 1, executionRate: 1 };
            const result = calcReleaseScore(dims, weights);

            expect(result.score).toBe(60);
        });

        it('handles zero total weight', () => {
            expect.hasAssertions();

            const weights = { passRate: 0, flakyRate: 0, coverage: 0, suiteSpeed: 0, executionRate: 0 };

            expect(calcReleaseScore(allPass, weights).score).toBe(0);
        });
    });

    describe('MakeDimensionScore', () => {
        it('returns pass when score >= threshold', () => {
            expect.hasAssertions();
            expect(makeDimensionScore(95, 90).status).toBe('pass');
        });

        it('returns fail when score < threshold', () => {
            expect.hasAssertions();
            expect(makeDimensionScore(80, 90).status).toBe('fail');
        });
    });
});
