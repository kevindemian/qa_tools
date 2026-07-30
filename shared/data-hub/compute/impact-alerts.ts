/**
 * Compute: Impact Alerts.
 *
 * Produces ImpactAlertResult from hub data by delegating to the barrel's
 * analyzePipelineImpact function. This module extracts the required data
 * from RawData + ComputedMetrics and passes it through.
 *
 * @module impact-alerts
 */

import type { RawData, ComputedMetrics } from '../../types/data-hub.js';
import type { ImpactAlertResult } from '../../report/impact-alert.js';
import { analyzePipelineImpact } from '../../report/impact-alert.js';
import { rootLogger } from '../../logger.js';

/**
 * Compute impact alerts from hub data.
 *
 * @param _raw - Raw CI/CD data from the hub (reserved for future use).
 * @param computed - Pre-computed metrics from the hub.
 * @returns ImpactAlertResult with alerts grouped by severity.
 */
export function computeImpactAlerts(_raw: RawData, computed: ComputedMetrics): ImpactAlertResult {
    const passRate = Number.isFinite(computed.passRate) ? computed.passRate : undefined;
    const coveragePct = Number.isFinite(computed.coverage) ? computed.coverage : undefined;
    if (!Number.isFinite(computed.passRate)) {
        rootLogger.warn('impact-alerts: non-finite passRate treated as undefined', {
            operation: 'computeImpactAlerts',
            input: computed.passRate,
            remediation: 'Pass rate ignored; alerts will lack pass-rate-based triggers.',
        });
    }
    if (!Number.isFinite(computed.coverage)) {
        rootLogger.warn('impact-alerts: non-finite coverage treated as undefined', {
            operation: 'computeImpactAlerts',
            input: computed.coverage,
            remediation: 'Coverage ignored; alerts will lack coverage-based triggers.',
        });
    }
    const topFailingJobs = computed.topFailingJobs;
    const failingJobs = topFailingJobs.length;
    const topFailures = topFailingJobs.map((j) => j.name);

    const uncoveredEpics: string[] = [];

    return analyzePipelineImpact(passRate, failingJobs, topFailures, coveragePct, uncoveredEpics);
}
