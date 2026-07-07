/**
 * Compute: Metrics Trends.
 *
 * Extracts trend data from metrics runs for dashboard visualization.
 * Equivalent to getTrends in metrics.ts, but accepts MetricsRun[].
 * Used by flakiness-dashboard.ts and report-chart.ts.
 */
import type { MetricsRun, MetricsTrendPoint } from '../../types/data-hub.js';

/**
 * Calculate trend points from metrics runs.
 *
 * @param runs - Metrics runs to analyze.
 * @param window - Number of recent runs to include (default: 10).
 * @returns Array of MetricsTrendPoint sorted by timestamp (oldest first).
 */
export function calcMetricsTrends(runs: MetricsRun[], window = 10): MetricsTrendPoint[] {
    return runs.slice(-window).map((r) => ({
        label: r.timestamp.slice(0, 10),
        passRate: r.passed + r.failed > 0 ? (r.passed / (r.passed + r.failed)) * 100 : 0,
        total: r.total,
        failed: r.failed,
    }));
}
