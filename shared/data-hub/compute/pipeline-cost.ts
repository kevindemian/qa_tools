/**
 * Data Hub — Pipeline Cost (Compute Puro).
 *
 * Calculates CI pipeline cost based on run duration.
 * Pure function with no side effects.
 *
 * References:
 * - Default cost: $0.01/min (GitHub Actions pricing)
 * - Duration calculated from run_started_at → updated_at
 */
import type { PipelineRun } from '../../types/ci-cd.js';
import type { CostEstimate } from '../../types/data-hub.js';

/** Default cost per compute minute in USD. */
const DEFAULT_COST_PER_MINUTE = 0.01;

/**
 * Calculates pipeline cost from run durations.
 *
 * @param runs - Pipeline runs to calculate cost for
 * @param costPerMinute - Cost per compute minute in USD (default: 0.01)
 * @returns CostEstimate with total minutes and estimated cost
 *
 * @example
 * ```ts
 * const cost = calcPipelineCost(runs);
 * // { totalMinutes: 45.5, estimatedCost: 0.455 }
 * ```
 */
export function calcPipelineCost(runs: PipelineRun[], costPerMinute?: number): CostEstimate {
    const cpm = costPerMinute ?? DEFAULT_COST_PER_MINUTE;

    if (runs.length === 0) {
        return { totalMinutes: 0, estimatedCost: 0 };
    }

    let totalSeconds = 0;

    for (const run of runs) {
        const duration = getRunDurationSec(run);
        totalSeconds += duration;
    }

    const totalMinutes = totalSeconds / 60;
    const estimatedCost = totalMinutes * cpm;

    return {
        totalMinutes: roundToDecimals(totalMinutes, 2),
        estimatedCost: roundToDecimals(estimatedCost, 4),
    };
}

/**
 * Extracts duration in seconds from a pipeline run.
 * Uses run_started_at → updated_at if available, otherwise returns 0.
 */
function getRunDurationSec(run: PipelineRun): number {
    if (run.run_started_at && run.updated_at) {
        const start = new Date(run.run_started_at).getTime();
        const end = new Date(run.updated_at).getTime();
        if (!isNaN(start) && !isNaN(end) && end > start) {
            return (end - start) / 1000;
        }
    }
    return 0;
}

/**
 * Rounds a number to specified decimal places.
 */
function roundToDecimals(value: number, decimals: number): number {
    const factor = 10 ** decimals;
    return Math.round(value * factor) / factor;
}
