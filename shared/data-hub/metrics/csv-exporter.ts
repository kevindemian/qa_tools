import type { ComputedMetrics } from '../../types/data-hub.js';

type FlatRow = Record<string, string | number>;

function flattenMetrics(metrics: ComputedMetrics): FlatRow[] {
    const rows: FlatRow[] = [];
    rows.push({ metric: 'passRate', value: metrics.passRate });
    rows.push({ metric: 'avgDuration', value: metrics.avgDuration });
    rows.push({ metric: 'suiteSpeedP95', value: metrics.suiteSpeedP95 });
    rows.push({ metric: 'coverage', value: metrics.coverage });
    rows.push({ metric: 'pipelineCost.totalMinutes', value: metrics.pipelineCost.totalMinutes });
    rows.push({ metric: 'pipelineCost.estimatedCost', value: metrics.pipelineCost.estimatedCost });
    rows.push({ metric: 'releaseScore.score', value: metrics.releaseScore.score });
    rows.push({ metric: 'releaseScore.grade', value: metrics.releaseScore.grade });
    rows.push({ metric: 'quarantineStatus.flakyCount', value: metrics.quarantineStatus.flakyCount });
    rows.push({ metric: 'quarantineStatus.quarantinedCount', value: metrics.quarantineStatus.quarantinedCount });
    rows.push({ metric: 'testPassRate', value: metrics.testPassRate });
    rows.push({ metric: 'testCounts.passed', value: metrics.testCounts.passed });
    rows.push({ metric: 'testCounts.failed', value: metrics.testCounts.failed });
    rows.push({ metric: 'testCounts.skipped', value: metrics.testCounts.skipped });
    rows.push({ metric: 'testCounts.total', value: metrics.testCounts.total });
    rows.push({ metric: 'framework', value: metrics.framework });
    return rows;
}

function toCsv(rows: FlatRow[]): string {
    const lines = ['metric,value'];
    for (const row of rows) {
        lines.push(`${String(row['metric'] ?? '')},${String(row['value'] ?? '')}`);
    }
    return lines.join('\n');
}

export function exportMetricsCsv(metrics: ComputedMetrics): string {
    const rows = flattenMetrics(metrics);
    return toCsv(rows);
}
