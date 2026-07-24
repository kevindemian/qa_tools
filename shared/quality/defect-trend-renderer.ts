/**
 * Defect Trend Dashboard — HTML renderer.
 *
 * Extracted from defect-trend.ts (compute) to separate concerns.
 * This module handles ONLY HTML generation; all business logic remains in defect-trend.ts.
 *
 * @module defect-trend-renderer
 */

import { rootLogger } from '../logger.js';
import { sanitizeHtml } from '../escape.js';
import { buildHtmlPage, buildErrorPage } from '../report/html-factory.js';
import { buildCss } from '../report/report-styles.js';
import { MetricCard, MetricGrid, DataTable, Section, EmptyState, RecommendedActions } from '../primitives/index.js';
import type { TableColumn, TableRow } from '../primitives/index.js';
import type { DefectTrendResult } from './defect-trend.js';
import { sanitizeTrendResult } from './defect-trend.js';

function buildSummaryCards(result: DefectTrendResult): string {
    if (result.topCategories.length === 0) return '';

    // Calculate trend direction
    const trends = result.trends;
    let trendDirection = 'stable';
    if (trends.length >= 2) {
        const firstTotal = trends[0]?.total ?? 0;
        const lastTotal = trends[trends.length - 1]?.total ?? 0;
        const delta = lastTotal - firstTotal;
        if (delta > 0) {
            trendDirection = 'increasing';
        } else if (delta < 0) {
            trendDirection = 'decreasing';
        }
    }

    // Calculate average defects per day
    const avgDefectsPerDay =
        trends.length > 0 ? Math.round(trends.reduce((sum, t) => sum + t.total, 0) / trends.length) : 0;

    return Section({
        dataSection: 'summary',
        title: 'Summary',
        children: MetricGrid({
            children:
                MetricCard({
                    label: 'Top Category',
                    value: result.topCategories[0] ? sanitizeHtml(result.topCategories[0].category) : '—',
                }) +
                MetricCard({ label: 'Total Defects', value: String(result.topCategories[0]?.count ?? 0) }) +
                MetricCard({
                    label: 'Trend',
                    value: trendDirection,
                    severity: (() => {
                        if (trendDirection === 'increasing') return 'error';
                        if (trendDirection === 'decreasing') return 'success';
                        return 'default';
                    })(),
                }) +
                MetricCard({
                    label: 'Avg Defects/Day',
                    value: String(avgDefectsPerDay),
                    severity: avgDefectsPerDay > 10 ? 'warn' : 'default',
                }),
        }),
    });
}

function buildTrendTable(result: DefectTrendResult): string {
    if (result.trends.length === 0) {
        return EmptyState({
            title: 'No defect data available.',
            description: 'No defect trend data is available for analysis.',
            action: 'Run defect classification pipeline to generate trend data.',
            icon: '\u{1F4CA}',
        });
    }

    const allCategories = new Set<string>();
    for (const t of result.trends) {
        for (const cat of Object.keys(t.categories)) {
            allCategories.add(cat);
        }
    }
    const cats = Array.from(allCategories).sort((a, b) => a.localeCompare(b));

    const columns: TableColumn[] = [
        { key: 'date', label: 'Date', width: '15%' },
        { key: 'total', label: 'Total', align: 'center' },
        { key: 'trend', label: 'Trend', align: 'center' },
        ...cats.map((c) => ({ key: c, label: sanitizeHtml(c), align: 'center' as const })),
    ];

    const rows: TableRow[] = result.trends.map((t, i) => {
        const catEntries = Object.entries(t.categories);
        const cells: Record<string, string> = {
            date: sanitizeHtml(t.date),
            total: String(t.total),
            trend: '',
        };

        // Add trend indicator
        if (i > 0) {
            const prevTotal = result.trends[i - 1]?.total ?? 0;
            if (t.total > prevTotal * 1.5) {
                cells['trend'] = '\u{1F534} Spike';
            } else if (t.total < prevTotal * 0.7) {
                cells['trend'] = '\u{1F7E2} Drop';
            } else {
                cells['trend'] = '\u{1F7E1} Stable';
            }
        }

        for (const c of cats) {
            const entry = catEntries.find(([k]) => k === c);
            cells[c] = String(entry?.[1] ?? 0);
        }
        return { key: t.date, cells };
    });

    return Section({
        dataSection: 'trend',
        title: `Trend (${sanitizeHtml(result.period.from)} \u2014 ${sanitizeHtml(result.period.to)})`,
        children: DataTable({ columns, rows, caption: 'Defect trend by date and category — spikes highlighted' }),
    });
}

function buildRecommendedActions(result: DefectTrendResult): string {
    const actions: Array<{ severity: 'error' | 'warn' | 'info'; text: string }> = [];

    // Action 1: High categories
    const highCategories = result.topCategories.filter((c) => c.count > 10);
    if (highCategories.length > 0) {
        actions.push({
            severity: 'error',
            text: `High defect count in categories: ${highCategories.map((c) => sanitizeHtml(c.category)).join(', ')}. Investigate root causes and implement prevention measures.`,
        });
    }

    // Action 2: Increasing trend
    if (result.trends.length > 1) {
        const firstTotal = result.trends[0]?.total ?? 0;
        const lastTotal = result.trends[result.trends.length - 1]?.total ?? 0;
        if (lastTotal > firstTotal * 1.5) {
            actions.push({
                severity: 'warn',
                text: `Defect count increased by ${((lastTotal / firstTotal - 1) * 100).toFixed(0)}% over the period. Monitor for regression and investigate recent changes.`,
            });
        }
    }

    // Action 3: Spike detection
    const avgTotal = result.trends.reduce((sum, t) => sum + t.total, 0) / result.trends.length;
    const spikeDates = result.trends.filter((t) => t.total > avgTotal * 1.5).map((t) => t.date);
    if (spikeDates.length > 0) {
        actions.push({
            severity: 'warn',
            text: `Defect spikes detected on: ${spikeDates.join(', ')}. Investigate what changed on these dates.`,
        });
    }

    // Default action if no issues found
    if (actions.length === 0) {
        actions.push({
            severity: 'info',
            text: 'Defect trends are within normal ranges. Continue monitoring.',
        });
    }

    return Section({
        dataSection: 'actions',
        title: 'Recommended Actions',
        children: RecommendedActions({ actions }),
    });
}

export function generateDefectTrendHtml(result: DefectTrendResult, title?: string): string {
    result = sanitizeTrendResult(result);
    try {
        const pageTitle = title || 'Defect Trend Dashboard';

        if (result.trends.length === 0) {
            return buildHtmlPage({
                title: pageTitle,
                styles: buildCss(),
                theme: 'system',
                bodyContent:
                    `<div data-dashboard="defect-trend">` +
                    EmptyState({
                        title: 'No defect data available.',
                        description: 'No defect classification data is available for trend analysis.',
                        action: 'Run defect classification pipeline to generate data.',
                        icon: '\u{1F50D}',
                    }) +
                    `</div>`,
                footer: 'Generated by QA Tools — Defect Trend Dashboard',
            });
        }

        const bodyContent =
            `<div data-dashboard="defect-trend">` +
            `<h1>${sanitizeHtml(pageTitle)}</h1>` +
            buildSummaryCards(result) +
            buildTrendTable(result) +
            buildRecommendedActions(result) +
            `</div>`;

        return buildHtmlPage({
            title: pageTitle,
            styles: buildCss(),
            theme: 'system',
            bodyContent,
            footer: 'Generated by QA Tools — Defect Trend Dashboard',
        });
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        rootLogger.error('Failed to generate defect trend dashboard. Check input data for validity: ' + msg);
        return buildErrorPage('Error generating dashboard', 'Error generating dashboard');
    }
}
