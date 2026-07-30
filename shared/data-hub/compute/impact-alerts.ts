import type { RawData, ComputedMetrics } from '../../types/data-hub.js';
import type { ImpactAlertResult } from '../../primitives/impact-analysis.js';
import { analyzePipelineImpact } from '../../primitives/impact-analysis.js';
import { rootLogger } from '../../logger.js';

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
