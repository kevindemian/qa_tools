/**
 * Pipeline Cost Analytics — calculates cost of pipeline runs based on duration.
 *
 * @module pipeline-cost
 */

import type { DataHub } from '../types/data-hub.js';
import type { PipelineCostResult } from '../types/data-hub.js';
import { computePipelineCostResult } from '../data-hub/compute/pipeline-cost.js';

export { generatePipelineCostHtml } from './pipeline-cost-renderer.js';
export type { PipelineCostResult, PipelineCostEntry } from '../types/data-hub.js';

export const DEFAULT_COST_PER_MINUTE = 0.01;

export function calculatePipelineCost(costPerMinute: number | undefined, dataHub: DataHub): PipelineCostResult {
    const envCpm = Number(process.env['QA_COST_PER_COMPUTE_MINUTE']);
    const rawCpm = costPerMinute ?? (Number.isFinite(envCpm) && envCpm >= 0 ? envCpm : DEFAULT_COST_PER_MINUTE);
    // Rule 24 — cost rate must be a finite, non-negative number; negative/NaN rates are rejected (never produce negative/NaN costs).
    const cpm = Number.isFinite(rawCpm) && rawCpm >= 0 ? rawCpm : DEFAULT_COST_PER_MINUTE;

    // SSOT: projection over hub.computed.perRunCosts + runs lives in the hub compute
    // layer (data-hub/compute/pipeline-cost.ts). This barrel only resolves the cpm at
    // the call site and delegates — single implementation (§6), renderers never compute.
    const runs = dataHub.getRuns();
    const perRunCosts = dataHub.computed.perRunCosts ?? [];
    const result = computePipelineCostResult(runs, perRunCosts, cpm);
    return { ...result, costPerMinute: cpm, timestamp: dataHub.timestamp.toISOString() };
}
