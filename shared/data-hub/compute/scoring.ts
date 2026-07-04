/**
 * Compute: Scoring.
 *
 * Linear interpolation scoring for individual health dimensions.
 * Moved from health-score.ts:218-261.
 *
 * @reference DORA — composite scoring enables prioritized improvement
 */
import type { ScoringConfig, GradeBoundaries } from './types.js';
import { DEFAULT_SCORING_CONFIG, DEFAULT_GRADE_BOUNDARIES } from './types.js';

/** Grade labels. */
export type Grade = 'excellent' | 'good' | 'needs_attention' | 'poor' | 'critical';

/** Score result with grade. */
export interface ScoreResult {
    score: number;
    grade: Grade;
}

/** Score between target and floor: 100 at target, 0 at floor. */
function linearScore(actual: number, target: number, floor: number): number {
    if (actual >= target) return 100;
    if (actual <= floor) return 0;
    return Math.round(((actual - floor) / (target - floor)) * 100 * 100) / 100;
}

/** Inverse score: 100 at 0, 0 at threshold. */
function inverseScore(actual: number, threshold: number): number {
    if (actual <= 0) return 100;
    if (actual >= threshold) return 0;
    return Math.round((1 - actual / threshold) * 100 * 100) / 100;
}

/**
 * Score pass rate (0-100).
 * @param actual - Current pass rate.
 * @param config - Scoring config.
 */
export function scorePassRate(actual: number, config: ScoringConfig = DEFAULT_SCORING_CONFIG): number {
    return linearScore(actual, config.passRateTarget, config.passRateFloor);
}

/**
 * Score flaky rate (0-100, inverted).
 * @param actual - Current flaky rate.
 * @param config - Scoring config.
 */
export function scoreFlakyRate(actual: number, config: ScoringConfig = DEFAULT_SCORING_CONFIG): number {
    return inverseScore(actual, config.flakyThreshold);
}

/**
 * Score coverage (0-100).
 * @param actual - Current coverage percentage.
 * @param config - Scoring config.
 */
export function scoreCoverage(actual: number, config: ScoringConfig = DEFAULT_SCORING_CONFIG): number {
    return linearScore(actual, config.coverageTarget, config.coverageFloor);
}

/**
 * Score execution rate (0-100).
 * @param actual - Current execution rate.
 * @param config - Scoring config.
 */
export function scoreExecutionRate(actual: number, config: ScoringConfig = DEFAULT_SCORING_CONFIG): number {
    return linearScore(actual, config.executionRateTarget, config.executionRateFloor);
}

/**
 * Score suite speed (0-100, inverted).
 * @param actual - Current suite speed P95 in ms.
 * @param config - Scoring config.
 */
export function scoreSuiteSpeed(actual: number, config: ScoringConfig = DEFAULT_SCORING_CONFIG): number {
    if (actual <= config.suiteSpeedTarget) return 100;
    if (actual >= config.suiteSpeedCeiling) return 0;
    return (
        Math.round(
            (1 - (actual - config.suiteSpeedTarget) / (config.suiteSpeedCeiling - config.suiteSpeedTarget)) * 100 * 100,
        ) / 100
    );
}

/**
 * Compute grade from score using boundaries.
 * @param score - Weighted composite score (0-100).
 * @param boundaries - Grade boundaries.
 */
export function computeGrade(score: number, boundaries: GradeBoundaries = DEFAULT_GRADE_BOUNDARIES): Grade {
    if (score >= boundaries.excellent) return 'excellent';
    if (score >= boundaries.good) return 'good';
    if (score >= boundaries.needs_attention) return 'needs_attention';
    if (score >= boundaries.poor) return 'poor';
    return 'critical';
}
