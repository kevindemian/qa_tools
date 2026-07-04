/**
 * Data Hub — GitLab Provider.
 *
 * Adapts GitLabManager (GitProvider) to the DataProvider interface.
 * Fetches raw CI/CD data from GitLab CI API.
 */
import type { GitProvider, PipelineJob, ArtifactInfo } from '../../types/ci-cd.js';
import type { DataProvider, FetchOptions, RawData } from '../../types/data-hub.js';
import { extractFailureReasons } from '../compute/failure-reasons.js';

export class GitLabDataProvider implements DataProvider {
    readonly name = 'gitlab';
    readonly source = 'gitlab' as const;

    constructor(private readonly provider: GitProvider) {}

    async fetchRawData(options: FetchOptions): Promise<RawData> {
        const { count } = options;

        const runs = await this.provider.getRecentPipelines(count);
        const jobsMap = new Map<number, PipelineJob[]>();
        const artifactsMap = new Map<number, ArtifactInfo[]>();
        const failureReasonsMap = new Map<number, string[]>();

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
                } catch {
                    // Artifacts unavailable — non-fatal
                }

                await this.fetchFailureReasons(runJobs, failureReasonsMap);
            } catch {
                // Jobs unavailable — non-fatal
            }
        }

        return { runs, jobs: jobsMap, artifacts: artifactsMap, failureReasons: failureReasonsMap };
    }

    /**
     * Fetch failure reasons from job logs for failed/cancelled jobs.
     * Uses getJobLogs() to fetch actual log content.
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
        } catch {
            // Logs unavailable — non-fatal
        }
    }
}
