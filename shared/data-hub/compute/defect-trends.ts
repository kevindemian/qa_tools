/**
 * Data Hub — Defect Trends (Compute Puro).
 *
 * Aggregates failure classifications by date and category.
 * Pure function with no side effects.
 *
 * References:
 * - Industry standard: categorization by test type (unit, integration, e2e)
 * - ISTQB: defect taxonomy for test failure analysis
 */
import type { FailureClassification } from '../../metrics.js';

/** A single defect trend data point. */
export interface DefectTrendPoint {
    /** Date string (YYYY-MM-DD). */
    date: string;
    /** Counts by category. */
    categories: Record<string, number>;
    /** Total failures on this date. */
    total: number;
}

/** Result of defect trend aggregation. */
export interface DefectTrendResult {
    /** Daily trend data points. */
    trends: DefectTrendPoint[];
    /** Top categories sorted by count descending. */
    topCategories: Array<{ category: string; count: number }>;
}

/**
 * Aggregates failure classifications into daily defect trends.
 *
 * @param classifications - Failure classifications from MetricsStore
 * @returns DefectTrendResult with daily trends and top categories
 *
 * @example
 * ```ts
 * const result = calcDefectTrends(classifications);
 * // { trends: [{ date: '2026-01-01', categories: { unit: 5, e2e: 2 }, total: 7 }], ... }
 * ```
 */
export function calcDefectTrends(classifications: FailureClassification[]): DefectTrendResult {
    if (classifications.length === 0) {
        return { trends: [], topCategories: [] };
    }

    const grouped = new Map<string, Map<string, number>>();
    const overallCounts = new Map<string, number>();

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

    return { trends, topCategories };
}

/**
 * Extracts date portion (YYYY-MM-DD) from an ISO timestamp.
 */
function extractDate(ts: string): string {
    return ts.slice(0, 10);
}
