/**
 * Compute: Pass Rate and Fail Rate.
 *
 * Consolidates all pass rate calculations that were previously
 * scattered across ci-data.ts:259, health-score.ts:171, pr-report-core.ts:380,
 * report-html.ts:98, case17.ts:132, pipeline-health.ts:80, run-comparison.ts:13.
 *
 * @reference DORA State of DevOps 2025 — pass rate = success / total
 */
import type { PipelineRun } from '../../types/ci-cd.js';
import type { MetricsRun } from '../../metrics.js';

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

/**
 * Calculate pipeline fail rate from CI PipelineRuns.
 * Fail rate = runs with conclusion != success / total runs with conclusion defined.
 *
 * @returns Percentage (0-100), rounded to 2 decimal places.
 */
export function calcPipelineFailRate(runs: PipelineRun[]): number {
    const passRate = calcPipelinePassRate(runs);
    return Math.round((100 - passRate) * 100) / 100;
}

/**
 * Calculate pass rate from a MetricsRun (local test results).
 * Pass rate = passed / (passed + failed) * 100.
 *
 * @returns Percentage (0-100), or 0 if no tests executed.
 */
export function calcTestPassRate(run: MetricsRun): number {
    const executed = run.passed + run.failed;
    if (executed === 0) return 0;
    return Math.round((run.passed / executed) * 100 * 100) / 100;
}

/**
 * Calculate aggregate pass rate from multiple MetricsRuns using exp-weighted average.
 * More recent runs have higher weight.
 *
 * @param runs - MetricsRun array (ordered oldest to newest)
 * @param windowSize - Number of recent runs to consider
 * @returns Percentage (0-100)
 */
export function calcExpWeightedPassRate(runs: MetricsRun[], windowSize: number): number {
    const slice = runs.slice(-windowSize);
    if (slice.length === 0) return 0;

    let weightedSum = 0;
    let weightTotal = 0;
    for (const [i, run] of slice.entries()) {
        const executed = run.passed + run.failed;
        const raw = executed > 0 ? (run.passed / executed) * 100 : 0;
        const value = Number.isFinite(raw) ? raw : 0;
        const weight = Math.exp((i - windowSize + 1) / Math.max(windowSize / 2, 1));
        weightedSum += value * weight;
        weightTotal += weight;
    }
    return weightTotal > 0 ? weightedSum / weightTotal : 0;
}

/**
 * Calculate execution rate from a MetricsRun.
 * Execution rate = (passed + failed) / total * 100.
 *
 * @returns Percentage (0-100), or 0 if total is 0.
 */
export function calcExecutionRate(run: MetricsRun): number {
    if (run.total === 0) return 0;
    const rate = ((run.passed + run.failed) / run.total) * 100;
    return Math.min(100, Math.round(rate * 100) / 100);
}

/**
 * Calculate exp-weighted execution rate from multiple MetricsRuns.
 */
export function calcExpWeightedExecutionRate(runs: MetricsRun[], windowSize: number): number {
    const slice = runs.slice(-windowSize);
    if (slice.length === 0) return 0;

    let weightedSum = 0;
    let weightTotal = 0;
    for (const [i, run] of slice.entries()) {
        const raw = run.total > 0 ? ((run.passed + run.failed) / run.total) * 100 : 0;
        const value = Number.isFinite(raw) ? raw : 0;
        const weight = Math.exp((i - windowSize + 1) / Math.max(windowSize / 2, 1));
        weightedSum += value * weight;
        weightTotal += weight;
    }
    return weightTotal > 0 ? weightedSum / weightTotal : 0;
}
