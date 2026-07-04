/**
 * Compute: Trends.
 *
 * Calculates pass rate trends over a sliding window.
 * Moved from metrics.ts:242-250.
 *
 * @reference DORA — trend visibility enables proactive quality management
 */
import type { PipelineRun } from '../../types/ci-cd.js';
import type { MetricsRun } from '../../metrics.js';
import type { TrendPoint } from '../../types/data-hub.js';

/**
 * Calculate pass rate trends from CI PipelineRuns.
 *
 * @param runs - PipelineRun[] ordered oldest to newest.
 * @param windowSize - Number of recent data points to include.
 * @returns TrendPoint[] with at most windowSize entries, sorted by date.
 */
export function calcTrendsFromPipelineRuns(runs: PipelineRun[], windowSize: number = 10): TrendPoint[] {
    const slice = runs.slice(-windowSize);
    return slice.map((run) => {
        const conclusion = run.conclusion;
        const passed = conclusion === 'success' ? 1 : 0;
        return {
            date: run.created_at?.slice(0, 10) ?? 'unknown',
            passRate: Math.round((passed / 1) * 100 * 100) / 100,
            count: 1,
        };
    });
}

/**
 * Calculate pass rate trends from MetricsRuns.
 *
 * @param runs - MetricsRun[] ordered oldest to newest.
 * @param windowSize - Number of recent data points to include.
 * @returns TrendPoint[] with at most windowSize entries, sorted by date.
 */
export function calcTrendsFromMetricsRuns(runs: MetricsRun[], windowSize: number = 10): TrendPoint[] {
    const slice = runs.slice(-windowSize);
    return slice.map((run) => ({
        date: run.timestamp.slice(0, 10),
        passRate:
            run.passed + run.failed > 0 ? Math.round((run.passed / (run.passed + run.failed)) * 100 * 100) / 100 : 0,
        count: run.passed + run.failed,
    }));
}
