/**
 * Pipeline Cost Analytics — calculates cost of pipeline runs based on duration.
 *
 * @module pipeline-cost
 */

import { sanitizeHtml } from '../escape.js';
import { buildHtmlPage, buildErrorPage } from '../report/html-factory.js';
import { buildCss } from '../report/report-styles.js';
import { MetricCard, MetricGrid, DataTable } from '../primitives/index.js';
import type { TableColumn, TableRow } from '../primitives/index.js';
import { rootLogger } from '../logger.js';
import type { DataHub } from '../types/data-hub.js';

export const DEFAULT_COST_PER_MINUTE = 0.01;

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

/** Mapeia conclusion do CI para status legível. */
function mapConclusionToStatus(conclusion: string | undefined): 'passed' | 'failed' | 'unknown' {
    if (conclusion === 'success') return 'passed';
    if (conclusion === 'failure') return 'failed';
    return 'unknown';
}

export function calculatePipelineCost(costPerMinute: number | undefined, dataHub: DataHub): PipelineCostResult {
    const envCpm = Number(process.env['QA_COST_PER_COMPUTE_MINUTE']);
    const rawCpm = costPerMinute ?? (Number.isFinite(envCpm) && envCpm >= 0 ? envCpm : DEFAULT_COST_PER_MINUTE);
    // Rule 24 — cost rate must be a finite, non-negative number; negative/NaN rates are rejected (never produce negative/NaN costs).
    const cpm = Number.isFinite(rawCpm) && rawCpm >= 0 ? rawCpm : DEFAULT_COST_PER_MINUTE;

    // SSOT: custo de pipeline vem exclusivamente do DataHub (Camadas 1–6 do CI).
    const ciRuns = dataHub.getRuns();
    const costByRun: PipelineCostEntry[] = ciRuns.map((r) => {
        const durationSec =
            r.run_started_at && r.updated_at
                ? (new Date(r.updated_at).getTime() - new Date(r.run_started_at).getTime()) / 1000
                : 0;
        const safeDuration = Number.isFinite(durationSec) && durationSec >= 0 ? durationSec : 0;
        return {
            timestamp: r.created_at ?? new Date().toISOString(),
            durationSec: safeDuration,
            cost: (safeDuration / 60) * cpm,
            status: mapConclusionToStatus(r.conclusion),
        };
    });

    costByRun.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

    const totalDurationSec = costByRun.reduce((s, e) => s + e.durationSec, 0);
    const totalCost = costByRun.reduce((s, e) => s + e.cost, 0);
    const sortedTimestamps = ciRuns
        .map((r) => r.created_at ?? '')
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b));

    return {
        totalCost,
        avgCostPerRun: costByRun.length > 0 ? totalCost / costByRun.length : 0,
        totalDurationSec,
        costPerMinute: cpm,
        costByRun,
        runCount: ciRuns.length,
        period: {
            from: sortedTimestamps[0] ?? '',
            to: sortedTimestamps[sortedTimestamps.length - 1] ?? '',
        },
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
            rootLogger.error(
                'Pipeline cost result is null or undefined. Ensure calculatePipelineCost is called before generatePipelineCostHtml.',
            );
            return buildErrorPage(
                'Error generating report — no pipeline cost data found',
                'Pipeline Cost Report Error',
            );
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
        const msg = err instanceof Error ? err.message : String(err);
        rootLogger.error('Failed to generate pipeline cost HTML: ' + msg);
        return buildErrorPage(
            'Error generating report — check pipeline cost data and try again',
            'Pipeline Cost Report Error',
        );
    }
}
