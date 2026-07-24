/**
 * Defect Trend Dashboard (D2 in Sprint 10) — aggregates failure classifications
 * from the metrics store and generates a trend visualisation.
 *
 * @module defect-trend
 */

import type { FailureClassification } from '../types/data-hub.js';

export { generateDefectTrendHtml } from './defect-trend-renderer.js';

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
    if (!ts || typeof ts !== 'string' || ts.length < 10) return 'Unknown';
    const datePart = ts.slice(0, 10);
    // Validate YYYY-MM-DD format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return 'Unknown';
    return datePart;
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
