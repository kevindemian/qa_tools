/**
 * Defect Seasonality Dashboard — HTML rendering layer.
 *
 * Extracted from defect-seasonality.ts (compute) to separate concerns.
 * This module handles ONLY HTML generation; all business logic remains in defect-seasonality.ts.
 *
 * @module defect-seasonality-renderer
 */

import { rootLogger } from '../logger.js';
import { sanitizeHtml } from '../escape.js';
import { buildHtmlPage, buildErrorPage } from '../report/html-factory.js';
import { buildCss } from '../report/report-styles.js';
import { MetricCard, MetricGrid, DataTable, Section, EmptyState, RecommendedActions } from '../primitives/index.js';
import type { TableColumn, TableRow } from '../primitives/index.js';
import type { SeasonalityResult } from './defect-seasonality.js';

function getVsAvgLabel(total: number, avgTotal: number): string {
    if (total > avgTotal * 1.2) return '\u{1F534} Above';
    if (total < avgTotal * 0.8) return '\u{1F7E2} Below';
    return '\u{1F7E1} Normal';
}

function buildDayTable(days: SeasonalityResult['byDayOfWeek']): string {
    const allCategories = new Set<string>();
    for (const d of days) {
        for (const cat of Object.keys(d.categories)) {
            allCategories.add(cat);
        }
    }
    const cats = Array.from(allCategories).sort((a, b) => a.localeCompare(b));

    // Calculate average for comparison
    const avgTotal = days.reduce((sum, d) => sum + d.total, 0) / days.length;

    const columns: TableColumn[] = [
        { key: 'day', label: 'Day' },
        { key: 'total', label: 'Total', align: 'center' },
        { key: 'vs-avg', label: 'vs Avg', align: 'center' },
        ...cats.map((c) => ({ key: sanitizeHtml(c), label: sanitizeHtml(c), align: 'center' as const })),
    ];

    const rows: TableRow[] = days.map((d) => {
        const baseCells: [string, string][] = [
            ['day', d.dayOfWeek],
            ['total', String(d.total)],
            ['vs-avg', getVsAvgLabel(d.total, avgTotal)],
        ];
        const catEntries = Object.entries(d.categories);
        const catCells: [string, string][] = catEntries.map(([k, v]) => [sanitizeHtml(k), String(v)]);
        const cells: Record<string, string> = Object.fromEntries([...baseCells, ...catCells]);
        return { key: d.dayOfWeek, cells };
    });

    return Section({
        dataSection: 'day-breakdown',
        title: 'Day of Week Breakdown',
        children: DataTable({ columns, rows, compact: true, ariaLabel: 'Day of Week Breakdown' }),
    });
}

function buildHourTable(hours: SeasonalityResult['byHour']): string {
    const allCategories = new Set<string>();
    for (const h of hours) {
        for (const cat of Object.keys(h.categories)) {
            allCategories.add(cat);
        }
    }
    const cats = Array.from(allCategories).sort((a, b) => a.localeCompare(b));

    // Calculate average for comparison
    const avgTotal = hours.reduce((sum, h) => sum + h.total, 0) / hours.length;

    const columns: TableColumn[] = [
        { key: 'hour', label: 'Hour', align: 'center' },
        { key: 'total', label: 'Total', align: 'center' },
        { key: 'vs-avg', label: 'vs Avg', align: 'center' },
        ...cats.map((c) => ({ key: sanitizeHtml(c), label: sanitizeHtml(c), align: 'center' as const })),
    ];

    const rows: TableRow[] = hours.map((h) => {
        const baseCells: [string, string][] = [
            ['hour', `${h.hour}:00`],
            ['total', String(h.total)],
            ['vs-avg', getVsAvgLabel(h.total, avgTotal)],
        ];
        const catEntries = Object.entries(h.categories);
        const catCells: [string, string][] = catEntries.map(([k, v]) => [sanitizeHtml(k), String(v)]);
        const cells: Record<string, string> = Object.fromEntries([...baseCells, ...catCells]);
        return { key: String(h.hour), cells };
    });

    return Section({
        dataSection: 'hour-breakdown',
        title: 'Hour Breakdown',
        children: DataTable({ columns, rows, compact: true, ariaLabel: 'Hour Breakdown' }),
    });
}

function buildRecommendedActions(result: SeasonalityResult): string {
    const actions: Array<{ severity: 'error' | 'warn' | 'info'; text: string }> = [];

    // Action 1: Peak activity
    if (result.peakDay !== 'N/A' && result.peakHour >= 0) {
        actions.push({
            severity: 'info',
            text: `Peak defect activity occurs on ${sanitizeHtml(result.peakDay)} at ${result.peakHour}:00. Consider scheduling preventive measures before this window.`,
        });
    }

    // Action 2: High concentration days
    const avgPerDay = result.totalRecords / 7;
    const highDays = result.byDayOfWeek.filter((d) => d.total > avgPerDay * 1.5);
    if (highDays.length > 0) {
        actions.push({
            severity: 'warn',
            text: `Defect concentration detected on: ${highDays.map((d) => sanitizeHtml(d.dayOfWeek)).join(', ')}. Investigate workflow patterns on these days.`,
        });
    }

    // Action 3: High concentration hours
    const avgPerHour = result.totalRecords / 24;
    const highHours = result.byHour.filter((h) => h.total > avgPerHour * 2);
    if (highHours.length > 0) {
        const hourRanges = highHours.map((h) => `${h.hour}:00-${h.hour + 1}:00`).join(', ');
        actions.push({
            severity: 'warn',
            text: `Defect concentration detected during hours: ${hourRanges}. Consider scheduling code reviews or deploys outside these windows.`,
        });
    }

    // Default action if no issues found
    if (actions.length === 0) {
        actions.push({
            severity: 'info',
            text: 'Defect seasonality patterns are within normal ranges. Continue monitoring.',
        });
    }

    return Section({
        dataSection: 'actions',
        title: 'Recommended Actions',
        children: RecommendedActions({ actions }),
    });
}

export function generateSeasonalityHtml(result: SeasonalityResult, title?: string): string {
    try {
        const pageTitle = title || 'Defect Seasonality Dashboard';

        if (result.totalRecords === 0) {
            return buildHtmlPage({
                title: pageTitle,
                styles: buildCss(),
                theme: 'system',
                bodyContent:
                    `<div data-dashboard="defect-seasonality">` +
                    EmptyState({
                        title: 'No defect data available.',
                        description: 'No defect classification data is available for seasonality analysis.',
                        action: 'Run defect classification pipeline to generate data.',
                        icon: '\u{1F4C5}',
                    }) +
                    `</div>`,
                footer: 'Generated by QA Tools — Defect Seasonality Dashboard',
            });
        }

        const peakHourLabel = result.peakHour >= 0 ? `${result.peakHour}:00` : 'N/A';
        const avgPerDay = Math.round(result.totalRecords / 7);

        const bodyContent =
            `<div data-dashboard="defect-seasonality">` +
            `<h1>${sanitizeHtml(pageTitle)}</h1>` +
            Section({
                dataSection: 'summary',
                title: 'Summary',
                children: MetricGrid({
                    children:
                        MetricCard({ label: 'Total Records', value: String(result.totalRecords) }) +
                        MetricCard({ label: 'Peak Day', value: result.peakDay }) +
                        MetricCard({ label: 'Peak Hour', value: peakHourLabel }) +
                        MetricCard({ label: 'Avg Defects/Day', value: String(avgPerDay) }),
                }),
            }) +
            buildDayTable(result.byDayOfWeek) +
            buildHourTable(result.byHour) +
            buildRecommendedActions(result) +
            `</div>`;

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
