/**
 * Compute: Release Score.
 *
 * Calculates a composite release readiness score from health dimensions.
 *
 * @reference DORA — release readiness requires holistic quality assessment
 */
import type { HealthDimensions, DimensionScore, ReleaseScoreResult } from '../../types/data-hub.js';
import type { DimensionWeights } from './types.js';
import { DEFAULT_WEIGHTS } from './types.js';
import { computeGrade } from './scoring.js';

/**
 * Calculate a weighted release score from individual dimension scores.
 *
 * @param dimensions - Pre-calculated dimension scores.
 * @param weights - Dimension weights.
 * @returns ReleaseScoreResult with score, dimensions, and grade.
 */
export function calcReleaseScore(
    dimensions: HealthDimensions,
    weights: DimensionWeights = DEFAULT_WEIGHTS,
): ReleaseScoreResult {
    const totalWeight =
        weights.passRate + weights.flakyRate + weights.coverage + weights.suiteSpeed + weights.executionRate;
    if (totalWeight === 0) {
        return { score: 0, dimensions, grade: 'critical' };
    }

    const weightedScore =
        dimensions.passRate.score * (weights.passRate / totalWeight) +
        dimensions.flakyRate.score * (weights.flakyRate / totalWeight) +
        dimensions.coverage.score * (weights.coverage / totalWeight) +
        dimensions.suiteSpeed.score * (weights.suiteSpeed / totalWeight) +
        dimensions.executionRate.score * (weights.executionRate / totalWeight);

    const score = Math.round(weightedScore * 100) / 100;
    const grade = computeGrade(score);

    return { score, dimensions, grade };
}

/**
 * Create a DimensionScore from a raw score and threshold.
 */
export function makeDimensionScore(score: number, threshold: number): DimensionScore {
    return {
        score: Math.round(score * 100) / 100,
        status: score >= threshold ? 'pass' : 'fail',
    };
}
