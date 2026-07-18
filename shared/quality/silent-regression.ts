/**
 * Silent Regression Detector — detects tests whose duration has increased
 * abnormally (> 2σ from historical mean), indicating a possible silent regression.
 *
 * Uses primitives and design tokens for consistent HTML report output.
 *
 * @module silent-regression
 */

import { sanitizeHtml } from '../escape.js';
import { buildHtmlPage, buildErrorPage } from '../report/html-factory.js';
import { buildCss } from '../report/report-styles.js';
import { MetricCard, MetricGrid, DataTable, Badge } from '../primitives/index.js';
import type { TableColumn, TableRow } from '../primitives/index.js';
import { rootLogger } from '../logger.js';

/**
 * Dimension 5 Provenance — documents the source and justification for z-score thresholds.
 * @reference ISO 3534-2 (Statistical process control)
 */
export const SILENT_REGRESSION_PROVENANCE = {
    severityThresholds: {
        LOW: { zScore: 1, source: 'Statistical process control (1-sigma)', standard: 'ISO 3534-2' },
        MEDIUM: { zScore: 2, source: 'Statistical process control (2-sigma)', standard: 'ISO 3534-2' },
        HIGH: { zScore: 3, source: 'Statistical process control (3-sigma)', standard: 'ISO 3534-2' },
        CRITICAL: { zScore: 5, source: 'Extreme outlier detection (5-sigma)', standard: 'ISO 3534-2' },
    },
} as const;

export interface RegressionEntry {
    title: string;
    meanDuration: number;
    currentDuration: number;
    stdDev: number;
    zScore: number;
    severity: 'none' | 'low' | 'medium' | 'high' | 'critical';
    previousDurations: number[];
}

export interface RegressionResult {
    regressions: RegressionEntry[];
    totalTests: number;
    threshold: number;
    timestamp: string;
}

const SEVERITY_THRESHOLD_CRITICAL = 5;
const SEVERITY_THRESHOLD_HIGH = 3;
const SEVERITY_THRESHOLD_MEDIUM = 2;
const SEVERITY_THRESHOLD_LOW = 1;
const STDDEV_DENOM_FALLBACK = 0.001;

function computeMean(values: number[]): number {
    if (values.length === 0) return 0;
    const sum = values.reduce((a, b) => a + b, 0);
    return Number.isFinite(sum) ? sum / values.length : 0;
}

function computeStdDev(values: number[], mean: number): number {
    if (values.length === 0) return 0;
    const squaredDiffs = values.map((v) => (v - mean) ** 2);
    const variance = squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
    return Number.isFinite(variance) ? Math.sqrt(variance) : 0;
}

function computeSeverity(zScore: number): RegressionEntry['severity'] {
    if (!Number.isFinite(zScore)) return 'none';
    if (zScore > SEVERITY_THRESHOLD_CRITICAL) return 'critical';
    if (zScore > SEVERITY_THRESHOLD_HIGH) return 'high';
    if (zScore > SEVERITY_THRESHOLD_MEDIUM) return 'medium';
    if (zScore > SEVERITY_THRESHOLD_LOW) return 'low';
    return 'none';
}

export function detectSilentRegression(testHistories: Record<string, number[]>, threshold?: number): RegressionResult {
    const t = threshold ?? 2;
    const regressions: RegressionEntry[] = [];
    let totalTests = 0;

    for (const [title, durations] of Object.entries(testHistories)) {
        if (durations.length < 2) continue;
        totalTests++;

        const hist = durations.slice(0, -1);
        const last = durations[durations.length - 1];
        if (last === undefined) continue;
        const currentDuration = last;
        const mean = computeMean(hist);
        const stdDev = computeStdDev(hist, mean);
        const denom = stdDev || STDDEV_DENOM_FALLBACK;
        const zScore = (currentDuration - mean) / denom;
        const severity = computeSeverity(zScore);

        const entry: RegressionEntry = {
            title,
            meanDuration: mean,
            currentDuration,
            stdDev,
            zScore,
            severity,
            previousDurations: hist,
        };

        if (zScore > t) {
            regressions.push(entry);
        }
    }

    return {
        regressions,
        totalTests,
        threshold: t,
        timestamp: new Date().toISOString(),
    };
}

function severityBadgeVariant(severity: RegressionEntry['severity']): 'fail' | 'warn' | 'info' | 'default' {
    switch (severity) {
        case 'critical':
        case 'high':
            return 'fail';
        case 'medium':
            return 'warn';
        case 'low':
            return 'info';
        default:
            return 'default';
    }
}

export function generateSilentRegressionHtml(result: RegressionResult | null | undefined, title?: string): string {
    try {
        if (!result) {
            rootLogger.error('Silent regression result is null or undefined. Provide a valid RegressionResult.');
            return buildErrorPage('Error generating report', 'Error generating silent regression report');
        }
        const pageTitle = title || 'Silent Regression Detector';

        const summaryCards = MetricGrid({
            children:
                MetricCard({ label: 'Total Tests', value: String(result.totalTests) }) +
                MetricCard({
                    label: 'Regressions Found',
                    value: String(result.regressions.length),
                    severity: result.regressions.length > 0 ? 'error' : 'success',
                }) +
                MetricCard({ label: 'Threshold (z)', value: '>' + String(result.threshold) }),
        });

        let tableHtml: string;
        if (result.regressions.length === 0) {
            tableHtml =
                '<p style="color:var(--color-success);font-weight:600">No silent regressions detected. All tests are within the normal duration range.</p>';
        } else {
            const columns: TableColumn[] = [
                { key: 'title', label: 'Test', width: '30%' },
                { key: 'current', label: 'Current (s)', align: 'right' },
                { key: 'mean', label: 'Mean (s)', align: 'right' },
                { key: 'stddev', label: 'Std Dev', align: 'right' },
                { key: 'zscore', label: 'Z-Score', align: 'right' },
                { key: 'severity', label: 'Severity' },
            ];

            const rows: TableRow[] = result.regressions.map((r, i) => ({
                key: String(i),
                cells: {
                    title: sanitizeHtml(r.title),
                    current: r.currentDuration.toFixed(3),
                    mean: r.meanDuration.toFixed(3),
                    stddev: r.stdDev.toFixed(3),
                    zscore: r.zScore.toFixed(2),
                    severity: Badge({
                        variant: severityBadgeVariant(r.severity),
                        children: r.severity,
                    }),
                },
            }));

            tableHtml = DataTable({ columns, rows });
        }

        const bodyContent = '<h1>' + sanitizeHtml(pageTitle) + '</h1>' + summaryCards + tableHtml;

        return buildHtmlPage({
            title: pageTitle,
            styles: buildCss(),
            theme: 'system',
            bodyContent,
            footer: 'Generated by QA Tools — Silent Regression Detector',
        });
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        rootLogger.error(
            'Failed to generate silent regression HTML: ' + msg + '. Verify buildCss and buildHtmlPage dependencies.',
        );
        return buildErrorPage('Error generating report', 'Error generating silent regression report');
    }
}
