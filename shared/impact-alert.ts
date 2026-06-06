/**
 * Impact-Aware Pipeline Alert — correlates pipeline health with coverage gaps.
 *
 * Generates intelligent alerts when pipeline failures intersect with areas of
 * low test coverage, enabling teams to prioritize fixes by risk impact.
 *
 * @module impact-alert
 */

import { sanitizeHtml } from './escape.js';
import { buildHtmlPage, buildErrorPage } from './html-factory.js';
import { buildCss } from './report-styles.js';
import { MetricCard, MetricGrid, Card } from './primitives/index.js';
import { rootLogger } from './logger.js';

export type AlertSeverity = 'critical' | 'warning' | 'info';

export interface ImpactAlert {
    severity: AlertSeverity;
    title: string;
    message: string;
    affectedArea: string;
    recommendation: string;
}

export interface ImpactAlertResult {
    alerts: ImpactAlert[];
    criticalCount: number;
    warningCount: number;
    infoCount: number;
    timestamp: string;
}

const DEFAULT_RESULT: ImpactAlertResult = {
    alerts: [
        {
            severity: 'info',
            title: 'Insufficient data',
            message: 'Pipeline or coverage data is not available. Unable to generate impact-aware alerts.',
            affectedArea: 'General',
            recommendation: 'Ensure pipeline metrics and coverage data are being collected.',
        },
    ],
    criticalCount: 0,
    warningCount: 0,
    infoCount: 1,
    timestamp: new Date().toISOString(),
};

function deduplicateAlerts(alerts: ImpactAlert[]): ImpactAlert[] {
    const seen = new Set<string>();
    const result: ImpactAlert[] = [];
    for (const alert of alerts) {
        if (!seen.has(alert.title)) {
            seen.add(alert.title);
            result.push(alert);
        }
    }
    return result;
}

function countBySeverity(alerts: ImpactAlert[]): {
    criticalCount: number;
    warningCount: number;
    infoCount: number;
} {
    let criticalCount = 0;
    let warningCount = 0;
    let infoCount = 0;
    for (const a of alerts) {
        if (a.severity === 'critical') criticalCount++;
        else if (a.severity === 'warning') warningCount++;
        else infoCount++;
    }
    return { criticalCount, warningCount, infoCount };
}

export function analyzePipelineImpact(
    passRate: number | null | undefined,
    failingJobs: number,
    topFailures: string[],
    coveragePct: number | null | undefined,
    uncoveredEpics: string[],
): ImpactAlertResult {
    if (passRate == null || coveragePct == null) {
        return DEFAULT_RESULT;
    }

    const alerts: ImpactAlert[] = [];

    if (passRate < 70 && coveragePct < 70) {
        alerts.push({
            severity: 'critical',
            title: 'Low pass rate in low-coverage area',
            message:
                'Pipeline pass rate is below 70% and coverage is below 70%. Failures are occurring in areas with insufficient test coverage, increasing the risk of undetected regressions.',
            affectedArea: topFailures.length > 0 ? topFailures.slice(0, 3).join(', ') : 'Unknown',
            recommendation: 'Increase test coverage in affected areas and investigate pipeline failures immediately.',
        });
    }

    if (passRate < 70 && failingJobs > 0) {
        alerts.push({
            severity: 'warning',
            title: 'Elevated failure rate',
            message:
                'Pipeline pass rate is below 70% with ' +
                String(failingJobs) +
                ' failing job(s). Overall pipeline health is degraded.',
            affectedArea: topFailures.length > 0 ? topFailures.slice(0, 3).join(', ') : 'Pipeline',
            recommendation: 'Review failing jobs and stabilize the pipeline before merging new changes.',
        });
    }

    if (failingJobs > 0 && uncoveredEpics.length > 0) {
        alerts.push({
            severity: 'warning',
            title: 'Failures in uncovered epics',
            message:
                'There are ' +
                String(failingJobs) +
                ' failing job(s) and ' +
                String(uncoveredEpics.length) +
                ' epic(s) without test coverage. Failures may impact untested areas.',
            affectedArea: uncoveredEpics.join(', '),
            recommendation:
                'Add test coverage for uncovered epics and investigate pipeline failures for potential impact on these areas.',
        });
    }

    if (coveragePct < 70) {
        alerts.push({
            severity: 'warning',
            title: 'Coverage below threshold',
            message:
                'Current coverage is ' +
                String(Math.round(coveragePct)) +
                '%, below the 70% threshold. Areas without adequate testing are more susceptible to regressions.',
            affectedArea: uncoveredEpics.length > 0 ? uncoveredEpics.join(', ') : 'General',
            recommendation: 'Prioritize writing tests for uncovered areas to raise coverage above 70%.',
        });
    }

    if (passRate >= 80 && coveragePct >= 80) {
        alerts.push({
            severity: 'info',
            title: 'All clear',
            message:
                'Pipeline pass rate is ' +
                String(Math.round(passRate)) +
                '% and coverage is ' +
                String(Math.round(coveragePct)) +
                '%. No critical issues detected.',
            affectedArea: 'General',
            recommendation: 'Continue monitoring pipeline health and maintaining test coverage.',
        });
    }

    const uniqueAlerts = deduplicateAlerts(alerts);
    const counts = countBySeverity(uniqueAlerts);

    return {
        alerts: uniqueAlerts,
        criticalCount: counts.criticalCount,
        warningCount: counts.warningCount,
        infoCount: counts.infoCount,
        timestamp: new Date().toISOString(),
    };
}

const SEVERITY_MAP: Record<AlertSeverity, 'error' | 'warn' | 'info'> = {
    critical: 'error',
    warning: 'warn',
    info: 'info',
};

function renderAlertCard(alert: ImpactAlert): string {
    const cardSeverity = SEVERITY_MAP[alert.severity];
    return Card({
        severity: cardSeverity,
        children:
            '<div style="font-weight:600;margin-bottom:8px">' +
            sanitizeHtml(alert.title) +
            '</div>' +
            '<div style="margin-bottom:8px">' +
            sanitizeHtml(alert.message) +
            '</div>' +
            '<div style="font-size:0.85rem;color:var(--color-text-secondary);margin-bottom:4px">' +
            '<strong>Affected:</strong> ' +
            sanitizeHtml(alert.affectedArea) +
            '</div>' +
            '<div style="font-size:0.85rem;color:var(--color-text-secondary)">' +
            '<strong>Recommendation:</strong> ' +
            sanitizeHtml(alert.recommendation) +
            '</div>',
    });
}

export function generateImpactAlertHtml(result: ImpactAlertResult | null | undefined, title?: string): string {
    try {
        if (!result) {
            rootLogger.error('Impact alert result is null or undefined');
            return buildErrorPage('Error generating report', 'Impact Alert Report Error');
        }

        const pageTitle = title || 'Impact-Aware Pipeline Alert';

        const summaryCards = MetricGrid({
            children:
                MetricCard({ label: 'Total Alerts', value: String(result.alerts.length) }) +
                MetricCard({
                    label: 'Critical',
                    value: String(result.criticalCount),
                    severity: 'error',
                }) +
                MetricCard({
                    label: 'Warning',
                    value: String(result.warningCount),
                    severity: 'warn',
                }) +
                MetricCard({
                    label: 'Info',
                    value: String(result.infoCount),
                    severity: 'info',
                }),
        });

        let alertsHtml: string;
        if (result.alerts.length === 0) {
            alertsHtml = '<p style="color:var(--color-text-muted)">No alerts to display.</p>';
        } else {
            alertsHtml = result.alerts.map(renderAlertCard).join('');
        }

        const bodyContent = '<h1>' + sanitizeHtml(pageTitle) + '</h1>' + summaryCards + alertsHtml;

        return buildHtmlPage({
            title: pageTitle,
            styles: buildCss(),
            theme: 'system',
            bodyContent,
            footer: 'Generated by QA Tools — Impact-Aware Pipeline Alert',
        });
    } catch (err) {
        rootLogger.error('Failed to generate impact alert HTML: ' + (err as Error).message);
        return buildErrorPage('Error generating report', 'Impact Alert Report Error');
    }
}
