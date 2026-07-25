/**
 * Pipeline Cost Analytics — calculates cost of pipeline runs based on duration.
 *
 * @module pipeline-cost
 */

import type { DataHub } from '../types/data-hub.js';

export { generatePipelineCostHtml } from './pipeline-cost-renderer.js';

export const DEFAULT_COST_PER_MINUTE = 0.01;

export interface PipelineCostEntry {
    timestamp: string;
    durationSec: number;
    cost: number;
    status: string;
}

export interface PipelineCostResult {
    totalCost: number;
    avgCostPerRun: number;
    totalDurationSec: number;
    costPerMinute: number;
    costByRun: PipelineCostEntry[];
    runCount: number;
    period: { from: string; to: string };
    timestamp: string;
}

/** Mapeia conclusion do CI para status legível. */
function mapConclusionToStatus(conclusion: string | undefined): 'passed' | 'failed' | 'unknown' {
    if (conclusion === 'success') return 'passed';
    if (conclusion === 'failure') return 'failed';
    return 'unknown';
}

export function calculatePipelineCost(costPerMinute: number | undefined, dataHub: DataHub): PipelineCostResult {
    const envCpm = Number(process.env['QA_COST_PER_COMPUTE_MINUTE']);
    const rawCpm = costPerMinute ?? (Number.isFinite(envCpm) && envCpm >= 0 ? envCpm : DEFAULT_COST_PER_MINUTE);
    // Rule 24 — cost rate must be a finite, non-negative number; negative/NaN rates are rejected (never produce negative/NaN costs).
    const cpm = Number.isFinite(rawCpm) && rawCpm >= 0 ? rawCpm : DEFAULT_COST_PER_MINUTE;

    // SSOT: custo de pipeline vem exclusivamente do DataHub (Camadas 1–6 do CI).
    const ciRuns = dataHub.getRuns();
    const costByRun: PipelineCostEntry[] = ciRuns.map((r) => {
        const durationSec =
            r.run_started_at && r.updated_at
                ? (new Date(r.updated_at).getTime() - new Date(r.run_started_at).getTime()) / 1000
                : 0;
        const safeDuration = Number.isFinite(durationSec) && durationSec >= 0 ? durationSec : 0;
        return {
            timestamp: r.created_at ?? new Date().toISOString(),
            durationSec: safeDuration,
            cost: (safeDuration / 60) * cpm,
            status: mapConclusionToStatus(r.conclusion),
        };
    });

    costByRun.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

    const totalDurationSec = costByRun.reduce((s, e) => s + e.durationSec, 0);
    const totalCost = costByRun.reduce((s, e) => s + e.cost, 0);
    const sortedTimestamps = ciRuns
        .map((r) => r.created_at ?? '')
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b));

    return {
        totalCost,
        avgCostPerRun: costByRun.length > 0 ? totalCost / costByRun.length : 0,
        totalDurationSec,
        costPerMinute: cpm,
        costByRun,
        runCount: ciRuns.length,
        period: {
            from: sortedTimestamps[0] ?? '',
            to: sortedTimestamps[sortedTimestamps.length - 1] ?? '',
        },
        timestamp: dataHub.timestamp.toISOString(),
    };
}
