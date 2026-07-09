/**
 * Compute: Metrics Trends.
 *
 * Extracts trend data from metrics runs for dashboard visualization.
 * Equivalent to getTrends in metrics.ts, but accepts MetricsRun[].
 * Used by flakiness-dashboard.ts and report-chart.ts.
 */
import type { MetricsRun, TrendPoint } from '../../types/data-hub.js';
import { calcRunPassRate } from './run-pass-rate.js';

/**
 * Calculate trend points from metrics runs.
 *
 * @param runs - Metrics runs to analyze.
 * @param window - Number of recent runs to include (default: 10).
 * @returns Array of TrendPoint sorted by timestamp (oldest first).
 */
export function calcMetricsTrends(runs: MetricsRun[], window = 10): TrendPoint[] {
    return runs.slice(-window).map((r) => ({
        label: r.timestamp.slice(0, 10),
        passRate: calcRunPassRate({ passed: r.passed, failed: r.failed }),
        total: r.total,
        failed: r.failed,
    }));
}
