/**
 * Compute: Single-Run Test Pass Rate.
 *
 * Calculates test-level pass rate from a single run's test statistics.
 * Pass rate = passed / (passed + failed) * 100.
 * Skipped tests are excluded from the denominator.
 *
 * This is distinct from calcPipelinePassRate() which operates at
 * the pipeline-run level (conclusion=success / total runs with conclusion).
 *
 * @reference SSOT Principle — DataHub is the single source of truth for ALL metrics.
 */

/**
 * Calculate test-level pass rate from a single run's statistics.
 *
 * @param stats - Test counts from a single run (must have passed and failed counts).
 * @returns Pass rate (0-100), rounded to 2 decimal places. 0 if no tests executed.
 */
export function calcRunPassRate(stats: { passed: number; failed: number }): number {
    if (!Number.isFinite(stats.passed) || !Number.isFinite(stats.failed)) return 0;
    const executed = stats.passed + stats.failed;
    if (executed === 0) return 0;
    return Math.round((stats.passed / executed) * 100 * 100) / 100;
}
