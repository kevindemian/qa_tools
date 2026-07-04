/**
 * Compute: Suite Speed P95.
 *
 * Calculates P95 of job/test durations.
 * Moved from ci-data.ts:286-300, health-score.ts:152-163.
 *
 * @reference Google SRE Best Practice — P95 latency
 */
import type { PipelineJob } from '../../types/ci-cd.js';
import type { MetricsRun } from '../../metrics.js';

/**
 * Calculate P95 of pipeline job durations in milliseconds (CI-level).
 * Uses duration field from PipelineJob (seconds → ms).
 * P95 naturally ignores top 5% outliers.
 *
 * @returns P95 duration in milliseconds, 0 if no data.
 */
export function calcSuiteSpeedP95(jobsMap: Map<number, PipelineJob[]>): number {
    const durations: number[] = [];
    for (const jobs of jobsMap.values()) {
        for (const job of jobs) {
            if (job.duration != null && job.duration > 0) {
                durations.push(job.duration * 1000);
            }
        }
    }
    if (durations.length === 0) return 0;
    durations.sort((a, b) => a - b);
    const idx = Math.max(0, Math.ceil(durations.length * 0.95) - 1);
    return durations[idx] ?? 0;
}

/**
 * Calculate P95 of test durations from MetricsRun[] (test-level).
 * Uses FlatTest.duration in milliseconds.
 *
 * @returns P95 duration in milliseconds, 0 if no data.
 */
export function calcTestSuiteSpeed(runs: MetricsRun[]): number {
    const allDurations: number[] = [];
    for (const run of runs) {
        for (const t of run.tests) {
            if (Number.isFinite(t.duration) && t.duration > 0) {
                allDurations.push(t.duration);
            }
        }
    }
    if (allDurations.length === 0) return 0;
    allDurations.sort((a, b) => a - b);
    const idx = Math.max(0, Math.ceil(allDurations.length * 0.95) - 1);
    return allDurations[idx] ?? 0;
}
