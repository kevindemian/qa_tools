/**
 * Data Hub — GitLab Provider.
 *
 * Adapts GitLabManager (GitProvider) to the DataProvider interface.
 * Fetches raw CI/CD data from GitLab CI API.
 */
import type { GitProvider, PipelineJob, ArtifactInfo, GitLabTestReport, PipelineRun } from '../../types/ci-cd.js';
import type { DataProvider, FetchOptions, RawData, RawCoverage } from '../../types/data-hub.js';
import type { ArtifactParseResult } from '../artifact-parser.js';
import { rootLogger } from '../../logger.js';
import { extractCoverage } from '../extractors/coverage-extractor.js';
import { isTestArtifact, parseArtifactBufferAll } from '../artifact-parser.js';
import { detectFrameworkCascade } from '../extractors/framework-detector.js';
import { classifyFailures, type FailureInput } from '../extractors/failure-classifier.js';

const MAX_ARTIFACTS_PER_RUN = 5;

export class GitLabDataProvider implements DataProvider {
    readonly name = 'gitlab';
    readonly source = 'gitlab' as const;

    constructor(private readonly provider: GitProvider) {}

    async fetchRawData(options: FetchOptions): Promise<RawData> {
        const runs = await this.provider.getRecentPipelines(options.count);
        const jobsMap = new Map<number, PipelineJob[]>();
        const artifactsMap = new Map<number, ArtifactInfo[]>();
        const failureReasonsMap = new Map<number, string[]>();
        const parsedArtifactsMap = new Map<number, ArtifactParseResult[]>();
        let coverage: RawCoverage | undefined;
        let gitlabTestReport: GitLabTestReport | undefined;

        for (const run of runs) {
            const runIdNum = this.parseRunId(run.id);
            if (runIdNum == null) continue;
            const report = await this.processRun(
                runIdNum,
                jobsMap,
                artifactsMap,
                failureReasonsMap,
                parsedArtifactsMap,
                run,
            );
            if (gitlabTestReport == null && report != null) gitlabTestReport = report;
            if (coverage == null) {
                const runJobs = jobsMap.get(runIdNum);
                if (runJobs) coverage = await this.extractCoverageFromJobs(runJobs);
            }
        }

        const framework = await this.detectFrameworkFromFirstRun(runs);

        return {
            runs,
            jobs: jobsMap,
            artifacts: artifactsMap,
            failureReasons: failureReasonsMap,
            ...(parsedArtifactsMap.size > 0 ? { parsedArtifacts: parsedArtifactsMap } : {}),
            ...(coverage != null ? { coverage } : {}),
            ...(framework != null ? { framework } : {}),
            ...(gitlabTestReport != null ? { gitlabTestReport } : {}),
        };
    }

    private parseRunId(id: string | number | undefined): number | undefined {
        if (id == null) return undefined;
        const num = typeof id === 'string' ? parseInt(id, 10) : id;
        return isNaN(num) ? undefined : num;
    }

    private async processRun(
        runIdNum: number,
        jobsMap: Map<number, PipelineJob[]>,
        artifactsMap: Map<number, ArtifactInfo[]>,
        failureReasonsMap: Map<number, string[]>,
        parsedArtifactsMap: Map<number, ArtifactParseResult[]>,
        run: PipelineRun,
    ): Promise<GitLabTestReport | undefined> {
        try {
            const runJobs = await this.provider.getPipelineJobs(runIdNum);
            jobsMap.set(runIdNum, runJobs);
            await this.fetchArtifacts(runIdNum, artifactsMap, parsedArtifactsMap);
            const testReport = await this.fetchTestReport(runIdNum);
            await this.fetchFailureReasons(runJobs, failureReasonsMap, run);
            return testReport;
        } catch (err) {
            rootLogger.debug(`GitLab: jobs fetch failed for run ${runIdNum}: ${String(err)}`);
            return undefined;
        }
    }

    private async fetchArtifacts(
        runIdNum: number,
        artifactsMap: Map<number, ArtifactInfo[]>,
        parsedArtifactsMap: Map<number, ArtifactParseResult[]>,
    ): Promise<void> {
        try {
            const arts = await this.provider.listPipelineArtifacts(runIdNum);
            artifactsMap.set(runIdNum, arts);
            const parsed = await this.downloadTestArtifacts(arts);
            if (parsed.length > 0) parsedArtifactsMap.set(runIdNum, parsed);
        } catch (err) {
            rootLogger.debug(`GitLab: artifacts fetch failed for run ${runIdNum}: ${String(err)}`);
        }
    }

    private async fetchTestReport(runIdNum: number): Promise<GitLabTestReport | undefined> {
        try {
            const report = await this.provider.getTestReport(runIdNum);
            return report != null && report.total_count > 0 ? report : undefined;
        } catch (err) {
            rootLogger.debug(`GitLab: test report fetch failed for run ${runIdNum}: ${String(err)}`);
            return undefined;
        }
    }

    private async detectFrameworkFromFirstRun(runs: Array<{ ref?: string }>): Promise<string | undefined> {
        const firstRun = runs[0];
        if (!firstRun) return undefined;
        try {
            const branch = firstRun.ref ?? 'main';
            const detected = await detectFrameworkCascade(this.provider, branch);
            return detected.framework !== 'unknown' ? detected.framework : undefined;
        } catch (err) {
            rootLogger.debug(`GitLab: framework detection failed: ${String(err)}`);
            return undefined;
        }
    }

    /**
     * Download and parse test artifacts for a run.
     * Respects MAX_ARTIFACTS_PER_RUN limit.
     */
    private async downloadTestArtifacts(artifacts: ArtifactInfo[]): Promise<ArtifactParseResult[]> {
        const testArtifacts = artifacts.filter((a) => isTestArtifact(a.name));
        const results: ArtifactParseResult[] = [];
        let downloaded = 0;

        for (const artifact of testArtifacts) {
            if (downloaded >= MAX_ARTIFACTS_PER_RUN) break;

            try {
                const result = await this.provider.downloadArtifact(artifact.id);
                const parsed = parseArtifactBufferAll(result.buffer, result.filename);
                results.push(...parsed);
                downloaded++;
            } catch (err) {
                rootLogger.debug(`GitLab: artifact download failed for ${String(artifact.name)}: ${String(err)}`);
            }
        }

        return results;
    }

    /**
     * Extract coverage from job logs as fallback.
     */
    private async extractCoverageFromJobs(jobs: PipelineJob[]): Promise<RawCoverage | undefined> {
        for (const job of jobs) {
            if (job.status !== 'success') continue;
            try {
                const logText = await this.provider.getJobLogs(job.id);
                if (logText == null) continue;

                const coverage = extractCoverage({ logText });
                if (coverage != null) return coverage;
            } catch {
                // Ignore — coverage extraction is best-effort
            }
        }
        return undefined;
    }

    /**
     * Fetch failure reasons using multi-source classification:
     * GitLab failure_reason + job log regex.
     */
    private async fetchFailureReasons(
        jobs: PipelineJob[],
        failureReasonsMap: Map<number, string[]>,
        run: PipelineRun,
    ): Promise<void> {
        const logText = await this.collectFirstFailedJobLog(jobs);

        const input: FailureInput = {};
        if (run.conclusion === 'failure') input.gitlabFailureReason = 'pipeline failed';
        if (logText) input.logText = logText;

        const classified = classifyFailures(input);
        this.mapClassifiedToFirstFailedJob(classified, jobs, failureReasonsMap);
    }

    private async collectFirstFailedJobLog(jobs: PipelineJob[]): Promise<string | undefined> {
        for (const job of jobs) {
            if (job.status !== 'failure' && job.status !== 'cancelled') continue;
            try {
                const logs = await this.provider.getJobLogs(job.id);
                if (logs) return logs;
            } catch {
                // Ignore — log fetch is best-effort
            }
        }
        return undefined;
    }

    private mapClassifiedToFirstFailedJob(
        classified: Array<{ reason?: string; message?: string; stepName?: string }>,
        jobs: PipelineJob[],
        failureReasonsMap: Map<number, string[]>,
    ): void {
        if (classified.length === 0) return;
        const reasons = classified.map((e) => e.reason ?? e.message ?? e.stepName ?? 'Unknown failure');
        for (const job of jobs) {
            if (job.status !== 'failure' && job.status !== 'cancelled') continue;
            const jobIdNum = typeof job.id === 'string' ? parseInt(job.id, 10) : job.id;
            if (!isNaN(jobIdNum)) {
                failureReasonsMap.set(jobIdNum, reasons);
                break;
            }
        }
    }
}
