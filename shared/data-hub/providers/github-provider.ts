/**
 * Data Hub — GitHub Provider.
 *
 * Adapts GitHubManager (GitProvider) to the DataProvider interface.
 * Fetches raw CI/CD data from GitHub Actions API.
 */
import { extractErrorMessage, humanizeError } from '../../prompt-errors.js';
import type { GitProvider, PipelineJob, ArtifactInfo, CheckRunAnnotation, PipelineRun } from '../../types/ci-cd.js';
import type {
    DataProvider,
    FetchOptions,
    RawData,
    WorkflowRunTiming,
    RawCoverage,
    CiRunStats,
} from '../../types/data-hub.js';
import type { ArtifactParseResult } from '../artifact-parser.js';
import { rootLogger } from '../../logger.js';
import { extractCoverage } from '../extractors/coverage-extractor.js';
import { isTestArtifact, parseArtifactBufferAll } from '../artifact-parser.js';
import { detectFrameworkCascade } from '../extractors/framework-detector.js';
import { classifyFailures, type StepConclusion, type FailureInput } from '../extractors/failure-classifier.js';
import { getCheckRuns } from '../../github-check-run.js';
import { buildCommitLog } from '../../commit-log.js';

const DEFAULT_MAX_ARTIFACTS_PER_RUN = 5;

export class GitHubDataProvider implements DataProvider {
    readonly name = 'github';
    readonly source = 'github' as const;

    constructor(private readonly provider: GitProvider) {}

    async fetchRawData(options: FetchOptions): Promise<RawData> {
        const runs = await this.provider.getRecentPipelines(options.count);
        const jobsMap = new Map<number, PipelineJob[]>();
        const artifactsMap = new Map<number, ArtifactInfo[]>();
        const failureReasonsMap = new Map<number, string[]>();
        const timingMap = new Map<number, WorkflowRunTiming>();
        const parsedArtifactsMap = new Map<number, ArtifactParseResult[]>();
        let coverage: RawCoverage | undefined;

        const maxArtifacts = options.maxArtifactsPerRun ?? DEFAULT_MAX_ARTIFACTS_PER_RUN;

        for (const run of runs) {
            const runIdNum = this.parseRunId(run.id);
            if (runIdNum == null) continue;
            await this.processRun(
                runIdNum,
                jobsMap,
                artifactsMap,
                failureReasonsMap,
                timingMap,
                parsedArtifactsMap,
                maxArtifacts,
            );
            if (coverage == null) {
                const runJobs = jobsMap.get(runIdNum);
                if (runJobs) coverage = await this.extractCoverageFromJobs(runJobs);
            }
        }

        const framework = await this.detectFrameworkFromFirstRun(runs);
        const commitLog = buildCommitLog(runs);
        const ciRuns = this.deriveCiRuns(runs, parsedArtifactsMap);

        return {
            runs,
            jobs: jobsMap,
            artifacts: artifactsMap,
            failureReasons: failureReasonsMap,
            timing: timingMap,
            ...(parsedArtifactsMap.size > 0 ? { parsedArtifacts: parsedArtifactsMap } : {}),
            ...(coverage != null ? { coverage } : {}),
            ...(framework != null ? { framework } : {}),
            ...(commitLog ? { commitLog } : {}),
            ...(ciRuns.length > 0 ? { ciRuns } : {}),
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
        timingMap: Map<number, WorkflowRunTiming>,
        parsedArtifactsMap: Map<number, ArtifactParseResult[]>,
        maxArtifacts: number,
    ): Promise<void> {
        try {
            const runJobs = await this.provider.getPipelineJobs(runIdNum);
            jobsMap.set(runIdNum, runJobs);
            await this.fetchArtifacts(runIdNum, artifactsMap, parsedArtifactsMap, maxArtifacts);
            await this.fetchTiming(runIdNum, timingMap);
            await this.fetchFailureReasons(runJobs, failureReasonsMap);
        } catch (err) {
            rootLogger.debug(`GitHub: jobs fetch failed for run ${runIdNum}: ${String(err)}`);
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
            rootLogger.debug(`GitHub: artifacts fetch failed for run ${runIdNum}: ${String(err)}`);
        }
    }

    private async fetchTiming(runIdNum: number, timingMap: Map<number, WorkflowRunTiming>): Promise<void> {
        try {
            const timing = await this.provider.getWorkflowRunTiming(runIdNum);
            if (timing != null) timingMap.set(runIdNum, timing);
        } catch (err) {
            rootLogger.debug(
                `GitHub: timing fetch failed for run ${runIdNum}: ${humanizeError(String(err))?.msg ?? String(err)}`,
            );
        }
    }

    private async detectFrameworkFromFirstRun(runs: Array<{ head_branch?: string }>): Promise<string | undefined> {
        const firstRun = runs[0];
        if (!firstRun) return undefined;
        try {
            const branch = firstRun.head_branch ?? 'main';
            const detected = await detectFrameworkCascade(this.provider, branch);
            return detected.framework !== 'unknown' ? detected.framework : undefined;
        } catch (err) {
            rootLogger.debug(`GitHub: framework detection failed: ${String(err)}`);
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
                rootLogger.debug(`GitHub: artifact download failed for ${String(artifact.name)}: ${String(err)}`);
            }
        }

        return results;
    }

    /**
     * Extract coverage from job logs using the coverage extractor cascade.
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
     * GitHub step conclusions + Check Runs annotations + job log regex.
     */
    private async fetchFailureReasons(jobs: PipelineJob[], failureReasonsMap: Map<number, string[]>): Promise<void> {
        const githubSteps = this.collectStepConclusions(jobs);
        const checkRunAnnotations = await this.collectCheckRunAnnotations();
        const logText = await this.collectFirstFailedJobLog(jobs);

        const input: FailureInput = {};
        if (githubSteps.length > 0) input.githubSteps = githubSteps;
        if (checkRunAnnotations) input.checkRunAnnotations = checkRunAnnotations;
        if (logText) input.logText = logText;

        const classified = classifyFailures(input);
        this.mapClassifiedToFirstFailedJob(classified, jobs, failureReasonsMap);
    }

    private collectStepConclusions(jobs: PipelineJob[]): StepConclusion[] {
        const steps: StepConclusion[] = [];
        for (const job of jobs) {
            if (job.status !== 'failure' && job.status !== 'cancelled') continue;
            if (job.stepConclusions) {
                for (const step of job.stepConclusions) {
                    steps.push({ name: step.name, conclusion: step.conclusion, number: step.number });
                }
            }
        }
        return steps;
    }

    private async collectCheckRunAnnotations(): Promise<CheckRunAnnotation[] | undefined> {
        try {
            const commitSha = process.env['GITHUB_SHA'];
            if (!commitSha) return undefined;
            const checkRuns = await getCheckRuns(commitSha);
            const allAnnotations: CheckRunAnnotation[] = [];
            for (const cr of checkRuns) {
                if (cr.annotations) allAnnotations.push(...cr.annotations);
            }
            return allAnnotations.length > 0 ? allAnnotations : undefined;
        } catch (err) {
            rootLogger.debug(`GitHub: check runs fetch failed: ${String(err)}`);
            return undefined;
        }
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
