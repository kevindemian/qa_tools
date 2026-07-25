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

/**
 * Compute impact alerts from hub data.
 *
 * @param _raw - Raw CI/CD data from the hub (reserved for future use).
 * @param computed - Pre-computed metrics from the hub.
 * @returns ImpactAlertResult with alerts grouped by severity.
 */
export function computeImpactAlerts(_raw: RawData, computed: ComputedMetrics): ImpactAlertResult {
    const passRate = computed.passRate;
    const coveragePct = computed.coverage;
    const topFailingJobs = computed.topFailingJobs;
    const failingJobs = topFailingJobs.length;
    const topFailures = topFailingJobs.map((j) => j.name);

    const uncoveredEpics: string[] = [];

    return analyzePipelineImpact(passRate, failingJobs, topFailures, coveragePct, uncoveredEpics);
}
