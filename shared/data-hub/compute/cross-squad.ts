/**
 * Compute: Cross-Squad Benchmark.
 *
 * Produces CrossSquadResult by delegating to the barrel's
 * computeCrossSquadBenchmark function. Currently returns empty result
 * as squad data is not yet available in the hub's RawData.
 *
 * @module cross-squad
 */

import type { RawData, ComputedMetrics } from '../../types/data-hub.js';
import type { CrossSquadResult } from '../../quality/cross-squad-benchmark.js';
import { computeCrossSquadBenchmark } from '../../quality/cross-squad-benchmark.js';

/**
 * Compute cross-squad benchmark from hub data.
 *
 * @param _raw - Raw CI/CD data from the hub (reserved for future use).
 * @param _computed - Pre-computed metrics from the hub (reserved for future use).
 * @returns CrossSquadResult with squad benchmarks (empty until squad data is available in hub).
 */
export function computeCrossSquad(_raw: RawData, _computed: ComputedMetrics): CrossSquadResult {
    // Squad data is not yet available in the hub's RawData.
    // Return empty result until squad data ingestion is implemented.
    return computeCrossSquadBenchmark(undefined);
}
