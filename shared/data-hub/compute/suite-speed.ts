/**
 * Compute: Suite Speed P95.
 *
 * Calculates P95 of pipeline job durations.
 * Moved from ci-data.ts:286-300, health-score.ts:152-163.
 *
 * @reference Google SRE Best Practice — P95 latency
 */
import type { PipelineJob } from '../../types/ci-cd.js';
import type { WorkflowRunTiming } from '../../types/data-hub.js';

/**
 * Calculate P95 of pipeline job durations in milliseconds (CI-level).
 * Uses timing data (run_duration_ms) when available for more precise measurement.
 * Falls back to job.duration field (seconds → ms).
 * P95 naturally ignores top 5% outliers.
 *
 * @returns P95 duration in milliseconds, 0 if no data.
 */
export function calcSuiteSpeedP95(
    jobsMap: Map<number, PipelineJob[]>,
    timing?: Map<number, WorkflowRunTiming>,
): number {
    const durations = collectDurations(jobsMap, timing);

    if (durations.length === 0) return 0;
    durations.sort((a, b) => a - b);
    const idx = Math.max(0, Math.ceil(durations.length * 0.95) - 1);
    return durations.slice(idx, idx + 1)[0] ?? 0;
}

function collectDurations(jobsMap: Map<number, PipelineJob[]>, timing?: Map<number, WorkflowRunTiming>): number[] {
    if (timing != null && timing.size > 0) {
        const fromTiming = collectFromTiming(jobsMap, timing);
        if (fromTiming.length > 0) return fromTiming;
    }
    return collectFromJobDuration(jobsMap);
}

function collectFromTiming(jobsMap: Map<number, PipelineJob[]>, timing: Map<number, WorkflowRunTiming>): number[] {
    const durations: number[] = [];
    for (const [runId, timingData] of timing) {
        const jobs = jobsMap.get(runId);
        if (jobs == null || jobs.length === 0) continue;
        const perJobMs = timingData.run_duration_ms / jobs.length;
        for (const job of jobs) {
            if (job.status === 'success' || job.status === 'failure') {
                durations.push(perJobMs);
            }
        }
    }
    return durations;
}

function collectFromJobDuration(jobsMap: Map<number, PipelineJob[]>): number[] {
    const durations: number[] = [];
    for (const jobs of jobsMap.values()) {
        for (const job of jobs) {
            if (job.duration != null && job.duration > 0) {
                durations.push(job.duration * 1000);
            }
        }
    }
    return durations;
}
