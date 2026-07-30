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

    // SSOT: consume computed.perRunCosts from DataHub when available.
    // Duration (minutes) comes from the hub's compute layer; cost is recalculated
    // with the barrel's cpm to keep the rate configurable at call site.
    // Status still requires getRuns() because PerRunCost lacks a status field.
    const ssotCosts = dataHub.computed.perRunCosts;

    if (ssotCosts && ssotCosts.length > 0) {
        const ciRuns = dataHub.getRuns();
        const statusMap = new Map<number, string>();
        for (const r of ciRuns) {
            const runId = typeof r.id === 'number' ? r.id : 0;
            statusMap.set(runId, mapConclusionToStatus(r.conclusion));
        }

        const costByRun: PipelineCostEntry[] = ssotCosts.map((c) => ({
            timestamp: c.timestamp,
            durationSec: c.minutes * 60,
            cost: Math.round(c.minutes * cpm * 100) / 100,
            status: statusMap.get(c.runId) ?? 'unknown',
        }));

        costByRun.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

        const totalDurationSec = costByRun.reduce((s, e) => s + e.durationSec, 0);
        const totalCost = costByRun.reduce((s, e) => s + e.cost, 0);
        const sortedTimestamps = ssotCosts
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
            timestamp: dataHub.timestamp.toISOString(),
        };
    }

    // Fallback: perRunCosts not available — return empty result instead of computing locally.
    // DataHub always computes perRunCosts when runs exist, so this branch only triggers on empty data.
    return {
        totalCost: 0,
        avgCostPerRun: 0,
        totalDurationSec: 0,
        costPerMinute: cpm,
        costByRun: [],
        runCount: 0,
        period: { from: '', to: '' },
        timestamp: dataHub.timestamp.toISOString(),
    };
}
