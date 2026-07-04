import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { HealthDimensions, DimensionScore } from '../../../types/data-hub.js';
import { calcReleaseScore } from '../../compute/release-score.js';

const DimensionScoreArb: fc.Arbitrary<DimensionScore> = fc.record({
    score: fc.float({ min: 0, max: 100, noNaN: true }),
    status: fc.constant('pass' as const),
});

const HealthDimensionsArb: fc.Arbitrary<HealthDimensions> = fc.record({
    passRate: DimensionScoreArb,
    flakyRate: DimensionScoreArb,
    coverage: DimensionScoreArb,
    suiteSpeed: DimensionScoreArb,
    executionRate: DimensionScoreArb,
});

describe('Compute/release-score — property-based', () => {
    it('release score is always 0-100', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(HealthDimensionsArb, (dims) => {
                const result = calcReleaseScore(dims);

                expect(result.score).toBeGreaterThanOrEqual(0);
                expect(result.score).toBeLessThanOrEqual(100);
            }),
            { numRuns: 100 },
        );
    });

    it('grade is always valid', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(HealthDimensionsArb, (dims) => {
                const result = calcReleaseScore(dims);

                expect(['excellent', 'good', 'needs_attention', 'poor', 'critical']).toContain(result.grade);
            }),
            { numRuns: 100 },
        );
    });

    it('dimensions are preserved in result', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(HealthDimensionsArb, (dims) => {
                const result = calcReleaseScore(dims);

                expect(result.dimensions).toBe(dims);
            }),
            { numRuns: 50 },
        );
    });
});
