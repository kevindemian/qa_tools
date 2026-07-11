/**
 * Data Hub — GitLab Provider.
 *
 * Adapts GitLabManager (GitProvider) to the DataProvider interface.
 * Fetches raw CI/CD data from GitLab CI API.
 */
import type { GitProvider, PipelineJob, ArtifactInfo, GitLabTestReport, PipelineRun } from '../../types/ci-cd.js';
import type { DataProvider, FetchOptions, RawData, RawCoverage, CiRunStats, DataSource } from '../../types/data-hub.js';
import type { ArtifactParseResult } from '../artifact-parser.js';
import { parsePipelineRun } from '../schemas.js';
import { rootLogger } from '../../logger.js';
import { extractErrorMessage } from '../../prompt-errors.js';
import { extractCoverage } from '../extractors/coverage-extractor.js';
import { isTestArtifact, parseArtifactBufferAll } from '../artifact-parser.js';
import { detectFrameworkCascade } from '../extractors/framework-detector.js';
import { classifyFailures, type FailureInput } from '../extractors/failure-classifier.js';
import { buildCommitLog } from '../extractors/commit-log-extractor.js';

const DEFAULT_MAX_ARTIFACTS_PER_RUN = 5;

export class GitLabDataProvider implements DataProvider {
    readonly name = 'gitlab';
    readonly source = 'gitlab' as const;

    constructor(private readonly provider: GitProvider) {}

    async fetchRawData(options: FetchOptions): Promise<RawData> {
        const rawRuns = await this.provider.getRecentPipelines(options.count);
        const runs: PipelineRun[] = [];
        for (const raw of rawRuns) {
            const parsed = parsePipelineRun(raw);
            if (parsed) runs.push(parsed);
        }
        const jobsMap = new Map<number, PipelineJob[]>();
        const artifactsMap = new Map<number, ArtifactInfo[]>();
        const failureReasonsMap = new Map<number, string[]>();
        const parsedArtifactsMap = new Map<number, ArtifactParseResult[]>();
        let coverage: RawCoverage | undefined;
        let gitlabTestReport: GitLabTestReport | undefined;

        const maxArtifacts = options.maxArtifactsPerRun ?? DEFAULT_MAX_ARTIFACTS_PER_RUN;

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
                maxArtifacts,
            );
            if (gitlabTestReport == null && report != null) gitlabTestReport = report;
            coverage = await this.extractCoverageIfNeeded(coverage, jobsMap, runIdNum);
        }

        const framework = await this.detectFrameworkFromFirstRun(runs);
        const commitLog = buildCommitLog(runs);
        const ciRuns = this.deriveCiRuns(runs, parsedArtifactsMap);
        const provenance = this.buildProvenance(coverage, framework, gitlabTestReport);

        return {
            runs,
            jobs: jobsMap,
            artifacts: artifactsMap,
            failureReasons: failureReasonsMap,
            ...(parsedArtifactsMap.size > 0 ? { parsedArtifacts: parsedArtifactsMap } : {}),
            ...(coverage != null ? { coverage } : {}),
            ...(framework != null ? { framework } : {}),
            ...(gitlabTestReport != null ? { gitlabTestReport } : {}),
            ...(commitLog ? { commitLog } : {}),
            ...(ciRuns.length > 0 ? { ciRuns } : {}),
            provenance,
        };
    }

    private buildProvenance(
        coverage: RawCoverage | undefined,
        framework: string | undefined,
        gitlabTestReport: GitLabTestReport | undefined,
    ): Map<string, DataSource> {
        const now = new Date().toISOString();
        const provenance = new Map<string, DataSource>();
        provenance.set('runs', { confidence: 1, source: 'gitlab-api', timestamp: now });
        if (coverage) provenance.set('coverage', { confidence: 0.9, source: 'gitlab-ci-artifacts', timestamp: now });
        if (framework) provenance.set('framework', { confidence: 0.8, source: 'local-detection', timestamp: now });
        if (gitlabTestReport) provenance.set('testReport', { confidence: 1, source: 'gitlab-api', timestamp: now });
        return provenance;
    }

    private async extractCoverageIfNeeded(
        coverage: RawCoverage | undefined,
        jobsMap: Map<number, PipelineJob[]>,
        runIdNum: number,
    ): Promise<RawCoverage | undefined> {
        if (coverage != null) return coverage;
        const runJobs = jobsMap.get(runIdNum);
        if (!runJobs) return coverage;
        return this.extractCoverageFromJobs(runJobs);
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
        maxArtifacts: number,
    ): Promise<GitLabTestReport | undefined> {
        try {
            const runJobs = await this.provider.getPipelineJobs(runIdNum);
            jobsMap.set(runIdNum, runJobs);
            await this.fetchArtifacts(runIdNum, artifactsMap, parsedArtifactsMap, maxArtifacts);
            const testReport = await this.fetchTestReport(runIdNum);
            await this.fetchFailureReasons(runJobs, failureReasonsMap, run);
            return testReport;
        } catch (err) {
            rootLogger.debug(`GitLab: jobs fetch failed for run ${runIdNum}: ${extractErrorMessage(err)}`);
            return undefined;
        }
    }

    private async fetchArtifacts(
        runIdNum: number,
        artifactsMap: Map<number, ArtifactInfo[]>,
        parsedArtifactsMap: Map<number, ArtifactParseResult[]>,
        maxArtifacts: number,
    ): Promise<void> {
        try {
            const arts = await this.provider.listPipelineArtifacts(runIdNum);
            artifactsMap.set(runIdNum, arts);
            const parsed = await this.downloadTestArtifacts(arts, maxArtifacts);
            if (parsed.length > 0) parsedArtifactsMap.set(runIdNum, parsed);
        } catch (err) {
            rootLogger.debug(`GitLab: artifacts fetch failed for run ${runIdNum}: ${extractErrorMessage(err)}`);
        }
    }

    private async fetchTestReport(runIdNum: number): Promise<GitLabTestReport | undefined> {
        try {
            const report = await this.provider.getTestReport(runIdNum);
            return report != null && report.total_count > 0 ? report : undefined;
        } catch (err) {
            rootLogger.debug(`GitLab: test report fetch failed for run ${runIdNum}: ${extractErrorMessage(err)}`);
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
            rootLogger.debug(`GitLab: framework detection failed: ${extractErrorMessage(err)}`);
            return undefined;
        }
    }

    /**
     * Download and parse test artifacts for a run.
     * Respects maxArtifacts limit.
     */
    private async downloadTestArtifacts(
        artifacts: ArtifactInfo[],
        maxArtifacts: number,
    ): Promise<ArtifactParseResult[]> {
        const testArtifacts = artifacts.filter((a) => isTestArtifact(a.name));
        const results: ArtifactParseResult[] = [];
        let downloaded = 0;

        for (const artifact of testArtifacts) {
            if (downloaded >= maxArtifacts) break;

            try {
                const result = await this.provider.downloadArtifact(artifact.id);
                const parsed = parseArtifactBufferAll(result.buffer, result.filename);
                results.push(...parsed);
                downloaded++;
            } catch (err) {
                rootLogger.debug(
                    `GitLab: artifact download failed for ${String(artifact.name)}: ${extractErrorMessage(err)}`,
                );
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
            } catch (err) {
                rootLogger.debug(`coverage extraction: ${extractErrorMessage(err)}`);
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
            } catch (err) {
                rootLogger.debug(`log fetch: ${extractErrorMessage(err)}`);
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

    private deriveCiRuns(runs: PipelineRun[], parsedArtifacts: Map<number, ArtifactParseResult[]>): CiRunStats[] {
        const ciRuns: CiRunStats[] = [];
        for (const run of runs) {
            const runIdNum = this.parseRunId(run.id);
            if (runIdNum == null) continue;
            const artifacts = parsedArtifacts.get(runIdNum);
            if (!artifacts || artifacts.length === 0) continue;
            let passed = 0;
            let failed = 0;
            let skipped = 0;
            let total = 0;
            for (const artifact of artifacts) {
                passed += artifact.data.stats.passed;
                failed += artifact.data.stats.failed;
                skipped += artifact.data.stats.skipped;
                total += artifact.data.stats.total;
            }
            ciRuns.push({
                runId: runIdNum,
                createdAt: run.created_at ?? '',
                passed,
                failed,
                skipped,
                total,
            });
        }
        return ciRuns;
    }
}
