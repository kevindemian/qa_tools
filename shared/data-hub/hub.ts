/**
 * Data Hub — Hub (Orchestration Layer).
 *
 * Orchestrates providers to fetch raw data and compute functions to calculate
 * metrics. Returns a DataHub object with raw data and computed metrics.
 *
 * @reference SOLID — Single Responsibility: only orchestrates, does not compute
 */
import type {
    DataHub,
    DataHubResult,
    DataProvider,
    FetchOptions,
    RawData,
    ComputedMetrics,
    FlakyResult,
    ReleaseScoreResult,
    HealthDimensions,
    TestCounts,
    DataHubPersistence,
    MetricsStore,
} from '../types/data-hub.js';
import type { PipelineRun, PipelineJob } from '../types/ci-cd.js';
import type { ArtifactParseResult } from './artifact-parser.js';
import { rootLogger } from '../logger.js';
import { askTestSource } from './test-source-fallback.js';
import type { FallbackResult } from './test-source-fallback.js';
import {
    calcPipelinePassRate,
    calcAvgDuration,
    calcSuiteSpeedP95,
    calcFlakyFromPipelineRuns,
    calcTopFailureReasons,
    calcBranchBreakdown,
    calcTopFailingJobs,
    calcCoverageFromRaw,
    calcPipelineCost,
    calcReleaseScore,
    calcQuarantineStatus,
    calcTrendsFromPipelineRuns,
    makeDimensionScore,
    calcExecutionRate,
    calcFlakyPercentage,
    calcPerRunCosts,
    convertToMetricsRuns,
    calcFlakinessEntries,
    calcMetricsTrends,
    calculateFlakyTestRate,
    calcTestDurationP95,
    calcRunFailureRate,
    calcTestDurationMap,
} from './compute/index.js';

/** Options for creating a DataHub. */
export interface DataHubOptions {
    /** Number of recent runs to fetch. Default: 30. */
    count?: number;
    /** Cost per minute for pipeline cost estimation. */
    costPerMinute?: number;
}

/**
 * DataHubImpl — orchestrates providers and compute functions.
 *
 * Implements the DataHub interface by:
 * 1. Fetching raw data from providers
 * 2. Computing all metrics using pure compute functions
 * 3. Returning a DataHub object
 */
export class DataHubImpl implements DataHub {
    readonly raw: RawData;
    readonly computed: ComputedMetrics;
    readonly persistence?: DataHubPersistence | undefined;
    readonly timestamp: Date;
    readonly provider: 'github' | 'gitlab';
    readonly repo: string;

    private constructor(
        raw: RawData,
        computed: ComputedMetrics,
        provider: 'github' | 'gitlab',
        repo: string,
        persistence?: DataHubPersistence,
    ) {
        this.raw = raw;
        this.computed = computed;
        this.persistence = persistence;
        this.timestamp = new Date();
        this.provider = provider;
        this.repo = repo;
    }

    /**
     * Create a DataHub by fetching data from providers and computing metrics.
     *
     * Layer 7 cascade: When no parsed artifacts are available after provider fetch,
     * automatically prompts user for a local test file (TTY only, silent in CI).
     *
     * @param providers - Data providers to fetch from.
     * @param options - Fetch and compute options.
     * @param persistence - Optional persistence layer for historical data.
     * @returns DataHubResult with hub, status, and optional warning.
     */
    private static async applyLayer7Fallback(raw: RawData): Promise<{ skipped: boolean; noFile: boolean }> {
        if (raw.parsedArtifacts != null && raw.parsedArtifacts.size > 0) {
            return { skipped: false, noFile: false };
        }
        const fallback = await DataHubImpl.requestUserFallback();
        if (fallback.data != null) {
            raw.parsedArtifacts = new Map([
                [
                    0,
                    [
                        {
                            fileName: fallback.source ?? 'user-fallback',
                            data: fallback.data,
                            format: 'ctrf',
                        },
                    ],
                ],
            ]);
            raw.framework = raw.framework ?? 'unknown';
            return { skipped: false, noFile: false };
        }
        if (fallback.error === 'NO_TTY' || fallback.error === 'NO_DATA_SOURCE') {
            return { skipped: true, noFile: false };
        }
        return { skipped: false, noFile: true };
    }

    private static buildResult(
        hub: DataHubImpl,
        status: 'ok' | 'warning',
        warning?: { code: string; message: string },
        partialData = false,
    ): DataHubResult {
        const result: DataHubResult = { hub, status };
        if (warning) result.warning = warning;
        if (partialData) result.partialData = true;
        return result;
    }

    static async create(
        providers: DataProvider[],
        options: FetchOptions & DataHubOptions = { repo: '' },
        persistence?: DataHubPersistence,
    ): Promise<DataHubResult> {
        const { raw, providerFailures } = await DataHubImpl.fetchFromProviders(providers, options);
        const allProvidersFailed = providerFailures > 0 && providerFailures >= providers.length;
        const someProvidersFailed = providerFailures > 0 && !allProvidersFailed;

        const { skipped: layer7Skipped, noFile: layer7NoFile } = await DataHubImpl.applyLayer7Fallback(raw);

        const computed = DataHubImpl.computeMetrics(raw, options);
        const providerSource = DataHubImpl.determineProviderSource(providers);
        const hub = new DataHubImpl(raw, computed, providerSource, options.repo, persistence);

        const hasData = raw.runs.length > 0 || (raw.parsedArtifacts != null && raw.parsedArtifacts.size > 0);
        if (!hasData) {
            return DataHubImpl.buildResult(
                hub,
                'warning',
                {
                    code: allProvidersFailed ? 'PROVIDERS_ALL_FAILED' : 'PROVIDERS_PARTIAL',
                    message: allProvidersFailed
                        ? 'All providers failed — no CI data available'
                        : 'Some providers failed — data may be partial',
                },
                someProvidersFailed,
            );
        }

        if (allProvidersFailed) {
            return DataHubImpl.buildResult(
                hub,
                'warning',
                {
                    code: 'PROVIDERS_ALL_FAILED',
                    message: 'All providers failed — using fallback data',
                },
                true,
            );
        }

        if (layer7Skipped) {
            return DataHubImpl.buildResult(
                hub,
                'warning',
                {
                    code: 'LAYER7_SKIPPED',
                    message: 'Layer 7 skipped — no TTY available and no TEST_REPORT_PATH set',
                },
                someProvidersFailed,
            );
        }

        if (layer7NoFile) {
            return DataHubImpl.buildResult(
                hub,
                'warning',
                {
                    code: 'LAYER7_NO_FILE',
                    message: 'Layer 7 requested file but no valid file was provided',
                },
                someProvidersFailed,
            );
        }

        if (someProvidersFailed) {
            return DataHubImpl.buildResult(
                hub,
                'ok',
                {
                    code: 'PROVIDERS_PARTIAL',
                    message: 'Some providers failed — data may be partial',
                },
                true,
            );
        }

        return DataHubImpl.buildResult(hub, 'ok');
    }

    /**
     * Create an empty DataHub (fallback when fetch fails).
     */
    static createEmpty(provider: 'github' | 'gitlab', repo: string): DataHubImpl {
        const raw: RawData = {
            runs: [],
            jobs: new Map(),
            artifacts: new Map(),
            failureReasons: new Map(),
        };
        const computed = DataHubImpl.computeMetrics(raw, { repo });
        return new DataHubImpl(raw, computed, provider, repo);
    }

    /**
     * Create a DataHub from persisted MetricsStore data.
     *
     * Converts MetricsRun[] → PipelineRun[] and CoverageSnapshot[] → RawCoverage,
     * then computes all metrics. No CI providers needed — data comes from persistence.
     */
    static loadFromStore(store: MetricsStore, repo: string, persistence?: DataHubPersistence): DataHubImpl {
        const runs: PipelineRun[] = store.runs.map((m, i) => ({
            id: i,
            run_number: i,
            head_branch: m.project || 'unknown',
            status: 'completed',
            conclusion: m.passed > m.failed ? 'success' : 'failure',
            created_at: m.timestamp,
            event: 'push',
            tests: m.tests,
            run_duration_ms: m.duration,
        }));

        const coverageHistory = store.coverageHistory ?? [];
        const lastSnapshot = coverageHistory[coverageHistory.length - 1];
        const coverage =
            lastSnapshot != null
                ? {
                      total: lastSnapshot.totalIssues,
                      covered: lastSnapshot.mappedIssues,
                      percentage: lastSnapshot.coveragePct,
                  }
                : undefined;

        const raw: RawData = {
            runs,
            jobs: new Map(),
            artifacts: new Map(),
            failureReasons: new Map(),
        };
        if (coverage != null) {
            raw.coverage = coverage;
        }

        const computed = DataHubImpl.computeMetrics(raw, { repo });
        return new DataHubImpl(raw, computed, 'github', repo, persistence);
    }

    private static async fetchFromProviders(
        providers: DataProvider[],
        options: FetchOptions,
    ): Promise<{ raw: RawData; providerFailures: number }> {
        const results = await Promise.allSettled(providers.map((p) => p.fetchRawData(options)));

        const merged: RawData = {
            runs: [],
            jobs: new Map(),
            artifacts: new Map(),
            failureReasons: new Map(),
        };

        let providerFailures = 0;
        for (const result of results) {
            if (result.status === 'rejected') {
                rootLogger.warn(`DataHub: provider fetch rejected: ${String(result.reason)}`);
                providerFailures++;
                continue;
            }
            DataHubImpl.mergeRawData(merged, result.value);
        }

        return { raw: merged, providerFailures };
    }

    private static mergeRawData(target: RawData, source: RawData): void {
        target.runs.push(...source.runs);

        for (const [key, value] of source.jobs) {
            target.jobs.set(key, value);
        }
        for (const [key, value] of source.artifacts) {
            target.artifacts.set(key, value);
        }
        for (const [key, value] of source.failureReasons) {
            target.failureReasons.set(key, value);
        }

        DataHubImpl.mergeFirstNonNull(target, source);
        DataHubImpl.mergeMaps(target, source);
    }

    private static mergeFirstNonNull(target: RawData, source: RawData): void {
        if (source.coverage != null && target.coverage == null) target.coverage = source.coverage;
        if (source.jiraIssues != null && target.jiraIssues == null) target.jiraIssues = source.jiraIssues;
        if (source.framework != null && target.framework == null) target.framework = source.framework;
        if (source.gitlabTestReport != null && target.gitlabTestReport == null) {
            target.gitlabTestReport = source.gitlabTestReport;
        }
        if (source.commitLog && !target.commitLog) target.commitLog = source.commitLog;
        if (source.ciRuns && source.ciRuns.length > 0 && (!target.ciRuns || target.ciRuns.length === 0)) {
            target.ciRuns = source.ciRuns;
        }
    }

    private static mergeMaps(target: RawData, source: RawData): void {
        if (source.timing != null) {
            if (target.timing == null) target.timing = new Map();
            for (const [key, value] of source.timing) target.timing.set(key, value);
        }
        if (source.parsedArtifacts != null) {
            if (target.parsedArtifacts == null) target.parsedArtifacts = new Map();
            for (const [key, value] of source.parsedArtifacts) target.parsedArtifacts.set(key, value);
        }
    }

    private static computeMetrics(raw: RawData, options: FetchOptions & DataHubOptions): ComputedMetrics {
        const passRate = calcPipelinePassRate(raw.runs);
        const avgDuration = calcAvgDuration(raw.runs, raw.timing);
        const suiteSpeedP95 = calcSuiteSpeedP95(raw.jobs, raw.timing);
        const flakyRate = calcFlakyFromPipelineRuns(raw.runs, raw.jobs);
        const coverage = DataHubImpl.computeCoverage(raw);
        const pipelineCost = calcPipelineCost(raw.runs, options.costPerMinute);
        const branchBreakdown = calcBranchBreakdown(raw.runs);
        const topFailingJobs = calcTopFailingJobs(raw.runs, raw.jobs);
        const topFailureReasons = calcTopFailureReasons(raw.failureReasons);
        const defectTrends = calcTrendsFromPipelineRuns(raw.runs);
        const executionRate = calcExecutionRate(raw.runs);
        const flakyPercentage = calcFlakyPercentage(flakyRate, raw.runs, raw.jobs);
        const perRunCosts = calcPerRunCosts(raw.runs, options.costPerMinute);
        const metricsRuns = raw.parsedArtifacts != null ? convertToMetricsRuns(raw.parsedArtifacts) : [];
        const flakinessEntries = calcFlakinessEntries(metricsRuns);
        const metricsTrends = calcMetricsTrends(metricsRuns);
        // ─── SSOT expansion — test-level metrics ────────────────────────────
        const flakyTestRate = metricsRuns.length > 0 ? calculateFlakyTestRate(metricsRuns) : 0;
        const testDurationP95 = metricsRuns.length > 0 ? calcTestDurationP95(metricsRuns) : 0;
        const runFailureRate = metricsRuns.length > 0 ? calcRunFailureRate(metricsRuns) : 0;
        const testDurationMap =
            metricsRuns.length > 0
                ? calcTestDurationMap(metricsRuns)
                : (Object.create(null) as Record<string, number[]>);
        const releaseScore = DataHubImpl.computeReleaseScore(
            passRate,
            flakyRate,
            coverage,
            suiteSpeedP95,
            raw.runs,
            raw.jobs,
        );
        const quarantineStatus = calcQuarantineStatus(flakyRate);
        const testCounts = DataHubImpl.aggregateTestCounts(raw.parsedArtifacts);
        const testPassRate =
            testCounts.total > 0 ? Math.round((testCounts.passed / testCounts.total) * 100 * 100) / 100 : 0;
        const framework = raw.framework ?? 'unknown';

        return {
            passRate,
            avgDuration,
            suiteSpeedP95,
            flakyRate,
            coverage,
            pipelineCost,
            defectTrends,
            branchBreakdown,
            topFailingJobs,
            topFailureReasons,
            releaseScore,
            quarantineStatus,
            testPassRate,
            testCounts,
            framework,
            executionRate,
            flakyPercentage,
            perRunCosts,
            metricsRuns,
            flakinessEntries,
            metricsTrends,
            flakyTestRate,
            testDurationP95,
            runFailureRate,
            testDurationMap,
        };
    }

    private static computeCoverage(raw: RawData): number {
        if (raw.coverage == null) return 0;
        const result = calcCoverageFromRaw(raw.coverage);
        return result.total;
    }

    private static aggregateTestCounts(parsedArtifacts: Map<number, ArtifactParseResult[]> | undefined): TestCounts {
        const counts: TestCounts = { passed: 0, failed: 0, skipped: 0, total: 0 };
        if (parsedArtifacts == null) return counts;
        for (const artifacts of parsedArtifacts.values()) {
            for (const artifact of artifacts) {
                counts.passed += artifact.data.stats.passed;
                counts.failed += artifact.data.stats.failed;
                counts.skipped += artifact.data.stats.skipped;
                counts.total += artifact.data.stats.total;
            }
        }
        return counts;
    }

    private static computeReleaseScore(
        passRate: number,
        flakyRate: FlakyResult[],
        coverage: number,
        suiteSpeedP95: number,
        runs: PipelineRun[],
        jobs: Map<number, PipelineJob[]>,
    ): ReleaseScoreResult {
        const flakyPercentage = calcFlakyPercentage(flakyRate, runs, jobs);
        const executionRate = calcExecutionRate(runs);

        const dimensions: HealthDimensions = {
            passRate: makeDimensionScore(passRate, 95),
            flakyRate: makeDimensionScore(100 - flakyPercentage, 95),
            coverage: makeDimensionScore(coverage, 80),
            suiteSpeed: makeDimensionScore(DataHubImpl.normalizeSuiteSpeed(suiteSpeedP95), 80),
            executionRate: makeDimensionScore(executionRate, 95),
        };

        return calcReleaseScore(dimensions);
    }

    private static normalizeSuiteSpeed(suiteSpeedP95: number): number {
        if (suiteSpeedP95 <= 1000) return 100;
        if (suiteSpeedP95 >= 3000) return 0;
        return Math.round(((3000 - suiteSpeedP95) / (3000 - 1000)) * 100 * 100) / 100;
    }

    private static determineProviderSource(providers: DataProvider[]): 'github' | 'gitlab' {
        for (const p of providers) {
            if (p.source === 'github') return 'github';
            if (p.source === 'gitlab') return 'gitlab';
        }
        return 'github';
    }

    /**
     * Request user fallback for test data when hub has no parsed artifacts.
     *
     * Activates Layer 7 (User Fallback) — prompts user for a local test file
     * in TTY mode. Returns null in CI (non-TTY).
     *
     * @returns FallbackResult with parsed data, or null if no fallback needed/available.
     */
    static async requestUserFallback(): Promise<FallbackResult> {
        const result = await askTestSource();
        if (result.data != null) {
            rootLogger.debug(`User fallback: received data from ${result.source ?? 'unknown'}`);
        }
        return result;
    }
}

/**
 * Check if new raw data has changed compared to a cached hub.
 *
 * Compares run IDs, update timestamps, coverage, and jira issue counts.
 * Used by prefetch orchestrator to decide whether to rebuild the hub.
 *
 * @param cachedHub - Previously cached DataHub.
 * @param newRaw - Fresh raw data from provider.
 * @returns true if data has changed.
 */
export function hasDataChanged(cachedHub: DataHub, newRaw: RawData): boolean {
    const oldRuns = cachedHub.raw.runs;
    const newRuns = newRaw.runs;

    if (oldRuns.length !== newRuns.length) return true;

    const oldRunMap = new Map<string | number, PipelineRun>();
    for (const run of oldRuns) {
        if (run.id != null) {
            oldRunMap.set(run.id, run);
        }
    }

    for (const newRun of newRuns) {
        if (newRun.id == null) return true;
        const oldRun = oldRunMap.get(newRun.id);
        if (oldRun == null) return true;
        if (oldRun.updated_at !== newRun.updated_at) return true;
    }

    // Compare coverage percentage
    const oldCoverage = cachedHub.raw.coverage?.percentage ?? 0;
    const newCoverage = newRaw.coverage?.percentage ?? 0;
    if (oldCoverage !== newCoverage) return true;

    // Compare Jira issue count
    const oldJiraCount = cachedHub.raw.jiraIssues?.length ?? 0;
    const newJiraCount = newRaw.jiraIssues?.length ?? 0;
    if (oldJiraCount !== newJiraCount) return true;

    return false;
}
