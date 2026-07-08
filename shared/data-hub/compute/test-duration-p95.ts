/**
 * Compute: Test Duration P95.
 *
 * Calculates P95 of individual test execution times in milliseconds.
 * This is distinct from calcSuiteSpeedP95() which operates at
 * the CI pipeline-job level (GitHub Actions job durations).
 *
 * @reference Google SRE Best Practice — P95 latency
 */
import type { MetricsRun } from '../../types/data-hub.js';

/**
 * Calculate P95 of individual test durations from MetricsRun[].
 * Flattens all non-skipped test durations and computes the 95th percentile.
 *
 * @param runs - Metrics runs containing individual test results.
 * @returns P95 duration in milliseconds, 0 if no data.
 */
export function calcTestDurationP95(runs: MetricsRun[]): number {
    const durations = collectTestDurations(runs);
    if (durations.length === 0) return 0;
    durations.sort((a, b) => a - b);
    const idx = Math.max(0, Math.ceil(durations.length * 0.95) - 1);
    return durations[idx] ?? 0;
}

function collectTestDurations(runs: MetricsRun[]): number[] {
    const durations: number[] = [];
    for (const run of runs) {
        for (const test of run.tests) {
            if (test.state === 'skipped') continue;
            if (Number.isFinite(test.duration) && test.duration > 0) {
                durations.push(test.duration);
            }
        }
    }
    return durations;
}
