/**
 * Compute: Average Duration.
 *
 * Calculates mean pipeline duration from CI runs.
 * Moved from ci-data.ts:267-282.
 *
 * @reference ISO/IEC 25023:2016 — duration measurement
 * @reference D5.5 — outlier treatment via IQR capping
 */
import type { PipelineRun } from '../../types/ci-cd.js';

/**
 * Calculate average pipeline duration in seconds.
 * Duration is computed from run_started_at to updated_at.
 *
 * Outlier treatment (D5.5): Uses IQR capping to prevent extreme outliers
 * from skewing the average. Values above Q3 + 1.5*IQR are capped.
 *
 * @returns Average duration in seconds, rounded to 2 decimal places.
 */
export function calcAvgDuration(runs: PipelineRun[]): number {
    const durations = extractDurations(runs);
    if (durations.length === 0) return 0;
    const capped = capOutliersIQR(durations);
    const avg = capped.reduce((s, d) => s + d, 0) / capped.length;
    return Math.min(86400, Math.round(avg * 100) / 100);
}

function extractDurations(runs: PipelineRun[]): number[] {
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
    return durations;
}

/**
 * Cap outliers using IQR method.
 * Values above Q3 + 1.5*IQR are capped to that threshold.
 * Reference: Tukey (1977) Exploratory Data Analysis
 */
function capOutliersIQR(values: number[]): number[] {
    if (values.length < 4) return values;
    const sorted = [...values].sort((a, b) => a - b);
    const q1 = sorted[Math.floor(sorted.length * 0.25)] ?? 0;
    const q3 = sorted[Math.floor(sorted.length * 0.75)] ?? 0;
    const iqr = q3 - q1;
    const upperBound = q3 + 1.5 * iqr;
    return values.map((v) => Math.min(v, upperBound));
}
