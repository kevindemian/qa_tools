/**
 * Compute: Traceability Tree.
 *
 * Produces TraceabilityResult from hub data by delegating to the barrel's
 * buildTraceabilityMatrix function. Extracts metricsRuns and flakyRate
 * from computed metrics.
 *
 * @module traceability-tree
 */

import type { RawData, ComputedMetrics } from '../../types/data-hub.js';
import type { TraceabilityResult } from '../../report/traceability-matrix.js';
import { buildTraceabilityMatrix } from '../../report/traceability-matrix.js';

/**
 * Compute traceability tree from hub data.
 *
 * @param _raw - Raw CI/CD data from the hub (reserved for future use).
 * @param computed - Pre-computed metrics from the hub.
 * @returns TraceabilityResult with epic > story > test tree structure.
 */
export function computeTraceabilityTree(_raw: RawData, computed: ComputedMetrics): TraceabilityResult {
    const metricsRuns = computed.metricsRuns ?? [];
    // buildTraceabilityMatrix needs a DataHub-like object for flakyRate and timestamp.
    const hubLike = {
        computed: { flakyRate: computed.flakyRate },
        timestamp: new Date(),
    } as Parameters<typeof buildTraceabilityMatrix>[2];
    return buildTraceabilityMatrix(metricsRuns, undefined, hubLike);
}
