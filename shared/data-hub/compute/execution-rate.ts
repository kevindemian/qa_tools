/**
 * Compute: Execution Rate.
 *
 * Calculates the percentage of runs that were not cancelled.
 * Used by health-score.ts and release-score.
 *
 * @reference ISO/IEC 25023:2016 — execution rate measurement
 */
import type { PipelineRun } from '../../types/ci-cd.js';

/**
 * Calculate execution rate: percentage of runs that completed (not cancelled).
 *
 * @param runs - Pipeline runs to analyze.
 * @returns Execution rate (0-100), rounded to 2 decimal places.
 */
export function calcExecutionRate(runs: PipelineRun[]): number {
    const withConclusion = runs.filter((r) => r.conclusion != null);
    if (withConclusion.length === 0) return 0;
    const executed = withConclusion.filter((r) => r.conclusion !== 'cancelled').length;
    return Math.round((executed / withConclusion.length) * 100 * 100) / 100;
}
