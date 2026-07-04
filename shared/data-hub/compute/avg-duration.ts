/**
 * Compute: Average Duration.
 *
 * Calculates mean pipeline duration from CI runs.
 * Moved from ci-data.ts:267-282.
 *
 * @reference ISO/IEC 25023:2016 — duration measurement
 */
import type { PipelineRun } from '../../types/ci-cd.js';

/**
 * Calculate average pipeline duration in seconds.
 * Duration is computed from run_started_at to updated_at.
 * Saturated at [0, 86400] (24h max) to prevent extreme outliers.
 *
 * @returns Average duration in seconds, rounded to 2 decimal places.
 */
export function calcAvgDuration(runs: PipelineRun[]): number {
    const durations: number[] = [];
    for (const run of runs) {
        if (run.run_started_at && run.updated_at) {
            const start = new Date(run.run_started_at).getTime();
            const end = new Date(run.updated_at).getTime();
            if (!isNaN(start) && !isNaN(end) && end > start) {
                durations.push((end - start) / 1000);
            }
        }
    }
    if (durations.length === 0) return 0;
    const avg = durations.reduce((s, d) => s + d, 0) / durations.length;
    // Saturate at 24h (86400s) to prevent extreme outliers
    return Math.min(86400, Math.round(avg * 100) / 100);
}
