/**
 * Impact-Aware Pipeline Alert — correlates pipeline health with coverage gaps.
 *
 * Compute layer: produces ImpactAlertResult from pipeline and coverage data.
 * Render layer: see impact-alert-renderer.ts.
 *
 * @module impact-alert
 */

import type { CoverageGapResult } from '../types/coverage.js';
import { MIN_PASS_RATE, MIN_COVERAGE, COVERAGE_TARGET, PASS_RATE_CRITICAL } from '../constants/thresholds.js';

export { generateImpactAlertHtml } from './impact-alert-renderer.js';

/**
 * Dimension 5 Provenance — documents the source and justification for alert thresholds.
 */
export const IMPACT_ALERT_PROVENANCE = {
    thresholds: {
        low: { value: PASS_RATE_CRITICAL, source: 'Critical pass rate threshold', standard: 'Internal' },
        high: { value: MIN_PASS_RATE, source: 'Quality gate target threshold', standard: 'Internal' },
    },
} as const;

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

const PASS_RATE_THRESHOLD_LOW = PASS_RATE_CRITICAL;
const COVERAGE_THRESHOLD_LOW = MIN_COVERAGE;
const PASS_RATE_THRESHOLD_HIGH = MIN_PASS_RATE;
const COVERAGE_THRESHOLD_HIGH = COVERAGE_TARGET;
const TOP_FAILURES_DISPLAY_LIMIT = 3;

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

function addLowPassRateLowCoverageAlert(
    passRate: number,
    coveragePct: number,
    topFailures: string[],
    alerts: ImpactAlert[],
): void {
    if (passRate >= PASS_RATE_THRESHOLD_LOW || coveragePct >= COVERAGE_THRESHOLD_LOW) return;
    alerts.push({
        severity: 'critical',
        title: 'Low pass rate in low-coverage area',
        message:
            'Pipeline pass rate is below 70% and coverage is below 70%. Failures are occurring in areas with insufficient test coverage, increasing the risk of undetected regressions.',
        affectedArea: topFailures.length > 0 ? topFailures.slice(0, TOP_FAILURES_DISPLAY_LIMIT).join(', ') : 'Unknown',
        recommendation: 'Increase test coverage in affected areas and investigate pipeline failures immediately.',
    });
}

function addLowPassRateFailingAlert(
    passRate: number,
    failingJobs: number,
    topFailures: string[],
    alerts: ImpactAlert[],
): void {
    if (passRate >= PASS_RATE_THRESHOLD_LOW || failingJobs === 0) return;
    alerts.push({
        severity: 'warning',
        title: 'Elevated failure rate',
        message:
            'Pipeline pass rate is below 70% with ' +
            String(failingJobs) +
            ' failing job(s). Overall pipeline health is degraded.',
        affectedArea: topFailures.length > 0 ? topFailures.slice(0, TOP_FAILURES_DISPLAY_LIMIT).join(', ') : 'Pipeline',
        recommendation: 'Review failing jobs and stabilize the pipeline before merging new changes.',
    });
}

function addFailingUncoveredAlert(failingJobs: number, uncoveredEpics: string[], alerts: ImpactAlert[]): void {
    if (failingJobs === 0 || uncoveredEpics.length === 0) return;
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

function addLowCoverageAlert(coveragePct: number, uncoveredEpics: string[], alerts: ImpactAlert[]): void {
    if (coveragePct >= COVERAGE_THRESHOLD_LOW) return;
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

function addAllClearAlert(passRate: number, coveragePct: number, alerts: ImpactAlert[]): void {
    if (passRate < PASS_RATE_THRESHOLD_HIGH || coveragePct < COVERAGE_THRESHOLD_HIGH) return;
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

export function analyzePipelineImpact(
    passRate: number | null | undefined,
    failingJobs: number,
    topFailures: string[],
    coveragePct: number | null | undefined,
    uncoveredEpics: string[],
    _coverageGapResult?: CoverageGapResult,
    dataHub?: import('../types/data-hub.js').DataHub,
): ImpactAlertResult {
    // Rule 24 — non-finite metrics are missing data, not "low". Never generate false critical alerts from NaN.
    if (passRate == null || coveragePct == null || !Number.isFinite(passRate) || !Number.isFinite(coveragePct)) {
        return DEFAULT_RESULT;
    }
    const safeFailingJobs = Number.isFinite(failingJobs) && failingJobs >= 0 ? failingJobs : 0;

    const alerts: ImpactAlert[] = [];

    addLowPassRateLowCoverageAlert(passRate, coveragePct, topFailures, alerts);
    addLowPassRateFailingAlert(passRate, safeFailingJobs, topFailures, alerts);
    addFailingUncoveredAlert(safeFailingJobs, uncoveredEpics, alerts);
    addLowCoverageAlert(coveragePct, uncoveredEpics, alerts);
    addAllClearAlert(passRate, coveragePct, alerts);

    const uniqueAlerts = deduplicateAlerts(alerts);
    const counts = countBySeverity(uniqueAlerts);

    return {
        alerts: uniqueAlerts,
        criticalCount: counts.criticalCount,
        warningCount: counts.warningCount,
        infoCount: counts.infoCount,
        timestamp: dataHub?.timestamp.toISOString() ?? new Date().toISOString(),
    };
}
