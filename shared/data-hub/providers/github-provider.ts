/**
 * Data Hub — GitHub Provider.
 *
 * Adapts GitHubManager (GitProvider) to the DataProvider interface.
 * Fetches raw CI/CD data from GitHub Actions API.
 */
import { humanizeError } from '../../prompt-errors.js';
import type { GitProvider, PipelineJob, ArtifactInfo } from '../../types/ci-cd.js';
import type { DataProvider, FetchOptions, RawData, WorkflowRunTiming } from '../../types/data-hub.js';
import { rootLogger } from '../../logger.js';
import { extractFailureReasons } from '../compute/failure-reasons.js';

export class GitHubDataProvider implements DataProvider {
    readonly name = 'github';
    readonly source = 'github' as const;

    constructor(private readonly provider: GitProvider) {}

    async fetchRawData(options: FetchOptions): Promise<RawData> {
        const { count } = options;

        const runs = await this.provider.getRecentPipelines(count);
        const jobsMap = new Map<number, PipelineJob[]>();
        const artifactsMap = new Map<number, ArtifactInfo[]>();
        const failureReasonsMap = new Map<number, string[]>();
        const timingMap = new Map<number, WorkflowRunTiming>();

        for (const run of runs) {
            const runId = run.id;
            if (runId == null) continue;

            const runIdNum = typeof runId === 'string' ? parseInt(runId, 10) : runId;
            if (isNaN(runIdNum)) continue;

            try {
                const runJobs = await this.provider.getPipelineJobs(runIdNum);
                jobsMap.set(runIdNum, runJobs);

                try {
                    const arts = await this.provider.listPipelineArtifacts(runIdNum);
                    artifactsMap.set(runIdNum, arts);
                } catch (err) {
                    rootLogger.debug(`GitHub: artifacts fetch failed for run ${runIdNum}: ${String(err)}`);
                }

                try {
                    const timing = await this.provider.getWorkflowRunTiming(runIdNum);
                    if (timing != null) {
                        timingMap.set(runIdNum, timing);
                    }
                } catch (err) {
                    rootLogger.debug(
                        `GitHub: timing fetch failed for run ${runIdNum}: ${humanizeError(String(err))?.msg ?? String(err)}`,
                    );
                }

                await this.fetchFailureReasons(runJobs, failureReasonsMap);
            } catch (err) {
                rootLogger.debug(`GitHub: jobs fetch failed for run ${runIdNum}: ${String(err)}`);
            }
        }

        return { runs, jobs: jobsMap, artifacts: artifactsMap, failureReasons: failureReasonsMap, timing: timingMap };
    }

    /**
     * Fetch failure reasons from job logs for failed/cancelled jobs.
     * Bug fix: uses getJobLogs() instead of downloadArtifact().
     */
    private async fetchFailureReasons(jobs: PipelineJob[], failureReasonsMap: Map<number, string[]>): Promise<void> {
        for (const job of jobs) {
            await this.processJobForFailureReasons(job, failureReasonsMap);
        }
    }

    private async processJobForFailureReasons(
        job: PipelineJob,
        failureReasonsMap: Map<number, string[]>,
    ): Promise<void> {
        if (job.status !== 'failure' && job.status !== 'cancelled') return;

        try {
            const logText = await this.provider.getJobLogs(job.id);
            if (logText == null) return;

            const reasons = extractFailureReasons(logText);
            if (reasons.length === 0) return;

            const jobIdNum = typeof job.id === 'string' ? parseInt(job.id, 10) : job.id;
            if (!isNaN(jobIdNum)) {
                failureReasonsMap.set(jobIdNum, reasons);
            }
        } catch (err) {
            rootLogger.debug(`GitHub: job logs fetch failed for job ${String(job.id)}: ${String(err)}`);
        }
    }
}
