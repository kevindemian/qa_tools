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
    DataProvider,
    FetchOptions,
    RawData,
    ComputedMetrics,
    FlakyResult,
    ReleaseScoreResult,
    HealthDimensions,
    TestCounts,
    DataHubPersistence,
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
     * @returns DataHub with raw data and computed metrics.
     */
    static async create(
        providers: DataProvider[],
        options: FetchOptions & DataHubOptions = { repo: '' },
        persistence?: DataHubPersistence,
    ): Promise<DataHubImpl> {
        const raw = await DataHubImpl.fetchFromProviders(providers, options);

        // Layer 7: User fallback when no parsed artifacts available
        if (raw.parsedArtifacts == null || raw.parsedArtifacts.size === 0) {
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
            }
        }

        const computed = DataHubImpl.computeMetrics(raw, options);
        const providerSource = DataHubImpl.determineProviderSource(providers);

        return new DataHubImpl(raw, computed, providerSource, options.repo, persistence);
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

    private static async fetchFromProviders(providers: DataProvider[], options: FetchOptions): Promise<RawData> {
        const results = await Promise.allSettled(providers.map((p) => p.fetchRawData(options)));

        const merged: RawData = {
            runs: [],
            jobs: new Map(),
            artifacts: new Map(),
            failureReasons: new Map(),
        };

        for (const result of results) {
            if (result.status === 'rejected') {
                rootLogger.debug(`DataHub: provider fetch rejected: ${String(result.reason)}`);
                continue;
            }
            DataHubImpl.mergeRawData(merged, result.value);
        }

        return merged;
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
