/**
 * Defect Seasonality Dashboard (Sprint 11, #11) — detects temporal patterns
 * in failure classifications by day of week and hour.
 *
 * @module defect-seasonality
 */

import type { FailureClassification } from './types/data-hub.js';
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
    const cats = Array.from(allCategories).sort((a, b) => a.localeCompare(b));

    const columns: TableColumn[] = [
        { key: 'day', label: 'Day' },
        { key: 'total', label: 'Total', align: 'center' },
        ...cats.map((c) => ({ key: sanitizeHtml(c), label: sanitizeHtml(c), align: 'center' as const })),
    ];

    const rows: TableRow[] = days.map((d) => {
        const baseCells: [string, string][] = [
            ['day', d.dayOfWeek],
            ['total', String(d.total)],
        ];
        const catEntries = Object.entries(d.categories);
        const catCells: [string, string][] = catEntries.map(([k, v]) => [sanitizeHtml(k), String(v)]);
        const cells: Record<string, string> = Object.fromEntries([...baseCells, ...catCells]);
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
    const cats = Array.from(allCategories).sort((a, b) => a.localeCompare(b));

    const columns: TableColumn[] = [
        { key: 'hour', label: 'Hour', align: 'center' },
        { key: 'total', label: 'Total', align: 'center' },
        ...cats.map((c) => ({ key: sanitizeHtml(c), label: sanitizeHtml(c), align: 'center' as const })),
    ];

    const rows: TableRow[] = hours.map((h) => {
        const baseCells: [string, string][] = [
            ['hour', `${h.hour}:00`],
            ['total', String(h.total)],
        ];
        const catEntries = Object.entries(h.categories);
        const catCells: [string, string][] = catEntries.map(([k, v]) => [sanitizeHtml(k), String(v)]);
        const cells: Record<string, string> = Object.fromEntries([...baseCells, ...catCells]);
        return { key: String(h.hour), cells };
    });

    return DataTable({ columns, rows, compact: true, ariaLabel: 'Hour Breakdown' });
}

function buildEmptySeasonalityResult(): SeasonalityResult {
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

interface AccumulatorState {
    dayAcc: Map<string, { total: number; categories: Map<string, number> }>;
    hourAcc: Map<number, { total: number; categories: Map<string, number> }>;
    minDate: string;
    maxDate: string;
}

function accumulateClassification(state: AccumulatorState, fc: FailureClassification): void {
    const dayName = getDayName(fc.timestamp);
    const hour = getHour(fc.timestamp);
    const cat = fc.category;

    if (!state.dayAcc.has(dayName)) state.dayAcc.set(dayName, { total: 0, categories: new Map() });
    const dayEntry = state.dayAcc.get(dayName);
    if (dayEntry) {
        dayEntry.total++;
        dayEntry.categories.set(cat, (dayEntry.categories.get(cat) ?? 0) + 1);
    }

    if (!isNaN(hour)) {
        if (!state.hourAcc.has(hour)) state.hourAcc.set(hour, { total: 0, categories: new Map() });
        const hourEntry = state.hourAcc.get(hour);
        if (hourEntry) {
            hourEntry.total++;
            hourEntry.categories.set(cat, (hourEntry.categories.get(cat) ?? 0) + 1);
        }
    }

    const date = extractDate(fc.timestamp);
    if (!state.minDate || date < state.minDate) state.minDate = date;
    if (!state.maxDate || date > state.maxDate) state.maxDate = date;
}

function findPeakDay(days: SeasonalityDay[]): SeasonalityDay {
    const fallback: SeasonalityDay = { dayOfWeek: 'N/A', total: 0, categories: {} };
    return days.length > 0
        ? days.reduce((best, d) => (d.total > best.total ? d : best), days[0] ?? fallback)
        : fallback;
}

function findPeakHour(hours: SeasonalityHour[]): SeasonalityHour {
    const fallback: SeasonalityHour = { hour: -1, total: 0, categories: {} };
    return hours.length > 0
        ? hours.reduce((best, h) => (h.total > best.total ? h : best), hours[0] ?? fallback)
        : fallback;
}

export function aggregateDefectSeasonality(
    classifications: FailureClassification[] | null | undefined,
): SeasonalityResult {
    if (!classifications || classifications.length === 0) {
        return buildEmptySeasonalityResult();
    }

    const state: AccumulatorState = {
        dayAcc: new Map(),
        hourAcc: new Map(),
        minDate: '',
        maxDate: '',
    };

    for (const fc of classifications) {
        accumulateClassification(state, fc);
    }

    const byDayOfWeek: SeasonalityDay[] = DAY_SORT_ORDER.map((d) => ({
        dayOfWeek: d,
        total: state.dayAcc.get(d)?.total ?? 0,
        categories: Object.fromEntries(state.dayAcc.get(d)?.categories ?? []),
    }));

    const byHour: SeasonalityHour[] = Array.from({ length: HOUR_COUNT }, (_, i) => ({
        hour: i,
        total: state.hourAcc.get(i)?.total ?? 0,
        categories: Object.fromEntries(state.hourAcc.get(i)?.categories ?? []),
    }));

    const peakDayEntry = findPeakDay(byDayOfWeek);
    const peakHourEntry = findPeakHour(byHour);

    return {
        byDayOfWeek,
        byHour,
        peakDay: peakDayEntry.total > 0 ? peakDayEntry.dayOfWeek : 'N/A',
        peakHour: peakHourEntry.total > 0 ? peakHourEntry.hour : -1,
        totalRecords: classifications.length,
        period: { from: state.minDate, to: state.maxDate },
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
        const msg = String(err);
        rootLogger.error('Failed to generate seasonality dashboard: ' + msg + '. Verify buildCss dependency.');
        return buildErrorPage('Error generating dashboard', 'Error generating dashboard');
    }
}
