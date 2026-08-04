/**
 * Defect Trend Dashboard — HTML renderer.
 *
 * This module handles ONLY HTML generation; the aggregation (SSOT) lives in
 * `shared/data-hub/compute/defect-aggregation.ts`.
 *
 * @module defect-trend-renderer
 */

import { rootLogger } from '../logger.js';
import { resolveGeneratedAt } from '../date-utils.js';
import { sanitizeHtml } from '../escape.js';
import { buildHtmlPage, buildErrorPage } from '../report/html-factory.js';
import { buildCss } from '../report/report-styles.js';
import { MetricCard, MetricGrid, DataTable, Section, EmptyState, RecommendedActions } from '../primitives/index.js';
import type { TableColumn, TableRow } from '../primitives/index.js';
import type { DefectAggregationResult } from '../types/data-hub-extensions.js';
import { icon } from '../icons.js';

const AVG_DEFECTS_PER_DAY_TARGET = 10;

function sanitizeNumber(v: number): number {
    return Number.isFinite(v) ? v : 0;
}

/**
 * Sanitizes all numeric fields in a DefectAggregationResult at the HTML output
 * boundary (Rule 5/24). Converts NaN and Infinity to 0 before rendering so no
 * invalid numeric leaks into the generated markup.
 */
function sanitizeTrendResult(r: DefectAggregationResult): DefectAggregationResult {
    return {
        ...r,
        trends: r.trends.map((t) => ({
            date: t.date,
            total: sanitizeNumber(t.total),
            categories: Object.fromEntries(Object.entries(t.categories).map(([k, v]) => [k, sanitizeNumber(v)])),
        })),
        topCategories: r.topCategories.map((c) => ({
            category: c.category,
            count: sanitizeNumber(c.count),
        })),
    };
}

function buildSummaryCards(result: DefectAggregationResult): string {
    // Rule 25: explicit no-data (defect summary unavailable) instead of silent omission.
    if (result.topCategories.length === 0) {
        return EmptyState({
            title: 'No defect trend data available',
            description: 'Defect trend summary requires aggregated defect categories. No category data was found.',
            action: 'Run the defect aggregation pipeline to populate trend and category data.',
            icon: icon('trending-up', 16),
        });
    }

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
                    label: 'Trend Direction',
                    value: trendDirection,
                    severity: (() => {
                        if (trendDirection === 'increasing') return 'error';
                        if (trendDirection === 'decreasing') return 'success';
                        return 'default';
                    })(),
                    target: 'target: stable',
                }) +
                MetricCard({
                    label: 'Avg Defects/Day',
                    value: String(avgDefectsPerDay),
                    severity: avgDefectsPerDay > AVG_DEFECTS_PER_DAY_TARGET ? 'warn' : 'default',
                    target: `target: <${AVG_DEFECTS_PER_DAY_TARGET}`,
                }),
        }),
    });
}

function buildTrendTable(result: DefectAggregationResult): string {
    if (result.trends.length === 0) {
        return EmptyState({
            title: 'No defect data available.',
            description: 'No defect trend data is available for analysis.',
            action: 'Run defect classification pipeline to generate trend data.',
            icon: icon('bar-chart', 16),
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
        const cells = new Map<string, string>([
            ['date', sanitizeHtml(t.date)],
            ['total', String(t.total)],
            ['trend', ''],
        ]);

        // Add trend indicator
        if (i > 0) {
            const prevTotal = result.trends[i - 1]?.total ?? 0;
            if (t.total > prevTotal * 1.5) {
                cells.set('trend', `${icon('alert-circle', 14)} Spike`);
            } else if (t.total < prevTotal * 0.7) {
                cells.set('trend', `${icon('trending-down', 14)} Drop`);
            } else {
                cells.set('trend', `${icon('minus-circle', 14)} Stable`);
            }
        }

        for (const c of cats) {
            const entry = catEntries.find(([k]) => k === c);
            cells.set(c, String(entry?.[1] ?? 0));
        }
        return { key: t.date, cells: Object.fromEntries(cells) };
    });

    return Section({
        dataSection: 'trend',
        title: 'Trend Table',
        children: DataTable({ columns, rows, caption: 'Defect trend by date and category — spikes highlighted' }),
    });
}

function buildRecommendedActions(result: DefectAggregationResult): string {
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

export function generateDefectTrendHtml(
    result: DefectAggregationResult | null | undefined,
    title?: string,
    generatedAt?: string,
): string {
    if (!result) {
        rootLogger.error('generateDefectTrendHtml: defect aggregation result is missing.');
        return buildErrorPage('Error generating dashboard', 'Defect trend data is unavailable.');
    }
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
                        icon: icon('search', 16),
                    }) +
                    `</div>`,
                footer: 'Generated by QA Tools — Defect Trend Dashboard',
            });
        }

        const bodyContent =
            `<div data-dashboard="defect-trend">` +
            `<h1>${sanitizeHtml(pageTitle)}</h1>` +
            `<div data-part="timestamp">${sanitizeHtml(resolveGeneratedAt(generatedAt))}</div>` +
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
