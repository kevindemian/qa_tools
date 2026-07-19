/**
 * Compute: Per-Run Costs.
 *
 * Breaks down CI/CD cost by run.
 * Uses GitHub Actions billing: billable_minutes * cost_per_minute.
 * Used by pipeline-cost.ts and dashboard.
 */
import type { PipelineRun } from '../../types/ci-cd.js';
import type { PerRunCost } from '../../types/data-hub.js';

/**
 * Calculate per-run cost breakdown.
 *
 * @param runs - Pipeline runs to analyze.
 * @param costPerMinute - Cost per minute for billing (default: 0.008 USD).
 * @returns Array of PerRunCost with id, timestamp, minutes, cost, branch.
 */
export function calcPerRunCosts(runs: PipelineRun[], costPerMinute = 0.008): PerRunCost[] {
    // Rule 24 — costPerMinute must be a finite, non-negative rate. Invalid values fall back to 0 (no cost fabricated).
    const safeRate = Number.isFinite(costPerMinute) && costPerMinute >= 0 ? costPerMinute : 0;
    return runs
        .filter((r) => r.updated_at != null && r.created_at != null)
        .map((r) => {
            const start = new Date(r.created_at as string).getTime();
            const end = new Date(r.updated_at as string).getTime();
            // Invalid dates yield NaN; never fabricate a duration from missing data (§25).
            const rawMinutes = Number.isFinite(start) && Number.isFinite(end) ? (end - start) / 60_000 : 0;
            const durationMinutes = Math.max(rawMinutes, 0);
            const cost = Math.round(durationMinutes * safeRate * 100) / 100;
            return {
                runId: typeof r.id === 'number' ? r.id : 0,
                timestamp: r.updated_at ?? new Date().toISOString(),
                minutes: Math.round(durationMinutes * 100) / 100,
                cost,
                branch: r.head_branch ?? 'unknown',
            };
        });
}
