import { describe, it, expect } from 'vitest';
import {
    scorePassRate,
    scoreFlakyRate,
    scoreCoverage,
    scoreExecutionRate,
    scoreSuiteSpeed,
    computeGrade,
} from '../../compute/scoring.js';
import type { ScoringConfig } from '../../compute/types.js';

const customConfig: ScoringConfig = {
    passRateTarget: 95,
    passRateFloor: 50,
    flakyThreshold: 5,
    coverageTarget: 80,
    coverageFloor: 30,
    executionRateTarget: 95,
    executionRateFloor: 50,
    suiteSpeedTarget: 1000,
    suiteSpeedCeiling: 3000,
};

describe('Compute/scoring', () => {
    describe('ScorePassRate', () => {
        it('returns 100 at or above target', () => {
            expect.hasAssertions();
            expect(scorePassRate(95, customConfig)).toBe(100);
            expect(scorePassRate(100, customConfig)).toBe(100);
        });

        it('returns 0 at or below floor', () => {
            expect.hasAssertions();
            expect(scorePassRate(50, customConfig)).toBe(0);
            expect(scorePassRate(0, customConfig)).toBe(0);
        });

        it('linear interpolation between floor and target', () => {
            expect.hasAssertions();
            expect(scorePassRate(72.5, customConfig)).toBe(50);
        });
    });

    describe('ScoreFlakyRate', () => {
        it('returns 100 for 0 flaky', () => {
            expect.hasAssertions();
            expect(scoreFlakyRate(0, customConfig)).toBe(100);
        });

        it('returns 0 at threshold', () => {
            expect.hasAssertions();
            expect(scoreFlakyRate(5, customConfig)).toBe(0);
        });

        it('inverse interpolation', () => {
            expect.hasAssertions();
            expect(scoreFlakyRate(2.5, customConfig)).toBe(50);
        });
    });

    describe('ScoreCoverage', () => {
        it('returns 100 at or above target', () => {
            expect.hasAssertions();
            expect(scoreCoverage(80, customConfig)).toBe(100);
        });

        it('returns 0 at or below floor', () => {
            expect.hasAssertions();
            expect(scoreCoverage(30, customConfig)).toBe(0);
        });
    });

    describe('ScoreExecutionRate', () => {
        it('returns 100 at or above target', () => {
            expect.hasAssertions();
            expect(scoreExecutionRate(95, customConfig)).toBe(100);
        });

        it('returns 0 at or below floor', () => {
            expect.hasAssertions();
            expect(scoreExecutionRate(50, customConfig)).toBe(0);
        });
    });

    describe('ScoreSuiteSpeed', () => {
        it('returns 100 at or below target', () => {
            expect.hasAssertions();
            expect(scoreSuiteSpeed(500, customConfig)).toBe(100);
        });

        it('returns 0 at or above ceiling', () => {
            expect.hasAssertions();
            expect(scoreSuiteSpeed(3000, customConfig)).toBe(0);
        });

        it('inverse interpolation', () => {
            expect.hasAssertions();
            expect(scoreSuiteSpeed(2000, customConfig)).toBe(50);
        });
    });

    describe('ComputeGrade', () => {
        it('returns excellent for score >= 90', () => {
            expect.hasAssertions();
            expect(computeGrade(95)).toBe('excellent');
        });

        it('returns good for score >= 80', () => {
            expect.hasAssertions();
            expect(computeGrade(85)).toBe('good');
        });

        it('returns needs_attention for score >= 70', () => {
            expect.hasAssertions();
            expect(computeGrade(75)).toBe('needs_attention');
        });

        it('returns poor for score >= 60', () => {
            expect.hasAssertions();
            expect(computeGrade(65)).toBe('poor');
        });

        it('returns critical for score < 60', () => {
            expect.hasAssertions();
            expect(computeGrade(50)).toBe('critical');
        });
    });
});
