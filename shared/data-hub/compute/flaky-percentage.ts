/**
 * Compute: Flaky Percentage.
 *
 * Calculates the percentage of flaky jobs/tests across all runs.
 * Used by health-score.ts and release-score.
 */
import type { FlakyResult } from '../../types/data-hub.js';
import type { PipelineRun, PipelineJob } from '../../types/ci-cd.js';

/**
 * Calculate flaky percentage: flaky jobs / total unique jobs.
 *
 * @param flakyRate - Flaky results from calcFlakyFromPipelineRuns.
 * @param runs - Pipeline runs to analyze.
 * @param jobs - Jobs map keyed by run ID.
 * @returns Flaky percentage (0-100), rounded to 2 decimal places.
 */
export function calcFlakyPercentage(
    flakyRate: FlakyResult[],
    runs: PipelineRun[],
    jobs: Map<number, PipelineJob[]>,
): number {
    if (runs.length === 0 || flakyRate.length === 0) return 0;
    const flakyCount = flakyRate.length;
    const totalJobs = countUniqueJobs(jobs);
    if (totalJobs === 0) return 0;
    return Math.round((flakyCount / totalJobs) * 100 * 100) / 100;
}

/**
 * Count unique job names across all runs.
 */
function countUniqueJobs(jobs: Map<number, PipelineJob[]>): number {
    const jobNames = new Set<string>();
    for (const jobList of jobs.values()) {
        for (const job of jobList) {
            if (job.name) {
                jobNames.add(job.name);
            }
        }
    }
    return jobNames.size || 1;
}
