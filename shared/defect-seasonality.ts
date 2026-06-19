/**
 * Defect Seasonality Dashboard (Sprint 11, #11) — detects temporal patterns
 * in failure classifications by day of week and hour.
 *
 * @module defect-seasonality
 */

import type { FailureClassification } from './metrics.js';
import { rootLogger } from './logger.js';
import { sanitizeHtml } from './escape.js';
import { buildHtmlPage, buildErrorPage } from './html-factory.js';
import { buildCss } from './report-styles.js';
import { MetricCard, MetricGrid, DataTable } from './primitives/index.js';
import type { TableColumn, TableRow } from './primitives/index.js';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const DAY_SORT_ORDER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
const HOUR_COUNT = 24;

export interface SeasonalityDay {
    dayOfWeek: string;
    total: number;
    categories: Record<string, number>;
}

export interface SeasonalityHour {
    hour: number;
    total: number;
    categories: Record<string, number>;
}

export interface SeasonalityResult {
    byDayOfWeek: SeasonalityDay[];
    byHour: SeasonalityHour[];
    peakDay: string;
    peakHour: number;
    totalRecords: number;
    period: { from: string; to: string };
    timestamp: string;
}

function getDayName(ts: string): string {
    return DAY_NAMES[new Date(ts).getUTCDay()] ?? 'Unknown';
}

function getHour(ts: string): number {
    return new Date(ts).getUTCHours();
}

function extractDate(ts: string): string {
    return ts.slice(0, 10);
}

function buildDayTable(days: SeasonalityDay[]): string {
    const allCategories = new Set<string>();
    for (const d of days) {
        for (const cat of Object.keys(d.categories)) {
            allCategories.add(cat);
        }
    }
    const cats = Array.from(allCategories).sort();

    const columns: TableColumn[] = [
        { key: 'day', label: 'Day' },
        { key: 'total', label: 'Total', align: 'center' },
        ...cats.map((c) => ({ key: sanitizeHtml(c), label: sanitizeHtml(c), align: 'center' as const })),
    ];

    const rows: TableRow[] = days.map((d) => {
        const cells: Record<string, string> = {
            day: d.dayOfWeek,
            total: String(d.total),
        };
        for (const c of cats) {
            cells[sanitizeHtml(c)] = String(d.categories[c] ?? 0);
        }
        return { key: d.dayOfWeek, cells };
    });

    return DataTable({ columns, rows, compact: true, ariaLabel: 'Day of Week Breakdown' });
}

function buildHourTable(hours: SeasonalityHour[]): string {
    const allCategories = new Set<string>();
    for (const h of hours) {
        for (const cat of Object.keys(h.categories)) {
            allCategories.add(cat);
        }
    }
    const cats = Array.from(allCategories).sort();

    const columns: TableColumn[] = [
        { key: 'hour', label: 'Hour', align: 'center' },
        { key: 'total', label: 'Total', align: 'center' },
        ...cats.map((c) => ({ key: sanitizeHtml(c), label: sanitizeHtml(c), align: 'center' as const })),
    ];

    const rows: TableRow[] = hours.map((h) => {
        const cells: Record<string, string> = {
            hour: `${h.hour}:00`,
            total: String(h.total),
        };
        for (const c of cats) {
            cells[sanitizeHtml(c)] = String(h.categories[c] ?? 0);
        }
        return { key: String(h.hour), cells };
    });

    return DataTable({ columns, rows, compact: true, ariaLabel: 'Hour Breakdown' });
}

export function aggregateDefectSeasonality(
    classifications: FailureClassification[] | null | undefined,
): SeasonalityResult {
    if (!classifications || classifications.length === 0) {
        const emptyDays: SeasonalityDay[] = DAY_SORT_ORDER.map((d) => ({
            dayOfWeek: d,
            total: 0,
            categories: {},
        }));
        const emptyHours: SeasonalityHour[] = Array.from({ length: HOUR_COUNT }, (_, i) => ({
            hour: i,
            total: 0,
            categories: {},
        }));
        return {
            byDayOfWeek: emptyDays,
            byHour: emptyHours,
            peakDay: 'N/A',
            peakHour: -1,
            totalRecords: 0,
            period: { from: '', to: '' },
            timestamp: new Date().toISOString(),
        };
    }

    const dayAcc: Record<string, { total: number; categories: Record<string, number> }> = {};
    const hourAcc: Record<number, { total: number; categories: Record<string, number> }> = {};
    let minDate = '';
    let maxDate = '';

    for (const fc of classifications) {
        const dayName = getDayName(fc.timestamp);
        const hour = getHour(fc.timestamp);
        const cat = fc.category;

        if (!dayAcc[dayName]) dayAcc[dayName] = { total: 0, categories: {} };
        dayAcc[dayName].total++;
        dayAcc[dayName].categories[cat] = (dayAcc[dayName].categories[cat] ?? 0) + 1;

        if (!isNaN(hour)) {
            if (!hourAcc[hour]) hourAcc[hour] = { total: 0, categories: {} };
            hourAcc[hour].total++;
            hourAcc[hour].categories[cat] = (hourAcc[hour].categories[cat] ?? 0) + 1;
        }

        const date = extractDate(fc.timestamp);
        if (!minDate || date < minDate) minDate = date;
        if (!maxDate || date > maxDate) maxDate = date;
    }

    const byDayOfWeek: SeasonalityDay[] = DAY_SORT_ORDER.map((d) => ({
        dayOfWeek: d,
        total: dayAcc[d]?.total ?? 0,
        categories: { ...(dayAcc[d]?.categories ?? {}) },
    }));

    const byHour: SeasonalityHour[] = Array.from({ length: HOUR_COUNT }, (_, i) => ({
        hour: i,
        total: hourAcc[i]?.total ?? 0,
        categories: { ...(hourAcc[i]?.categories ?? {}) },
    }));

    const peakDayEntry =
        byDayOfWeek.length > 0
            ? byDayOfWeek.reduce((best, d) => (d.total > best.total ? d : best))
            : { dayOfWeek: 'N/A', total: 0, categories: {} };
    const peakHourEntry =
        byHour.length > 0
            ? byHour.reduce((best, h) => (h.total > best.total ? h : best))
            : { hour: -1, total: 0, categories: {} };

    return {
        byDayOfWeek,
        byHour,
        peakDay: peakDayEntry.total > 0 ? peakDayEntry.dayOfWeek : 'N/A',
        peakHour: peakHourEntry.total > 0 ? peakHourEntry.hour : -1,
        totalRecords: classifications.length,
        period: { from: minDate, to: maxDate },
        timestamp: new Date().toISOString(),
    };
}

export function generateSeasonalityHtml(result: SeasonalityResult, title?: string): string {
    try {
        const pageTitle = title || 'Defect Seasonality Dashboard';

        if (result.totalRecords === 0) {
            return buildHtmlPage({
                title: pageTitle,
                styles: buildCss(),
                theme: 'system',
                bodyContent: `<h1>${sanitizeHtml(pageTitle)}</h1><p>No defect data available.</p>`,
                footer: 'Generated by QA Tools — Defect Seasonality Dashboard',
            });
        }

        const peakHourLabel = result.peakHour >= 0 ? `${result.peakHour}:00` : 'N/A';

        const summaryCards = MetricGrid({
            children:
                MetricCard({ label: 'Total Records', value: String(result.totalRecords) }) +
                MetricCard({ label: 'Peak Day', value: result.peakDay }) +
                MetricCard({ label: 'Peak Hour', value: peakHourLabel }),
        });

        const bodyContent =
            `<h1>${sanitizeHtml(pageTitle)}</h1>` +
            summaryCards +
            `<h2>Day of Week Breakdown</h2>` +
            buildDayTable(result.byDayOfWeek) +
            `<h2>Hour Breakdown</h2>` +
            buildHourTable(result.byHour);

        return buildHtmlPage({
            title: pageTitle,
            styles: buildCss(),
            theme: 'system',
            bodyContent,
            footer: 'Generated by QA Tools — Defect Seasonality Dashboard',
        });
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        rootLogger.error('Failed to generate seasonality dashboard: ' + msg + '. Verify buildCss dependency.');
        return buildErrorPage('Error generating dashboard', 'Error generating dashboard');
    }
}
