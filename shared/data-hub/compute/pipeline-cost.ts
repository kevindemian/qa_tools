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
import type { CostEstimate, PipelineCostResult, PipelineCostEntry } from '../../types/data-hub.js';
import { rootLogger } from '../../logger.js';

/** Default cost per compute minute in USD. */
const DEFAULT_COST_PER_MINUTE = 0.01;

/** Mapeia conclusion do CI para status legível. */
function mapConclusionToStatus(conclusion: string | undefined): 'passed' | 'failed' | 'unknown' {
    if (conclusion === 'success') return 'passed';
    if (conclusion === 'failure') return 'failed';
    return 'unknown';
}

/**
 * SSOT projection: per-run cost breakdown (PipelineCostResult) from PerRunCost[] + run status.
 * Pure function over hub raw data — renderers/reporters never compute this locally (hub-first).
 *
 * @param runs - Pipeline runs (for run->status mapping).
 * @param perRunCosts - PerRunCost[] computed by the hub (minutes/cost per run).
 * @param costPerMinute - Cost per compute minute (default: 0.01).
 */
export function computePipelineCostResult(
    runs: PipelineRun[],
    perRunCosts: import('../../types/data-hub.js').PerRunCost[],
    costPerMinute?: number,
): PipelineCostResult {
    const cpm =
        costPerMinute !== undefined && Number.isFinite(costPerMinute) && costPerMinute >= 0
            ? costPerMinute
            : DEFAULT_COST_PER_MINUTE;

    if (perRunCosts.length === 0) {
        return {
            totalCost: 0,
            avgCostPerRun: 0,
            totalDurationSec: 0,
            costPerMinute: cpm,
            costByRun: [],
            runCount: 0,
            period: { from: '', to: '' },
            timestamp: new Date().toISOString(),
        };
    }

    const statusMap = new Map<number, string>();
    for (const r of runs) {
        const runId = typeof r.id === 'number' ? r.id : 0;
        statusMap.set(runId, mapConclusionToStatus(r.conclusion));
    }

    const costByRun: PipelineCostEntry[] = perRunCosts.map((c) => ({
        timestamp: c.timestamp,
        durationSec: c.minutes * 60,
        cost: Math.round(c.minutes * cpm * 100) / 100,
        status: statusMap.get(c.runId) ?? 'unknown',
    }));

    costByRun.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

    const totalDurationSec = costByRun.reduce((s, e) => s + e.durationSec, 0);
    const totalCost = costByRun.reduce((s, e) => s + e.cost, 0);
    const sortedTimestamps = perRunCosts
        .map((c) => c.timestamp)
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b));

    return {
        totalCost,
        avgCostPerRun: costByRun.length > 0 ? totalCost / costByRun.length : 0,
        totalDurationSec,
        costPerMinute: cpm,
        costByRun,
        runCount: costByRun.length,
        period: {
            from: sortedTimestamps[0] ?? '',
            to: sortedTimestamps[sortedTimestamps.length - 1] ?? '',
        },
        timestamp: new Date().toISOString(),
    };
}

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
    const cpm =
        costPerMinute !== undefined && Number.isFinite(costPerMinute) && costPerMinute > 0
            ? costPerMinute
            : DEFAULT_COST_PER_MINUTE;
    if (costPerMinute !== undefined && !Number.isFinite(costPerMinute)) {
        rootLogger.warn('pipeline-cost: non-finite costPerMinute, using default', {
            operation: 'calcPipelineCost',
            input: costPerMinute,
            fallback: DEFAULT_COST_PER_MINUTE,
            remediation: 'Cost per minute must be a finite positive number.',
        });
    }

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
