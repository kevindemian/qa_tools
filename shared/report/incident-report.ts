/**
 * Incident Investigation Report — combines failure, regression, coverage gap,
 * and seasonality signals into a unified incident timeline.
 *
 * Compute layer: produces IncidentReport from input signals.
 * Render layer: see incident-report-renderer.ts.
 *
 * @module incident-report
 */

import { rootLogger } from '../logger.js';
import type { CoverageGapResult } from '../types/coverage.js';

export { generateIncidentReportHtml } from './incident-report-renderer.js';

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

function getEpicsFromInputs(uncoveredEpics: string[], coverageGap?: CoverageGapResult): string[] {
    if (uncoveredEpics.length > 0) return uncoveredEpics;
    if (!coverageGap) return [];
    const byEpicMap = new Map(Object.entries(coverageGap.byEpic));
    return Object.keys(coverageGap.byEpic).filter((epic) => {
        const epicData = byEpicMap.get(epic);
        return epicData != null && !epicData.gatePass;
    });
}

function formatTimestamp(ts: Date | string | undefined): string {
    if (ts instanceof Date) return ts.toISOString();
    if (ts) return new Date(ts).toISOString();
    return new Date().toISOString();
}

export function buildIncidentReport(
    failRate: number | null | undefined,
    regressionCount: number,
    seasonalityPeak: string,
    uncoveredEpics: string[],
    passRate: number | null | undefined,
    coverageGap?: CoverageGapResult,
    dataHub?: import('../types/data-hub.js').DataHub,
): IncidentReport {
    const timestamp = formatTimestamp(dataHub?.timestamp);

    const epics = getEpicsFromInputs(uncoveredEpics, coverageGap);

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

    for (const epic of epics) {
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
