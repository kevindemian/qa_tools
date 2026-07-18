/**
 * Defect Trend Dashboard (D2 in Sprint 10) — aggregates failure classifications
 * from the metrics store and generates a trend visualisation.
 *
 * @module defect-trend
 */

import type { FailureClassification } from '../types/data-hub.js';
import { rootLogger } from '../logger.js';
import { sanitizeHtml } from '../escape.js';
import { buildHtmlPage, buildErrorPage } from '../report/html-factory.js';
import { buildCss } from '../report/report-styles.js';
import { MetricCard, MetricGrid } from '../primitives/index.js';

export interface DefectTrendPoint {
    date: string;
    categories: Record<string, number>;
    total: number;
}

export interface DefectTrendResult {
    trends: DefectTrendPoint[];
    topCategories: Array<{ category: string; count: number }>;
    period: { from: string; to: string };
}

function sanitizeNumber(v: number): number {
    return Number.isFinite(v) ? v : 0;
}

/**
 * Sanitizes all numeric fields in a DefectTrendResult at the output boundary.
 * Converts NaN and Infinity to 0 before HTML rendering.
 */
export function sanitizeTrendResult(r: DefectTrendResult): DefectTrendResult {
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

function extractDate(ts: string): string {
    return ts.slice(0, 10);
}

function buildSummaryCards(top: Array<{ category: string; count: number }>): string {
    if (top.length === 0) return '';
    return MetricGrid({
        children: top.map((c) => MetricCard({ label: sanitizeHtml(c.category), value: String(c.count) })).join(''),
    });
}

function buildTrendTable(trends: DefectTrendPoint[]): string {
    if (trends.length === 0) return '<p>No defect data available.</p>';

    const allCategories = new Set<string>();
    for (const t of trends) {
        for (const cat of Object.keys(t.categories)) {
            allCategories.add(cat);
        }
    }
    const cats = Array.from(allCategories).sort((a, b) => a.localeCompare(b));

    const headerCells = cats
        .map(
            (c) =>
                `<th style="padding:10px 12px;font-size:0.75rem;text-transform:uppercase;color:var(--color-text-secondary);text-align:left">${sanitizeHtml(c)}</th>`,
        )
        .join('');

    const bodyRows = trends
        .map((t) => {
            const catEntries = Object.entries(t.categories);
            const cells = cats
                .map((c) => {
                    const entry = catEntries.find(([k]) => k === c);
                    return `<td style="padding:8px 12px;text-align:center">${entry?.[1] ?? 0}</td>`;
                })
                .join('');
            const dateStr = sanitizeHtml(t.date);
            return `<tr style="border-bottom:1px solid var(--color-border-subtle)"><td style="padding:8px 12px;font-weight:600">${dateStr}</td><td style="padding:8px 12px;text-align:center">${t.total}</td>${cells}</tr>`;
        })
        .join('');

    return `
<div style="overflow-x:auto;border-radius:8px;box-shadow:0 1px 3px rgba(0,0,0,0.1)">
<table style="width:100%;border-collapse:collapse;background:var(--color-surface-card);font-size:0.875rem;color:var(--color-text-primary)">
<thead style="background:var(--color-surface-elevated)"><tr>
<th style="padding:10px 12px;font-size:0.75rem;text-transform:uppercase;color:var(--color-text-secondary);text-align:left">Date</th>
<th style="padding:10px 12px;font-size:0.75rem;text-transform:uppercase;color:var(--color-text-secondary);text-align:left">Total</th>
${headerCells}
</tr></thead>
<tbody>${bodyRows}</tbody>
</table>
</div>`;
}

export function aggregateDefectTrends(classifications: FailureClassification[] | null | undefined): DefectTrendResult {
    if (!classifications || classifications.length === 0) {
        return { trends: [], topCategories: [], period: { from: '', to: '' } };
    }

    const grouped = new Map<string, Map<string, number>>();
    const overallCounts = new Map<string, number>();
    let minDate = '';
    let maxDate = '';

    for (const fc of classifications) {
        const date = extractDate(fc.timestamp);
        const cat = fc.category;

        let dayGroup = grouped.get(date);
        if (!dayGroup) {
            dayGroup = new Map();
            grouped.set(date, dayGroup);
        }
        dayGroup.set(cat, (dayGroup.get(cat) ?? 0) + 1);

        overallCounts.set(cat, (overallCounts.get(cat) ?? 0) + 1);

        if (!minDate || date < minDate) minDate = date;
        if (!maxDate || date > maxDate) maxDate = date;
    }

    const sortedDates = Array.from(grouped.keys()).sort((a, b) => a.localeCompare(b));
    const trends: DefectTrendPoint[] = sortedDates.map((date) => {
        const cats = grouped.get(date);
        const total = cats ? Array.from(cats.values()).reduce((sum, v) => sum + v, 0) : 0;
        return { date, categories: cats ? Object.fromEntries(cats) : {}, total };
    });

    const topCategories = Array.from(overallCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([category, count]) => ({ category, count }));

    return { trends, topCategories, period: { from: minDate, to: maxDate } };
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
                bodyContent: `<h1>${sanitizeHtml(pageTitle)}</h1><p>No defect data available.</p>`,
                footer: 'Generated by QA Tools — Defect Trend Dashboard',
            });
        }

        const bodyContent =
            `<h1>${sanitizeHtml(pageTitle)}</h1>` +
            `<h2>Top Categories</h2>` +
            buildSummaryCards(result.topCategories) +
            `<h2>Trend (${sanitizeHtml(result.period.from)} — ${sanitizeHtml(result.period.to)})</h2>` +
            buildTrendTable(result.trends);

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
