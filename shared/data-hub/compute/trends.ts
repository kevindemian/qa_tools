/**
 * Compute: Trends.
 *
 * Calculates pass rate trends from CI PipelineRuns over a sliding window.
 *
 * @reference DORA — trend visibility enables proactive quality management
 * @reference D5.8 — saturation/clamp applied to all pass rate values
 */
import type { PipelineRun } from '../../types/ci-cd.js';
import type { DateTrendPoint } from '../../types/data-hub.js';

/**
 * Calculate pass rate trends from CI PipelineRuns.
 *
 * Saturation (D5.8): passRate clamped to [0, 100] for each data point.
 *
 * @param runs - PipelineRun[] ordered oldest to newest.
 * @param windowSize - Number of recent data points to include.
 * @returns DateTrendPoint[] with at most windowSize entries, sorted by date.
 */
export function calcTrendsFromPipelineRuns(runs: PipelineRun[], windowSize: number = 10): DateTrendPoint[] {
    const slice = runs.slice(-windowSize);
    return slice.map((run) => {
        const conclusion = run.conclusion;
        const passed = conclusion === 'success' ? 1 : 0;
        return {
            date: run.created_at?.slice(0, 10) ?? 'unknown',
            passRate: Math.min(100, Math.max(0, Math.round((passed / 1) * 100 * 100) / 100)),
            count: 1,
        };
    });
}
