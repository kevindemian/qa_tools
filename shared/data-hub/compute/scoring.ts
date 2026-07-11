/**
 * Compute: Grade Assignment.
 *
 * Assigns a grade label from a composite score.
 *
 * @reference DORA — composite scoring enables prioritized improvement
 */
import type { GradeBoundaries } from './types.js';
import { DEFAULT_GRADE_BOUNDARIES } from './types.js';

/** Grade labels. */
export type Grade = 'excellent' | 'good' | 'needs_attention' | 'poor' | 'critical';

/** Score result with grade. */
export interface ScoreResult {
    score: number;
    grade: Grade;
}

/**
 * Compute grade from score using boundaries.
 * @param score - Weighted composite score (0-100).
 * @param boundaries - Grade boundaries.
 * @throws Error if score is NaN or Infinity (Rule 24 — NaN must never silently pass).
 */
export function computeGrade(score: number, boundaries: GradeBoundaries = DEFAULT_GRADE_BOUNDARIES): Grade {
    if (!Number.isFinite(score)) {
        throw new Error(`scoring: computeGrade received invalid score ${score} — upstream bug`);
    }
    if (score >= boundaries.excellent) return 'excellent';
    if (score >= boundaries.good) return 'good';
    if (score >= boundaries.needs_attention) return 'needs_attention';
    if (score >= boundaries.poor) return 'poor';
    return 'critical';
}
