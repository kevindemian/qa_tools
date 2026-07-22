/**
 * Data Hub — GitHub Provider.
 *
 * Adapts GitHubManager (GitProvider) to the DataProvider interface.
 * Fetches raw CI/CD data from GitHub Actions API.
 */
import { extractErrorMessage, humanizeError } from '../../ui/prompt-errors.js';
import type {
    GitProvider,
    PipelineJob,
    ArtifactInfo,
    CheckRunAnnotation,
    PipelineRun,
    GitHubDeploymentRaw,
    GitHubReleaseRaw,
    GitHubSecurityAlertRaw,
    GitHubPullRequestRaw,
    GitHubIssueRaw,
} from '../../types/ci-cd.js';
import { parsePipelineRun, validateRawDataOrThrow } from '../schemas.js';
import type {
    DataProvider,
    FetchOptions,
    RawData,
    WorkflowRunTiming,
    RawCoverage,
    CiRunStats,
    DataSource,
    FailureRecord,
    Deployment,
    Release,
    SecurityFinding,
    SecuritySeverity,
    RawIssue,
    RawPullRequest,
    PerformanceMetrics,
    CoverageFile,
} from '../../types/data-hub.js';
import type { ArtifactParseResult } from '../artifact-parser.js';
import type { FlatTest } from '../../result_parser.js';

/** FlatTest plus optional fields that some frameworks (CTRF/Playwright/Allure) embed. */
interface FlatTestWithExtras extends FlatTest {
    retries?: number;
    flaky?: boolean;
    filePath?: string;
    file?: string;
    line?: number;
}

/** Detect a test reporter from workflow file content (reporter prediction fallback). */
function detectReporterInWorkflow(content: string): string | undefined {
    const patterns: Array<[string, string]> = [
        ['playwright', 'playwright'],
        ['cypress', 'cypress'],
        ['vitest', 'vitest'],
        ['jest', 'jest'],
        ['mocha', 'mocha'],
        ['pytest', 'pytest'],
        ['junit', 'junit'],
    ];
    const lower = content.toLowerCase();
    for (const [marker, name] of patterns) {
        if (lower.includes(marker)) return name;
    }
    return undefined;
}
import { rootLogger } from '../../logger.js';
import { extractCoverage } from '../extractors/coverage-extractor.js';
import { extractCoverageFiles, isCoverageArtifact } from '../extractors/coverage-files-extractor.js';
import { isTestArtifact, parseArtifactBufferAll } from '../artifact-parser.js';
import { detectFrameworkCascade } from '../extractors/framework-detector.js';
import {
    classifyFailures,
    failureEntryToRecord,
    type StepConclusion,
    type FailureInput,
} from '../extractors/failure-classifier.js';
import { getCheckRuns } from '../../ci/github-check-run.js';
import { buildCommitLog } from '../extractors/commit-log-extractor.js';

const DEFAULT_MAX_ARTIFACTS_PER_RUN = 5;

/** Extract the branch a raw pipeline run belongs to (GitHub: head_branch, GitLab: ref). */
function rawRunBranch(raw: unknown): string | undefined {
    if (raw == null || typeof raw !== 'object') return undefined;
    const r = raw as Record<string, unknown>;
    const headBranch = r['head_branch'];
    if (typeof headBranch === 'string') return headBranch;
    const ref = r['ref'];
    if (typeof ref === 'string') return ref;
    return undefined;
}

export class GitHubDataProvider implements DataProvider {
    readonly name = 'github';
    readonly source = 'github' as const;

    constructor(private readonly provider: GitProvider) {}

    async fetchRawData(options: FetchOptions): Promise<RawData> {
        const branch = options.branchFilter ?? options.branch;
        const fetched = options.since
            ? await this.provider.getRecentPipelines(options.count, options.since)
            : await this.provider.getRecentPipelines(options.count);
        const rawRuns = branch == null ? fetched : fetched.filter((r) => rawRunBranch(r) === branch);
        const runs = this.validateRuns(rawRuns);
        const jobsMap = new Map<number, PipelineJob[]>();
        const artifactsMap = new Map<number, ArtifactInfo[]>();
        const failureReasonsMap = new Map<number, string[]>();
        const failureRecords: FailureRecord[] = [];
        const timingMap = new Map<number, WorkflowRunTiming>();
        const parsedArtifactsMap = new Map<number, ArtifactParseResult[]>();
        const coverageFiles: CoverageFile[] = [];
        let coverage: RawCoverage | undefined;

        const maxArtifacts = options.maxArtifactsPerRun ?? DEFAULT_MAX_ARTIFACTS_PER_RUN;
        // Collect Check Run annotations ONCE (commit-level) and thread into both
        // failure classification and RawData.annotations. Avoids duplicate API calls.
        const checkRunAnnotations = await this.collectCheckRunAnnotations();

        for (const run of runs) {
            const runIdNum = this.parseRunId(run.id);
            if (runIdNum == null) continue;
            await this.processRun(
                runIdNum,
                jobsMap,
                artifactsMap,
                failureReasonsMap,
                failureRecords,
                timingMap,
                parsedArtifactsMap,
                maxArtifacts,
                coverageFiles,
                checkRunAnnotations,
            );
            if (coverage == null) {
                const runJobs = jobsMap.get(runIdNum);
                if (runJobs) coverage = await this.extractCoverageFromJobs(runJobs);
            }
        }

        const framework = await this.detectFrameworkFromFirstRun(runs);
        // Reporter prediction (FASE EXPAND+STORE, EIXO A): only when framework
        // could not be detected from the repo tree. Adds provenance entry.
        const predictedFramework = framework == null ? await this.detectReporterFromWorkflows() : undefined;
        const effectiveFramework = framework ?? predictedFramework;
        const commitLog = buildCommitLog(runs);
        const ciRuns = this.deriveCiRuns(runs, parsedArtifactsMap);
        const provenance = this.buildProvenance(coverage, effectiveFramework);

        // FASE EXPAND+STORE (EIXO A) — optional GitProvider methods, populated
        // ONLY when present (typeof provider.X === 'function'). Each maps to the
        // canonical data-hub type with explicit confidence + provenance.
        const deployments = await this.fetchDeployments();
        const releases = await this.fetchReleases();
        const securityFindings = await this.fetchSecurityFindings();
        const pmIssues = await this.fetchPmIssues();
        const pullRequests = await this.fetchPullRequests();
        const performanceMetrics = this.derivePerformanceMetrics(runs, timingMap);
        const artifactFailureRecords = this.extractArtifactFailureRecords(parsedArtifactsMap);
        failureRecords.push(...artifactFailureRecords);

        const now = new Date().toISOString();
        if (predictedFramework)
            provenance.set('reporter-prediction', {
                confidence: 0.7,
                source: 'reporter-prediction',
                timestamp: now,
            });
        this.recordExpandProvenance(provenance, now, {
            deployments,
            releases,
            securityFindings,
            pmIssues,
            pullRequests,
            performanceMetrics,
            coverageFiles,
        });

        const rawData = this.buildExpandRawData({
            runs,
            jobsMap,
            artifactsMap,
            failureReasonsMap,
            timingMap,
            parsedArtifactsMap,
            coverage,
            effectiveFramework,
            commitLog,
            ciRuns,
            deployments,
            releases,
            securityFindings,
            pmIssues,
            pullRequests,
            performanceMetrics,
            coverageFiles,
            failureRecords,
            provenance,
            annotations: checkRunAnnotations,
        });

        // Gap 1: reject malformed provider output explicitly at the boundary.
        return validateRawDataOrThrow(rawData);
    }

    private validateRuns(rawRuns: unknown[]): PipelineRun[] {
        const runs: PipelineRun[] = [];
        for (const raw of rawRuns) {
            const parsed = parsePipelineRun(raw);
            if (parsed) runs.push(parsed);
        }
        return runs;
    }

    private recordExpandProvenance(
        provenance: Map<string, DataSource>,
        now: string,
        data: {
            deployments: Deployment[];
            releases: Release[];
            securityFindings: SecurityFinding[];
            pmIssues: RawIssue[];
            pullRequests: RawPullRequest[];
            performanceMetrics: PerformanceMetrics | undefined;
            coverageFiles: CoverageFile[];
        },
    ): void {
        if (data.deployments.length > 0)
            provenance.set('deployments', { confidence: 0.9, source: 'github-api', timestamp: now });
        if (data.releases.length > 0)
            provenance.set('releases', { confidence: 0.9, source: 'github-api', timestamp: now });
        if (data.securityFindings.length > 0)
            provenance.set('securityFindings', { confidence: 0.85, source: 'github-api', timestamp: now });
        if (data.pmIssues.length > 0)
            provenance.set('pmIssues', { confidence: 0.9, source: 'github-api', timestamp: now });
        if (data.pullRequests.length > 0)
            provenance.set('pullRequests', { confidence: 0.9, source: 'github-api', timestamp: now });
        if (data.performanceMetrics != null)
            provenance.set('performanceMetrics', { confidence: 0.9, source: 'github-api', timestamp: now });
        if (data.coverageFiles.length > 0)
            provenance.set('coverageFiles', { confidence: 0.85, source: 'github-actions-artifacts', timestamp: now });
    }

    private buildExpandRawData(params: {
        runs: PipelineRun[];
        jobsMap: Map<number, PipelineJob[]>;
        artifactsMap: Map<number, ArtifactInfo[]>;
        failureReasonsMap: Map<number, string[]>;
        timingMap: Map<number, WorkflowRunTiming>;
        parsedArtifactsMap: Map<number, ArtifactParseResult[]>;
        coverage: RawCoverage | undefined;
        effectiveFramework: string | undefined;
        commitLog: string;
        ciRuns: CiRunStats[];
        deployments: Deployment[];
        releases: Release[];
        securityFindings: SecurityFinding[];
        pmIssues: RawIssue[];
        pullRequests: RawPullRequest[];
        performanceMetrics: PerformanceMetrics | undefined;
        coverageFiles: CoverageFile[];
        failureRecords: FailureRecord[];
        annotations: CheckRunAnnotation[] | undefined;
        provenance: Map<string, DataSource>;
    }): RawData {
        const {
            runs,
            jobsMap,
            artifactsMap,
            failureReasonsMap,
            timingMap,
            parsedArtifactsMap,
            coverage,
            effectiveFramework,
            commitLog,
            ciRuns,
            deployments,
            releases,
            securityFindings,
            pmIssues,
            pullRequests,
            performanceMetrics,
            coverageFiles,
            failureRecords,
            annotations,
            provenance,
        } = params;
        return {
            runs,
            jobs: jobsMap,
            artifacts: artifactsMap,
            failureReasons: failureReasonsMap,
            timing: timingMap,
            ...(parsedArtifactsMap.size > 0 ? { parsedArtifacts: parsedArtifactsMap } : {}),
            ...(coverage != null ? { coverage } : {}),
            ...(effectiveFramework != null ? { framework: effectiveFramework } : {}),
            ...(commitLog ? { commitLog } : {}),
            ...(ciRuns.length > 0 ? { ciRuns } : {}),
            ...(deployments.length > 0 ? { deployments } : {}),
            ...(releases.length > 0 ? { releases } : {}),
            ...(securityFindings.length > 0 ? { securityFindings } : {}),
            ...(pmIssues.length > 0 ? { pmIssues } : {}),
            ...(pullRequests.length > 0 ? { pullRequests } : {}),
            ...(performanceMetrics != null ? { performanceMetrics } : {}),
            ...(coverageFiles.length > 0 ? { coverageFiles } : {}),
            ...(annotations != null && annotations.length > 0 ? { annotations } : {}),
            failureRecords,
            provenance,
        };
    }

    private buildProvenance(coverage: RawCoverage | undefined, framework: string | undefined): Map<string, DataSource> {
        const now = new Date().toISOString();
        const provenance = new Map<string, DataSource>();
        provenance.set('runs', { confidence: 1, source: 'github-api', timestamp: now });
        if (coverage)
            provenance.set('coverage', { confidence: 0.9, source: 'github-actions-artifacts', timestamp: now });
        if (framework) provenance.set('framework', { confidence: 0.8, source: 'local-detection', timestamp: now });
        return provenance;
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
        failureRecords: FailureRecord[],
        timingMap: Map<number, WorkflowRunTiming>,
        parsedArtifactsMap: Map<number, ArtifactParseResult[]>,
        maxArtifacts: number,
        coverageFiles: CoverageFile[],
        checkRunAnnotations: CheckRunAnnotation[] | undefined,
    ): Promise<void> {
        try {
            const runJobs = await this.provider.getPipelineJobs(runIdNum);
            jobsMap.set(runIdNum, runJobs);
            await this.fetchArtifacts(runIdNum, artifactsMap, parsedArtifactsMap, maxArtifacts, coverageFiles);
            await this.fetchTiming(runIdNum, timingMap);
            await this.fetchFailureReasons(runJobs, failureReasonsMap, failureRecords, checkRunAnnotations);
        } catch (err) {
            rootLogger.debug(`GitHub: jobs fetch failed for run ${runIdNum}: ${extractErrorMessage(err)}`);
        }
    }

    private async fetchArtifacts(
        runIdNum: number,
        artifactsMap: Map<number, ArtifactInfo[]>,
        parsedArtifactsMap: Map<number, ArtifactParseResult[]>,
        maxArtifacts: number,
        coverageFiles: CoverageFile[],
    ): Promise<void> {
        try {
            const arts = await this.provider.listPipelineArtifacts(runIdNum);
            artifactsMap.set(runIdNum, arts);
            const parsed = await this.downloadTestArtifacts(arts, maxArtifacts);
            if (parsed.length > 0) parsedArtifactsMap.set(runIdNum, parsed);
            const cov = await this.downloadCoverageArtifacts(arts, maxArtifacts);
            if (cov.length > 0) coverageFiles.push(...cov);
        } catch (err) {
            rootLogger.debug(`GitHub: artifacts fetch failed for run ${runIdNum}: ${extractErrorMessage(err)}`);
        }
    }

    /**
     * Download coverage-report artifacts and decode them into per-file coverage.
     * Runs in the SAME artifact pass as test artifacts — no extra pipeline fetch.
     */
    private async downloadCoverageArtifacts(artifacts: ArtifactInfo[], maxArtifacts: number): Promise<CoverageFile[]> {
        const coverageArtifacts = artifacts.filter((a) => isCoverageArtifact(a.name));
        const files: CoverageFile[] = [];
        let downloaded = 0;

        for (const artifact of coverageArtifacts) {
            if (downloaded >= maxArtifacts) break;
            try {
                const result = await this.provider.downloadArtifact(artifact.id);
                const extracted = extractCoverageFiles(artifact.name, result.buffer);
                if (extracted.errors.length > 0)
                    rootLogger.debug(
                        `GitHub: coverage artifact ${String(artifact.name)} had ${extracted.errors.length} parse error(s)`,
                    );
                files.push(...extracted.files);
                downloaded++;
            } catch (err) {
                rootLogger.debug(
                    `GitHub: coverage artifact download failed for ${String(artifact.name)}: ${extractErrorMessage(err)}`,
                );
            }
        }

        return files;
    }

    private async fetchTiming(runIdNum: number, timingMap: Map<number, WorkflowRunTiming>): Promise<void> {
        try {
            // LA-2: use getWorkflowUsage — the same GitHub endpoint returns BOTH
            // run_duration_ms and billable minutes (real compute cost). Never
            // estimate or drop billable.
            const usage = await this.provider.getWorkflowUsage(runIdNum);
            if (usage == null) return;
            if (!Number.isFinite(usage.run_duration_ms)) return;
            timingMap.set(runIdNum, {
                run_duration_ms: usage.run_duration_ms as number,
                ...(usage.billable != null ? { billable: usage.billable } : {}),
            });
        } catch (err) {
            rootLogger.debug(
                `GitHub: usage fetch failed for run ${runIdNum}: ${humanizeError(extractErrorMessage(err))?.msg ?? extractErrorMessage(err)}`,
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
            rootLogger.debug(`GitHub: framework detection failed: ${extractErrorMessage(err)}`);
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
                    `GitHub: artifact download failed for ${String(artifact.name)}: ${extractErrorMessage(err)}`,
                );
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
    private async fetchFailureReasons(
        jobs: PipelineJob[],
        failureReasonsMap: Map<number, string[]>,
        failureRecords: FailureRecord[],
        checkRunAnnotations: CheckRunAnnotation[] | undefined,
    ): Promise<void> {
        const githubSteps = this.collectStepConclusions(jobs);
        const logText = await this.collectFirstFailedJobLog(jobs);

        const input: FailureInput = {};
        if (githubSteps.length > 0) input.githubSteps = githubSteps;
        if (checkRunAnnotations) input.checkRunAnnotations = checkRunAnnotations;
        if (logText) input.logText = logText;

        const classified = classifyFailures(input);
        this.mapClassifiedToFirstFailedJob(classified, jobs, failureReasonsMap);
        for (const entry of classified) {
            failureRecords.push(failureEntryToRecord(entry));
        }
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
            rootLogger.debug(`GitHub: check runs fetch failed: ${extractErrorMessage(err)}`);
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

    /**
     * FASE EXPAND+STORE (EIXO A) — reporter prediction from GitHub workflow files.
     * Invoked only when framework could not be detected from the repo tree.
     * Reads `.github/workflows/*` and scans for test-reporter markers.
     * Returns a framework string or undefined (never throws, never fabricates).
     */
    private async detectReporterFromWorkflows(): Promise<string | undefined> {
        try {
            const entries = await this.provider.listDirectory('.github/workflows');
            if (!entries || entries.length === 0) return undefined;
            for (const entry of entries) {
                if (entry.type !== 'file') continue;
                const content = await this.provider.getFileContents('.github/workflows/' + entry.name);
                if (!content) continue;
                const detected = detectReporterInWorkflow(content);
                if (detected) return detected;
            }
        } catch (err) {
            rootLogger.debug(`GitHub: reporter prediction failed: ${extractErrorMessage(err)}`);
        }
        return undefined;
    }

    /** Fetch deployments only when the provider exposes `getDeployments`. */
    private async fetchDeployments(): Promise<Deployment[]> {
        const provider = this.provider as GitProvider & {
            getDeployments?: () => Promise<GitHubDeploymentRaw[]>;
        };
        if (typeof provider.getDeployments !== 'function') return [];
        try {
            const raw = await provider.getDeployments();
            if (!Array.isArray(raw)) return [];
            return raw.map((d) => this.mapDeployment(d)).filter((d): d is Deployment => d != null);
        } catch (err) {
            rootLogger.warn(`GitHub: deployments fetch failed: ${extractErrorMessage(err)}`);
            return [];
        }
    }

    private mapDeployment(d: GitHubDeploymentRaw): Deployment | null {
        const environment = typeof d.environment === 'string' ? d.environment : (d.environment?.name ?? '');
        if (!environment) return null;
        const createdAt = typeof d.created_at === 'string' ? d.created_at : '';
        if (!createdAt) return null;
        return {
            id: String(d.id),
            environment,
            status: typeof d.state === 'string' ? d.state : 'unknown',
            ...(typeof d.sha === 'string' ? { sha: d.sha } : {}),
            ...(typeof d.ref === 'string' ? { ref: d.ref } : {}),
            createdAt,
            ...(typeof d.updated_at === 'string' ? { updatedAt: d.updated_at } : {}),
            ...(typeof d.html_url === 'string' ? { url: d.html_url } : {}),
            confidence: 0.9,
        };
    }

    /** Fetch releases only when the provider exposes `getReleases`. */
    private async fetchReleases(): Promise<Release[]> {
        const provider = this.provider as Omit<GitProvider, 'getReleases'> & {
            getReleases?: () => Promise<GitHubReleaseRaw[]>;
        };
        if (typeof provider.getReleases !== 'function') return [];
        try {
            const raw = await provider.getReleases();
            if (!Array.isArray(raw)) return [];
            return raw.map((r) => this.mapRelease(r)).filter((r): r is Release => r != null);
        } catch (err) {
            rootLogger.warn(`GitHub: releases fetch failed: ${extractErrorMessage(err)}`);
            return [];
        }
    }

    private mapRelease(r: GitHubReleaseRaw): Release | null {
        const tag = typeof r.tag_name === 'string' ? r.tag_name : '';
        if (!tag) return null;
        const createdAt = typeof r.created_at === 'string' ? r.created_at : '';
        if (!createdAt) return null;
        return {
            id: String(r.id),
            tag,
            draft: Boolean(r.draft),
            prerelease: Boolean(r.prerelease),
            createdAt,
            ...(typeof r.name === 'string' ? { name: r.name } : {}),
            ...(typeof r.published_at === 'string' ? { publishedAt: r.published_at } : {}),
            ...(typeof r.author?.login === 'string' ? { author: r.author.login } : {}),
            ...(typeof r.html_url === 'string' ? { url: r.html_url } : {}),
            confidence: 0.9,
        };
    }

    /** Fetch security alerts only when the provider exposes `getSecurityAlerts`. */
    private async fetchSecurityFindings(): Promise<SecurityFinding[]> {
        const provider = this.provider as GitProvider & {
            getSecurityAlerts?: () => Promise<GitHubSecurityAlertRaw[]>;
        };
        if (typeof provider.getSecurityAlerts !== 'function') return [];
        try {
            const raw = await provider.getSecurityAlerts();
            if (!Array.isArray(raw)) return [];
            return raw.map((a) => this.mapSecurityFinding(a)).filter((f): f is SecurityFinding => f != null);
        } catch (err) {
            rootLogger.warn(`GitHub: security alerts fetch failed: ${extractErrorMessage(err)}`);
            return [];
        }
    }

    private mapSecurityFinding(a: GitHubSecurityAlertRaw): SecurityFinding | null {
        const tool =
            typeof a.html_url === 'string' && a.html_url.includes('secret-scanning')
                ? 'github-secret-scanning'
                : 'github-code-scanning';
        const advisory = a.security_advisory;
        const title = advisory?.summary ?? advisory?.description ?? 'unknown';
        if (!title || title === 'unknown') return null;
        const severity = (advisory?.severity ?? a.security_vulnerability?.severity ?? 'unknown') as SecuritySeverity;
        const rule = advisory?.cve_id ?? advisory?.ghsa_id;
        return {
            tool,
            severity,
            ...(rule ? { rule } : {}),
            title,
            ...(typeof a.html_url === 'string' ? { url: a.html_url } : {}),
            ...(typeof a.state === 'string' && ['open', 'dismissed', 'fixed'].includes(a.state)
                ? { state: a.state }
                : {}),
            confidence: 0.85,
        };
    }

    /** Fetch PM issues only when the provider exposes `getIssues`. */
    private async fetchPmIssues(): Promise<RawIssue[]> {
        const provider = this.provider as Omit<GitProvider, 'getIssues'> & {
            getIssues?: (state?: string) => Promise<GitHubIssueRaw[]>;
        };
        if (typeof provider.getIssues !== 'function') return [];
        try {
            const raw = await provider.getIssues();
            if (!Array.isArray(raw)) return [];
            return raw.map((i) => this.mapPmIssue(i)).filter((i): i is RawIssue => i != null);
        } catch (err) {
            rootLogger.warn(`GitHub: issues fetch failed: ${extractErrorMessage(err)}`);
            return [];
        }
    }

    private mapPmIssue(i: GitHubIssueRaw): RawIssue | null {
        const id = i.number;
        if (!Number.isFinite(id)) return null;
        const title = typeof i.title === 'string' ? i.title : '';
        if (!title) return null;
        const createdAt = typeof i.created_at === 'string' ? i.created_at : '';
        if (!createdAt) return null;
        return {
            source: 'github',
            id: String(id),
            key: id,
            title,
            state: typeof i.state === 'string' ? i.state : 'unknown',
            ...(typeof i.user?.login === 'string' ? { author: i.user.login } : {}),
            labels: Array.isArray(i.labels) ? i.labels.map((l) => (typeof l === 'string' ? l : l.name)) : [],
            createdAt,
            ...(typeof i.updated_at === 'string' ? { updatedAt: i.updated_at } : {}),
            ...(typeof i.html_url === 'string' ? { url: i.html_url } : {}),
            confidence: 0.9,
        };
    }

    /** Fetch pull requests only when the provider exposes `getPullRequests`. */
    private async fetchPullRequests(): Promise<RawPullRequest[]> {
        const provider = this.provider as GitProvider & {
            getPullRequests?: (state?: string) => Promise<GitHubPullRequestRaw[]>;
        };
        if (typeof provider.getPullRequests !== 'function') return [];
        try {
            const raw = await provider.getPullRequests();
            if (!Array.isArray(raw)) return [];
            return raw.map((p) => this.mapPullRequest(p)).filter((p): p is RawPullRequest => p != null);
        } catch (err) {
            rootLogger.warn(`GitHub: pull requests fetch failed: ${extractErrorMessage(err)}`);
            return [];
        }
    }

    private mapPullRequest(p: GitHubPullRequestRaw): RawPullRequest | null {
        if (!Number.isFinite(p.number)) return null;
        const reviewStates = this.aggregateReviewStates(p);
        const state: RawPullRequest['state'] = p.merged ? 'merged' : ((p.state as RawPullRequest['state']) ?? 'open');
        return {
            id: p.number,
            number: p.number,
            ...(typeof p.title === 'string' ? { title: p.title } : {}),
            state,
            ...(typeof p.html_url === 'string' ? { url: p.html_url } : {}),
            ...(typeof p.draft === 'boolean' ? { draft: p.draft } : {}),
            ...(typeof p.merged === 'boolean' ? { merged: p.merged } : {}),
            ...(typeof p.merged_at === 'string' ? { mergedAt: p.merged_at } : {}),
            ...(typeof p.user?.login === 'string' ? { author: p.user.login } : {}),
            labels: Array.isArray(p.labels) ? p.labels.map((l) => (typeof l === 'string' ? l : l.name)) : [],
            ...(reviewStates.length > 0 ? { reviewStates } : {}),
            confidence: 0.9,
        };
    }

    /** Aggregate review states from reviews[] + requested_reviewers[]. */
    private aggregateReviewStates(p: GitHubPullRequestRaw): string[] {
        const states: string[] = [];
        if (Array.isArray(p.reviews)) {
            for (const r of p.reviews) {
                if (typeof r.state === 'string') states.push(r.state);
            }
        }
        if (Array.isArray(p.requested_reviewers)) {
            for (let i = 0; i < p.requested_reviewers.length; i++) {
                states.push('requested');
            }
        }
        return states;
    }

    /**
     * LA-4 — Derive FailureRecords from parsed test artifacts (CTRF/Playwright/Allure)
     * that carry retries/flaky/file/line. NEVER fabricates: entries without those
     * fields are skipped, and records are only appended (merged with existing).
     */
    private extractArtifactFailureRecords(parsedArtifactsMap: Map<number, ArtifactParseResult[]>): FailureRecord[] {
        const records: FailureRecord[] = [];
        for (const arts of parsedArtifactsMap.values()) {
            for (const art of arts) {
                // LA-4 only derives failure records from CTRF test artifacts (the
                // format produced by Playwright/Allure CTRF reporters). junit and
                // mochawesome are ignored for LA-4 per contract.
                if (art.format !== 'ctrf') continue;
                for (const t of art.data.tests) {
                    const record = this.mapArtifactTestToFailureRecord(t, art.format);
                    if (record != null) records.push(record);
                }
            }
        }
        return records;
    }

    private mapArtifactTestToFailureRecord(t: FlatTestWithExtras, source: string): FailureRecord | null {
        const retries = typeof t.retries === 'number' ? t.retries : undefined;
        const flaky = typeof t.flaky === 'boolean' ? t.flaky : undefined;
        const file = this.resolveTestFile(t);
        const line = typeof t.line === 'number' ? t.line : undefined;
        if (retries == null && flaky == null && file == null && line == null) return null;
        return {
            name: t.title,
            status: this.mapTestState(t.state),
            ...(t.error ? { message: t.error } : {}),
            ...(file ? { file } : {}),
            ...(line != null ? { line } : {}),
            ...(retries != null ? { retries } : {}),
            ...(flaky != null ? { flaky } : {}),
            ...(flaky ? { category: 'environment' } : {}),
            confidence: 0.9,
            source,
        };
    }

    private resolveTestFile(extra: FlatTestWithExtras): string | undefined {
        if (typeof extra.file === 'string') return extra.file;
        if (typeof extra.filePath === 'string') return extra.filePath;
        return undefined;
    }

    private mapTestState(state: string | undefined): FailureRecord['status'] {
        if (state === 'failed') return 'failed';
        if (state === 'skipped') return 'skipped';
        return 'broken';
    }

    /**
     * Derive PerformanceMetrics from pipeline run timing + usage.
     * All numeric aggregates are Number.isFinite-guarded; a field is OMITTED when
     * no finite data exists (never reported as 0 / silently passing).
     */
    private derivePerformanceMetrics(
        runs: PipelineRun[],
        timingMap: Map<number, WorkflowRunTiming>,
    ): PerformanceMetrics | undefined {
        const duration = this.accumulateDuration(timingMap);
        const billable = this.accumulateBillable(timingMap);
        const wait = this.accumulateQueueWait(runs);

        const pipelineDurationMs = duration.has ? duration.sum : undefined;
        const billableMinutes = billable.has ? billable.sum / 60000 : undefined;
        const queueWaitMs = wait.count > 0 ? wait.sum / wait.count : undefined;

        if (pipelineDurationMs == null && billableMinutes == null && queueWaitMs == null) return undefined;

        return {
            ...(pipelineDurationMs != null ? { pipelineDurationMs } : {}),
            ...(billableMinutes != null ? { billableMinutes } : {}),
            ...(queueWaitMs != null ? { queueWaitMs } : {}),
            confidence: 0.9,
        };
    }

    private accumulateDuration(timingMap: Map<number, WorkflowRunTiming>): { sum: number; has: boolean } {
        let sum = 0;
        let has = false;
        for (const t of timingMap.values()) {
            if (Number.isFinite(t.run_duration_ms)) {
                sum += t.run_duration_ms;
                has = true;
            }
        }
        return { sum, has };
    }

    private accumulateBillable(timingMap: Map<number, WorkflowRunTiming>): { sum: number; has: boolean } {
        let sum = 0;
        let has = false;
        for (const t of timingMap.values()) {
            if (t.billable == null) continue;
            for (const os of Object.values(t.billable)) {
                if (Number.isFinite(os.total_ms)) {
                    sum += os.total_ms;
                    has = true;
                }
            }
        }
        return { sum, has };
    }

    private accumulateQueueWait(runs: PipelineRun[]): { sum: number; count: number } {
        let sum = 0;
        let count = 0;
        for (const r of runs) {
            const created = typeof r.created_at === 'string' ? Date.parse(r.created_at) : NaN;
            const started = typeof r.run_started_at === 'string' ? Date.parse(r.run_started_at) : NaN;
            if (!Number.isFinite(created) || !Number.isFinite(started)) continue;
            const delta = started - created;
            if (Number.isFinite(delta)) {
                sum += delta;
                count++;
            }
        }
        return { sum, count };
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
