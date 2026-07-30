import type { RawData, ComputedMetrics } from '../../types/data-hub.js';
import type { TraceabilityResult } from '../../types/data-hub.js';
import { buildTraceabilityMatrix } from '../../primitives/traceability.js';
import { rootLogger } from '../../logger.js';

export function computeTraceabilityTree(_raw: RawData, computed: ComputedMetrics): TraceabilityResult {
    const metricsRuns = computed.metricsRuns ?? [];
    const flakyRate = computed.flakyRate;
    try {
        return buildTraceabilityMatrix(metricsRuns, computed.coverageGap, flakyRate, _raw.provenance);
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        rootLogger.error('computeTraceabilityTree failed', {
            operation: 'computeTraceabilityTree',
            cause: msg,
            metricsRunCount: metricsRuns.length,
            hasFlakyRate: flakyRate.length > 0,
            remediation: 'Verify that metrics run data and computed flaky rate are valid.',
        });
        return {
            nodes: [],
            totalEpics: 0,
            totalTests: 0,
            overallCoverage: 0,
            timestamp: new Date().toISOString(),
            awareness: { categories: [], minConfidence: null },
        };
    }
}
