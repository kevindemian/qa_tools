/**
 * Incident Investigation Report — combines failure, regression, coverage gap,
 * and seasonality signals into a unified incident timeline.
 *
 * Uses primitives and design tokens for consistent HTML report output.
 *
 * @module incident-report
 */

import { rootLogger } from './logger.js';
import { sanitizeHtml } from './escape.js';
import { buildHtmlPage, buildErrorPage } from './html-factory.js';
import { buildCss } from './report-styles.js';
import { MetricCard, MetricGrid, Card } from './primitives/index.js';

export interface IncidentEvent {
    date: string;
    type: 'failure' | 'regression' | 'coverage_gap' | 'seasonality';
    title: string;
    description: string;
    severity: 'high' | 'medium' | 'low';
}

export interface IncidentReport {
    events: IncidentEvent[];
    eventCount: number;
    highCount: number;
    mediumCount: number;
    lowCount: number;
    summary: string;
    overallSeverity: 'high' | 'medium' | 'low' | 'none';
    timestamp: string;
}

const SEVERITY_ORDER: Record<string, number> = {
    high: 0,
    medium: 1,
    low: 2,
};

const TYPE_ORDER: Record<string, number> = {
    failure: 0,
    regression: 1,
    coverage_gap: 2,
    seasonality: 3,
};

const FAIL_RATE_THRESHOLD = 30;
const REGRESSION_COUNT_THRESHOLD = 2;

function severityToCardSeverity(s: string): 'error' | 'warn' | 'info' | 'default' {
    if (s === 'high') return 'error';
    if (s === 'medium') return 'warn';
    if (s === 'low') return 'info';
    return 'default';
}

export function buildIncidentReport(
    failRate: number | null | undefined,
    regressionCount: number,
    seasonalityPeak: string,
    uncoveredEpics: string[],
    passRate: number | null | undefined,
): IncidentReport {
    const timestamp = new Date().toISOString();

    if (failRate == null || passRate == null) {
        rootLogger.warn(
            'Insufficient data for incident report: failRate or passRate is null/undefined. Ensure both failRate and passRate are provided as numbers.',
        );
        return {
            events: [],
            eventCount: 0,
            highCount: 0,
            mediumCount: 0,
            lowCount: 0,
            summary: 'Insufficient data to generate incident report.',
            overallSeverity: 'none',
            timestamp,
        };
    }

    const events: IncidentEvent[] = [];

    if (failRate > FAIL_RATE_THRESHOLD) {
        events.push({
            date: timestamp,
            type: 'failure',
            title: 'High failure rate detected',
            description: `Failure rate is ${failRate.toFixed(1)}%, exceeding the ${FAIL_RATE_THRESHOLD}% threshold.`,
            severity: 'high',
        });
    }

    if (regressionCount > REGRESSION_COUNT_THRESHOLD) {
        events.push({
            date: timestamp,
            type: 'regression',
            title: 'Multiple regressions detected',
            description: `${regressionCount} regressions found, exceeding the threshold of ${REGRESSION_COUNT_THRESHOLD}.`,
            severity: 'high',
        });
    }

    for (const epic of uncoveredEpics) {
        events.push({
            date: timestamp,
            type: 'coverage_gap',
            title: 'Coverage gap detected',
            description: `Epic "${epic}" has uncovered tests.`,
            severity: 'medium',
        });
    }

    if (seasonalityPeak !== 'N/A') {
        events.push({
            date: timestamp,
            type: 'seasonality',
            title: 'Seasonality peak detected',
            description: `Seasonality peak identified: ${seasonalityPeak}.`,
            severity: 'low',
        });
    }

    if (events.length === 0) {
        return {
            events: [],
            eventCount: 0,
            highCount: 0,
            mediumCount: 0,
            lowCount: 0,
            summary: 'No incidents detected.',
            overallSeverity: 'none',
            timestamp,
        };
    }

    events.sort((a, b) => {
        const sevDiff = (SEVERITY_ORDER[a.severity] ?? 99) - (SEVERITY_ORDER[b.severity] ?? 99);
        if (sevDiff !== 0) return sevDiff;
        return (TYPE_ORDER[a.type] ?? 99) - (TYPE_ORDER[b.type] ?? 99);
    });

    const highCount = events.filter((e) => e.severity === 'high').length;
    const mediumCount = events.filter((e) => e.severity === 'medium').length;
    const lowCount = events.filter((e) => e.severity === 'low').length;

    let overallSeverity: 'high' | 'medium' | 'low' | 'none';
    if (highCount > 0) {
        overallSeverity = 'high';
    } else if (mediumCount > 0) {
        overallSeverity = 'medium';
    } else if (lowCount > 0) {
        overallSeverity = 'low';
    } else {
        overallSeverity = 'none';
    }

    const summaryParts: string[] = [];
    if (highCount > 0) summaryParts.push(`${highCount} high severity`);
    if (mediumCount > 0) summaryParts.push(`${mediumCount} medium severity`);
    if (lowCount > 0) summaryParts.push(`${lowCount} low severity`);
    const summary = `${events.length} incident(s) detected: ${summaryParts.join(', ')}.`;

    return {
        events,
        eventCount: events.length,
        highCount,
        mediumCount,
        lowCount,
        summary,
        overallSeverity,
        timestamp,
    };
}

export function generateIncidentReportHtml(report: IncidentReport | null | undefined, title?: string): string {
    try {
        if (!report) {
            rootLogger.error(
                'Incident report is null or undefined. Ensure a valid IncidentReport object is passed to generateIncidentReportHtml.',
            );
            return buildErrorPage('Error generating report', 'Error generating incident investigation report');
        }

        const pageTitle = title || 'Incident Investigation Report';

        const severityColors: Record<string, string> = {
            high: 'var(--color-error)',
            medium: 'var(--color-warn)',
            low: 'var(--color-info)',
            none: 'var(--color-text-muted)',
        };

        const baseColor = severityColors[report.overallSeverity] || 'var(--color-text-muted)';

        const severityBadge =
            `<div style="text-align:center;margin-bottom:24px">` +
            `<span style="display:inline-block;padding:8px 16px;border-radius:9999px;` +
            `font-size:14px;font-weight:700;` +
            `background:${baseColor}20;` +
            `color:${baseColor};` +
            `border:1px solid ${baseColor}">` +
            `Overall Severity: ${report.overallSeverity.toUpperCase()}</span></div>`;

        const summaryCards = MetricGrid({
            children:
                MetricCard({ label: 'Total Events', value: String(report.eventCount) }) +
                MetricCard({
                    label: 'High',
                    value: String(report.highCount),
                    severity: report.highCount > 0 ? 'error' : 'default',
                }) +
                MetricCard({
                    label: 'Medium',
                    value: String(report.mediumCount),
                    severity: report.mediumCount > 0 ? 'warn' : 'default',
                }) +
                MetricCard({
                    label: 'Low',
                    value: String(report.lowCount),
                    severity: report.lowCount > 0 ? 'info' : 'default',
                }),
        });

        const summaryHtml = `<p style="margin-bottom:24px;color:var(--color-text-secondary)">${sanitizeHtml(report.summary)}</p>`;

        let eventsHtml = '';
        if (report.events.length === 0) {
            eventsHtml = '<p style="color:var(--color-text-muted)">No incidents to display.</p>';
        } else {
            for (const event of report.events) {
                const cardSeverity = severityToCardSeverity(event.severity);
                eventsHtml += Card({
                    severity: cardSeverity,
                    children:
                        `<div style="margin-bottom:8px">` +
                        `<span style="font-size:12px;color:var(--color-text-muted)">${sanitizeHtml(event.date)}</span>` +
                        `</div>` +
                        `<div style="font-weight:700;margin-bottom:4px">${sanitizeHtml(event.title)}</div>` +
                        `<div style="font-size:14px;color:var(--color-text-secondary)">${sanitizeHtml(event.description)}</div>`,
                });
            }
        }

        const bodyContent =
            `<h1>${sanitizeHtml(pageTitle)}</h1>` + severityBadge + summaryCards + summaryHtml + eventsHtml;

        return buildHtmlPage({
            title: pageTitle,
            styles: buildCss(),
            theme: 'system',
            bodyContent,
            footer: 'Generated by QA Tools — Incident Investigation Report',
        });
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        rootLogger.error(
            'Failed to generate incident report HTML: ' +
                msg +
                '. Verify that input data (failRate, passRate, regressionCount) is valid and the html-factory module is working correctly.',
        );
        return buildErrorPage('Error generating report', 'Error generating incident investigation report');
    }
}
