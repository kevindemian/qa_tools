/**
 * Compute: Branch Health and Top Failing Jobs.
 *
 * Calculates per-branch pass rates and identifies the most failing jobs.
 * Moved from ci-data.ts:303-358.
 *
 * @reference DORA — branch-level health enables targeted improvement
 */
import type { PipelineRun, PipelineJob } from '../../types/ci-cd.js';
import type { BranchHealth, FailingJob } from '../../types/data-hub.js';

/**
 * Calculate pass rate breakdown by branch.
 *
 * @param runs - PipelineRun array.
 * @returns Record mapping branch name to BranchHealth.
 */
export function calcBranchBreakdown(runs: PipelineRun[]): Record<string, BranchHealth> {
    const branchStats = new Map<string, { total: number; passed: number }>();

    for (const run of runs) {
        const branch = run.head_branch ?? run.ref ?? 'unknown';
        const stats = branchStats.get(branch) ?? { total: 0, passed: 0 };
        stats.total++;
        if (run.conclusion === 'success') stats.passed++;
        branchStats.set(branch, stats);
    }

    const result: Record<string, BranchHealth> = {};
    for (const [branch, stats] of branchStats) {
        result[branch] = {
            passRate: stats.total > 0 ? Math.round((stats.passed / stats.total) * 100 * 100) / 100 : 0,
            count: stats.total,
        };
    }
    return result;
}

/**
 * Calculate top failing jobs across pipeline runs.
 *
 * @param runs - PipelineRun array.
 * @param jobsMap - Map from run ID to PipelineJob[].
 * @returns FailingJob[] sorted by failureRate descending (max 10).
 */
export function calcTopFailingJobs(runs: PipelineRun[], jobsMap: Map<number, PipelineJob[]>): FailingJob[] {
    const jobStats = new Map<string, { total: number; failed: number }>();

    for (const run of runs) {
        const runId = run.id;
        if (runId == null) continue;
        const runIdNum = typeof runId === 'string' ? parseInt(runId, 10) : runId;
        const jobs = jobsMap.get(runIdNum);
        if (!jobs) continue;

        for (const job of jobs) {
            const stats = jobStats.get(job.name) ?? { total: 0, failed: 0 };
            stats.total++;
            if (job.status === 'failure') stats.failed++;
            jobStats.set(job.name, stats);
        }
    }

    const result: FailingJob[] = [];
    for (const [name, stats] of jobStats) {
        if (stats.total > 0) {
            result.push({
                name,
                failureRate: Math.round((stats.failed / stats.total) * 100 * 100) / 100,
                count: stats.failed,
            });
        }
    }
    result.sort((a, b) => b.failureRate - a.failureRate);
    return result.slice(0, 10);
}
