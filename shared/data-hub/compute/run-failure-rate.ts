/**
 * Compute: Run Failure Rate.
 *
 * Calculates the percentage of runs that had at least one failed test.
 * This is a run-level metric: "what percentage of runs had failures?"
 *
 * Distinct from calcPipelinePassRate() which measures pipeline conclusion,
 * and from flaky metrics which measure test-level instability.
 */
import type { MetricsRun } from '../../types/data-hub.js';

/**
 * Calculate run-level failure rate: percentage of runs with at least 1 failed test.
 *
 * @param runs - Metrics runs to analyze.
 * @returns Failure rate (0-100), rounded to 2 decimal places. 0 if no runs.
 */
export function calcRunFailureRate(runs: MetricsRun[]): number {
    if (runs.length === 0) return 0;
    const failedRuns = runs.filter((r) => r.failed > 0).length;
    return Math.round((failedRuns / runs.length) * 100 * 100) / 100;
}
