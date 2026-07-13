/**
 * Compute: Retry/flaky rollup (LA-2).
 *
 * Correlates run-attempt signals with flakiness. A run is retry-flaky when it
 * needed more than one attempt to pass (GitHub `run_attempt > 1`, or GitLab
 * `retried === true`) and eventually succeeded — an earlier attempt failed and
 * the retry recovered, which is the signature of a flaky test/suite.
 *
 * @reference DORA — flaky tests erode confidence; retries mask real failures.
 */
import type { PipelineRun } from '../../types/ci-cd.js';
import type { RetryFlakyResult } from '../../types/data-hub.js';

/**
 * True when the run was retried. GitHub exposes an exact attempt index; GitLab
 * only exposes a boolean, so any `retried === true` counts as a retry.
 */
function isRetried(run: PipelineRun): boolean {
    if (run.run_attempt != null) {
        const attempt = Number(run.run_attempt);
        if (Number.isFinite(attempt) && attempt > 1) return true;
    }
    return run.retried === true;
}

function eventuallyPassed(run: PipelineRun): boolean {
    return run.conclusion === 'success';
}

/**
 * Compute retry/flaky rollup from pipeline runs.
 *
 * Safeguards (AGENTS §24/§25):
 * - Non-array input → explicit empty result with NaN rate (never a passing 0).
 * - Null runs are skipped.
 * - Non-finite attempt values are ignored (treated as single attempt).
 * - Empty run set → rate is NaN (no data is NOT a green score).
 */
export function calcRetryFlaky(runs: (PipelineRun | null)[]): RetryFlakyResult {
    if (!Array.isArray(runs)) {
        return { flakyRetryRuns: 0, retriedRuns: 0, totalRuns: 0, maxAttempts: 1, rate: NaN };
    }

    let retriedRuns = 0;
    let flakyRetryRuns = 0;
    let maxAttempts = 1;

    for (const run of runs) {
        if (run == null) continue;
        const attempt = run.run_attempt != null ? Number(run.run_attempt) : 1;
        if (Number.isFinite(attempt) && attempt > maxAttempts) {
            maxAttempts = attempt;
        }

        if (isRetried(run)) {
            retriedRuns += 1;
            if (eventuallyPassed(run)) {
                flakyRetryRuns += 1;
            }
        }
    }

    const totalRuns = runs.length;
    const rate = totalRuns > 0 ? (flakyRetryRuns / totalRuns) * 100 : NaN;

    return { flakyRetryRuns, retriedRuns, totalRuns, maxAttempts, rate };
}
