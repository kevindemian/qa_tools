/**
 * Compute: Flaky Rate.
 *
 * Detects flaky jobs from CI PipelineRuns by analyzing status variations
 * across runs for each job name.
 *
 * @reference DORA — flaky tests erode confidence in test results
 */
import type { PipelineRun, PipelineJob } from '../../types/ci-cd.js';
import type { FlakyResult } from '../../types/data-hub.js';

/**
 * Detect flaky jobs from CI PipelineRuns by analyzing status variations
 * across runs for each job name.
 *
 * A job is flaky if it appears with both 'success' and non-success status
 * across different pipeline runs.
 *
 * @returns FlakyResult[] sorted by rate descending.
 */
export function calcFlakyFromPipelineRuns(runs: PipelineRun[], jobsMap: Map<number, PipelineJob[]>): FlakyResult[] {
    const jobHistory = buildJobHistory(runs, jobsMap);
    return detectFlakyFromHistory(jobHistory);
}

function buildJobHistory(runs: PipelineRun[], jobsMap: Map<number, PipelineJob[]>): Map<string, Map<number, string>> {
    const jobHistory = new Map<string, Map<number, string>>();

    for (const run of runs) {
        const runId = run.id;
        if (runId == null) continue;
        const runIdNum = typeof runId === 'string' ? parseInt(runId, 10) : runId;
        const jobs = jobsMap.get(runIdNum);
        if (!jobs) continue;

        for (const job of jobs) {
            if (!jobHistory.has(job.name)) {
                jobHistory.set(job.name, new Map());
            }
            const history = jobHistory.get(job.name) ?? new Map<number, string>();
            history.set(runIdNum, job.status);
            jobHistory.set(job.name, history);
        }
    }

    return jobHistory;
}

function detectFlakyFromHistory(jobHistory: Map<string, Map<number, string>>): FlakyResult[] {
    const result: FlakyResult[] = [];
    for (const [name, statusByRun] of jobHistory) {
        const statuses = Array.from(statusByRun.values());
        if (statuses.length < 2) continue;
        if (isFlaky(statuses)) {
            result.push(makeFlakyResult(name, statuses));
        }
    }

    result.sort((a, b) => b.rate - a.rate);
    return result;
}

function isFlaky(statuses: string[]): boolean {
    const hasSuccess = statuses.includes('success');
    const hasFailure = statuses.some((s) => s !== 'success');
    return hasSuccess && hasFailure;
}

function makeFlakyResult(name: string, statuses: string[]): FlakyResult {
    const failCount = statuses.filter((s) => s !== 'success').length;
    return {
        title: name,
        rate: Math.round((failCount / statuses.length) * 100 * 100) / 100,
        runs: statuses.length,
    };
}
