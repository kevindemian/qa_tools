/**
 * Pipeline Cost Analytics — calculates cost of pipeline runs based on duration.
 *
 * @module pipeline-cost
 */

import { sanitizeHtml } from './escape';
import { buildHtmlPage, buildErrorPage } from './html-factory';
import { buildCss } from './report-styles';
import { MetricCard, MetricGrid, DataTable } from './primitives';
import type { TableColumn, TableRow } from './primitives';
import { rootLogger } from './logger';
import type { MetricsRun } from './metrics';

export interface PipelineCostEntry {
    timestamp: string;
    durationSec: number;
    cost: number;
    status: string;
}

export interface PipelineCostResult {
    totalCost: number;
    avgCostPerRun: number;
    totalDurationSec: number;
    costPerMinute: number;
    costByRun: PipelineCostEntry[];
    runCount: number;
    period: { from: string; to: string };
    timestamp: string;
}

export function calculatePipelineCost(
    runs: MetricsRun[] | null | undefined,
    costPerMinute?: number,
): PipelineCostResult {
    const cpm = (costPerMinute ?? Number(process.env.QA_COST_PER_COMPUTE_MINUTE)) || 0.01;

    if (!runs || runs.length === 0) {
        const now = new Date().toISOString();
        return {
            totalCost: 0,
            avgCostPerRun: 0,
            totalDurationSec: 0,
            costPerMinute: cpm,
            costByRun: [],
            runCount: 0,
            period: { from: '', to: '' },
            timestamp: now,
        };
    }

    const costByRun: PipelineCostEntry[] = runs.map((r) => ({
        timestamp: r.timestamp,
        durationSec: r.duration,
        cost: (r.duration / 60) * cpm,
        status: r.failed > 0 ? 'failed' : r.passed === r.total ? 'passed' : 'partial',
    }));

    costByRun.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

    const totalCost = costByRun.reduce((sum, e) => sum + e.cost, 0);
    const totalDurationSec = costByRun.reduce((sum, e) => sum + e.durationSec, 0);

    const sortedTimestamps = runs.map((r) => r.timestamp).sort();
    const period = {
        from: sortedTimestamps[0] ?? '',
        to: sortedTimestamps[sortedTimestamps.length - 1] ?? '',
    };

    return {
        totalCost,
        avgCostPerRun: totalCost / runs.length,
        totalDurationSec,
        costPerMinute: cpm,
        costByRun,
        runCount: runs.length,
        period,
        timestamp: new Date().toISOString(),
    };
}

function formatCurrency(value: number): string {
    return '$' + value.toFixed(2);
}

function formatDuration(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    if (m >= 60) {
        const h = Math.floor(m / 60);
        const rm = m % 60;
        return h + 'h ' + rm + 'm ' + s.toFixed(0) + 's';
    }
    return m + 'm ' + s.toFixed(0) + 's';
}

export function generatePipelineCostHtml(result: PipelineCostResult | null | undefined, title?: string): string {
    try {
        if (!result) {
            rootLogger.error('Pipeline cost result is null or undefined');
            return buildErrorPage('Error generating report', 'Pipeline Cost Report Error');
        }

        const pageTitle = title || 'Pipeline Cost Analytics';

        const summaryCards = MetricGrid({
            children:
                MetricCard({
                    label: 'Total Cost',
                    value: formatCurrency(result.totalCost),
                    severity: result.totalCost > 0 ? 'info' : 'default',
                }) +
                MetricCard({
                    label: 'Avg Cost / Run',
                    value: formatCurrency(result.avgCostPerRun),
                    severity: result.avgCostPerRun > 0 ? 'info' : 'default',
                }) +
                MetricCard({ label: 'Total Duration', value: formatDuration(result.totalDurationSec) }) +
                MetricCard({ label: 'Run Count', value: String(result.runCount) }),
        });

        let tableHtml: string;
        if (result.costByRun.length === 0) {
            tableHtml = '<p style="color:var(--color-text-muted)">No pipeline run data available.</p>';
        } else {
            const columns: TableColumn[] = [
                { key: 'date', label: 'Date', width: '25%' },
                { key: 'duration', label: 'Duration', align: 'right' },
                { key: 'cost', label: 'Cost', align: 'right' },
                { key: 'status', label: 'Status' },
            ];

            const rows: TableRow[] = result.costByRun.map((e, i) => ({
                key: String(i),
                cells: {
                    date: sanitizeHtml(new Date(e.timestamp).toLocaleDateString()),
                    duration: formatDuration(e.durationSec),
                    cost: formatCurrency(e.cost),
                    status: sanitizeHtml(e.status),
                },
            }));

            tableHtml = DataTable({ columns, rows, caption: 'Cost breakdown per pipeline run' });
        }

        const bodyContent = '<h1>' + sanitizeHtml(pageTitle) + '</h1>' + summaryCards + tableHtml;

        return buildHtmlPage({
            title: pageTitle,
            styles: buildCss(),
            theme: 'system',
            bodyContent,
            footer: 'Generated by QA Tools — Pipeline Cost Analytics',
        });
    } catch (err) {
        rootLogger.error('Failed to generate pipeline cost HTML: ' + (err as Error).message);
        return buildErrorPage('Error generating report', 'Pipeline Cost Report Error');
    }
}
