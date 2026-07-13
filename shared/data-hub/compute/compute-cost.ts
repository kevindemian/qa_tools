/**
 * Compute: real compute cost (LA-2).
 *
 * Aggregates actual CI compute from workflow-run timing + GitHub billable usage.
 * This is REAL cost data from the provider API — never estimated, never dropped.
 *
 * @reference FinOps — billable minutes are the authoritative CI cost signal.
 */
import type { PipelineRun } from '../../types/ci-cd.js';
import type { WorkflowRunTiming, ComputeCostResult } from '../../types/data-hub.js';

function runIdAsNumber(run: PipelineRun): number {
    if (run.id == null) return NaN;
    return typeof run.id === 'string' ? Number(run.id) : run.id;
}

/**
 * Aggregate real CI compute cost from runs + timing (which now carries billable).
 *
 * Safeguards (AGENTS §24/§25):
 * - Non-array runs → empty result (no silent passthrough).
 * - Non-finite / negative durations and billable are rejected (never counted).
 * - Null runs and unmatched run ids are skipped.
 */
function accumulateTiming(result: ComputeCostResult, t: WorkflowRunTiming): void {
    if (Number.isFinite(t.run_duration_ms) && t.run_duration_ms >= 0) {
        result.runCount += 1;
        result.totalDurationMs += t.run_duration_ms;
    }
    if (t.billable == null) return;
    for (const os of Object.keys(t.billable)) {
        const b = t.billable[os];
        if (b != null && Number.isFinite(b.total_ms) && b.total_ms >= 0) {
            result.totalBillableMs += b.total_ms;
        }
    }
}

export function calcComputeCost(
    runs: (PipelineRun | null)[],
    timing?: Map<number, WorkflowRunTiming>,
): ComputeCostResult {
    const result: ComputeCostResult = {
        runCount: 0,
        totalDurationMs: 0,
        totalBillableMs: 0,
        billableMinutes: 0,
    };
    if (!Array.isArray(runs)) return result;

    const timingMap = timing instanceof Map ? timing : undefined;

    for (const run of runs) {
        if (run == null) continue;
        const runIdNum = runIdAsNumber(run);
        if (!Number.isFinite(runIdNum)) continue;
        const t = timingMap?.get(runIdNum);
        if (t == null) continue;
        accumulateTiming(result, t);
    }

    result.billableMinutes =
        Number.isFinite(result.totalBillableMs) && result.totalBillableMs >= 0
            ? Math.round((result.totalBillableMs / 60000) * 100) / 100
            : 0;

    return result;
}
