/**
 * Compute: Pipeline Pass Rate.
 *
 * Calculates pass rate from CI PipelineRuns (success / total).
 *
 * @reference DORA State of DevOps 2025 — pass rate = success / total
 */
import type { PipelineRun } from '../../types/ci-cd.js';

/**
 * Calculate pipeline pass rate from CI PipelineRuns.
 * Pass rate = runs with conclusion=success / total runs with conclusion defined.
 *
 * @returns Percentage (0-100), rounded to 2 decimal places.
 */
export function calcPipelinePassRate(runs: PipelineRun[]): number {
    const withConclusion = runs.filter((r) => r.conclusion != null);
    if (withConclusion.length === 0) return 0;
    const passed = withConclusion.filter((r) => r.conclusion === 'success').length;
    return Math.round((passed / withConclusion.length) * 100 * 100) / 100;
}
