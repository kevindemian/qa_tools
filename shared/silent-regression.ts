/**
 * Silent Regression Detector — detects tests whose duration has increased
 * abnormally (> 2σ from historical mean), indicating a possible silent regression.
 *
 * Uses primitives and design tokens for consistent HTML report output.
 *
 * @module silent-regression
 */

import { sanitizeHtml } from './escape.js';
import { buildHtmlPage, buildErrorPage } from './html-factory.js';
import { buildCss } from './report-styles.js';
import { MetricCard, MetricGrid, DataTable, Badge } from './primitives/index.js';
import type { TableColumn, TableRow } from './primitives/index.js';
import { rootLogger } from './logger.js';

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

function computeMean(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
}

function computeStdDev(values: number[], mean: number): number {
    if (values.length === 0) return 0;
    const squaredDiffs = values.map((v) => (v - mean) ** 2);
    return Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / values.length);
}

function computeSeverity(zScore: number): RegressionEntry['severity'] {
    if (zScore > 5) return 'critical';
    if (zScore > 3) return 'high';
    if (zScore > 2) return 'medium';
    if (zScore > 1) return 'low';
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
        const currentDuration = durations[durations.length - 1] as number;
        const mean = computeMean(hist);
        const stdDev = computeStdDev(hist, mean);
        const denom = stdDev || 0.001;
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
            rootLogger.error('Silent regression result is null or undefined');
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
        rootLogger.error('Failed to generate silent regression HTML: ' + (err as Error).message);
        return buildErrorPage('Error generating report', 'Error generating silent regression report');
    }
}
