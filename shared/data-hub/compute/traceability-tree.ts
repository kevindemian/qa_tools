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
import { makeDataHubMock } from '../../test-utils/factories/data-hub-mock.js';

/**
 * Compute traceability tree from hub data.
 *
 * @param _raw - Raw CI/CD data from the hub (reserved for future use).
 * @param computed - Pre-computed metrics from the hub.
 * @returns TraceabilityResult with epic > story > test tree structure.
 */
export function computeTraceabilityTree(_raw: RawData, computed: ComputedMetrics): TraceabilityResult {
    const metricsRuns = computed.metricsRuns ?? [];
    const hubLike = makeDataHubMock({
        raw: _raw,
        computed: {
            flakyRate: computed.flakyRate,
            metricsRuns,
        },
    });
    return buildTraceabilityMatrix(metricsRuns, undefined, hubLike);
}
