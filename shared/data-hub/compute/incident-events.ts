/**
 * Compute: Incident Events.
 *
 * Produces IncidentReport from hub data by delegating to the barrel's
 * buildIncidentReport function. Extracts failure rate, regression count,
 * seasonality peak, and pass rate from computed metrics.
 *
 * @module incident-events
 */

import type { RawData, ComputedMetrics } from '../../types/data-hub.js';
import type { IncidentReport } from '../../report/incident-report.js';
import { buildIncidentReport } from '../../report/incident-report.js';
import { rootLogger } from '../../logger.js';

/**
 * Compute incident events from hub data.
 *
 * @param _raw - Raw CI/CD data from the hub (reserved for future use).
 * @param computed - Pre-computed metrics from the hub.
 * @returns IncidentReport with events categorized by type and severity.
 */
export function computeIncidentEvents(_raw: RawData, computed: ComputedMetrics): IncidentReport {
    const passRate = Number.isFinite(computed.passRate) ? computed.passRate : undefined;
    const runFailureRate = Number.isFinite(computed.runFailureRate) ? computed.runFailureRate : 0;
    if (!Number.isFinite(computed.passRate)) {
        rootLogger.warn('incident-events: non-finite passRate treated as undefined', {
            operation: 'computeIncidentEvents',
            input: computed.passRate,
            remediation: 'Pass rate ignored; incident report will lack pass-rate-based classification.',
        });
    }
    if (!Number.isFinite(computed.runFailureRate)) {
        rootLogger.warn('incident-events: non-finite runFailureRate treated as 0', {
            operation: 'computeIncidentEvents',
            input: computed.runFailureRate,
            remediation: 'Failure rate replaced with 0 to prevent NaN propagation.',
        });
    }
    const regressionDetection = computed.regressionDetection;
    const regressionCount = regressionDetection?.regressions.length ?? 0;
    const seasonalityAggregation = computed.seasonalityAggregation;
    const seasonalityPeak = seasonalityAggregation?.peakDay ?? 'N/A';
    const uncoveredEpics: string[] = [];

    return buildIncidentReport(runFailureRate, regressionCount, seasonalityPeak, uncoveredEpics, passRate);
}
