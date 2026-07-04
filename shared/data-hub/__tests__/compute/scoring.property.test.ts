import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
    scorePassRate,
    scoreFlakyRate,
    scoreCoverage,
    scoreExecutionRate,
    scoreSuiteSpeed,
    computeGrade,
} from '../../compute/scoring.js';
import { DEFAULT_SCORING_CONFIG } from '../../compute/types.js';

describe('Compute/scoring — property-based', () => {
    it('pass rate score is always 0-100', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(fc.float({ min: 0, max: 100, noNaN: true }), (actual) => {
                const result = scorePassRate(actual, DEFAULT_SCORING_CONFIG);

                expect(result).toBeGreaterThanOrEqual(0);
                expect(result).toBeLessThanOrEqual(100);
            }),
            { numRuns: 100 },
        );
    });

    it('flaky rate score is always 0-100', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(fc.float({ min: 0, max: 20, noNaN: true }), (actual) => {
                const result = scoreFlakyRate(actual, DEFAULT_SCORING_CONFIG);

                expect(result).toBeGreaterThanOrEqual(0);
                expect(result).toBeLessThanOrEqual(100);
            }),
            { numRuns: 100 },
        );
    });

    it('coverage score is always 0-100', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(fc.float({ min: 0, max: 100, noNaN: true }), (actual) => {
                const result = scoreCoverage(actual, DEFAULT_SCORING_CONFIG);

                expect(result).toBeGreaterThanOrEqual(0);
                expect(result).toBeLessThanOrEqual(100);
            }),
            { numRuns: 100 },
        );
    });

    it('execution rate score is always 0-100', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(fc.float({ min: 0, max: 100, noNaN: true }), (actual) => {
                const result = scoreExecutionRate(actual, DEFAULT_SCORING_CONFIG);

                expect(result).toBeGreaterThanOrEqual(0);
                expect(result).toBeLessThanOrEqual(100);
            }),
            { numRuns: 100 },
        );
    });

    it('suite speed score is always 0-100', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(fc.float({ min: 0, max: 5000, noNaN: true }), (actual) => {
                const result = scoreSuiteSpeed(actual, DEFAULT_SCORING_CONFIG);

                expect(result).toBeGreaterThanOrEqual(0);
                expect(result).toBeLessThanOrEqual(100);
            }),
            { numRuns: 100 },
        );
    });

    it('grade is always valid', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(fc.float({ min: 0, max: 100, noNaN: true }), (score) => {
                const grade = computeGrade(score);

                expect(['excellent', 'good', 'needs_attention', 'poor', 'critical']).toContain(grade);
            }),
            { numRuns: 100 },
        );
    });
});
