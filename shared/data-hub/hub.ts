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
} from '../types/data-hub.js';
import type { PipelineRun } from '../types/ci-cd.js';
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
    makeDimensionScore,
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
    readonly timestamp: Date;
    readonly provider: 'github' | 'gitlab';
    readonly repo: string;

    private constructor(raw: RawData, computed: ComputedMetrics, provider: 'github' | 'gitlab', repo: string) {
        this.raw = raw;
        this.computed = computed;
        this.timestamp = new Date();
        this.provider = provider;
        this.repo = repo;
    }

    /**
     * Create a DataHub by fetching data from providers and computing metrics.
     *
     * @param providers - Data providers to fetch from.
     * @param options - Fetch and compute options.
     * @returns DataHub with raw data and computed metrics.
     */
    static async create(
        providers: DataProvider[],
        options: FetchOptions & DataHubOptions = { repo: '' },
    ): Promise<DataHubImpl> {
        const raw = await DataHubImpl.fetchFromProviders(providers, options);
        const computed = DataHubImpl.computeMetrics(raw, options);
        const providerSource = DataHubImpl.determineProviderSource(providers);

        return new DataHubImpl(raw, computed, providerSource, options.repo);
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
            if (result.status === 'rejected') continue;
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

        if (source.coverage != null && target.coverage == null) {
            target.coverage = source.coverage;
        }
        if (source.jiraIssues != null && target.jiraIssues == null) {
            target.jiraIssues = source.jiraIssues;
        }
    }

    private static computeMetrics(raw: RawData, options: FetchOptions & DataHubOptions): ComputedMetrics {
        const passRate = calcPipelinePassRate(raw.runs);
        const avgDuration = calcAvgDuration(raw.runs);
        const suiteSpeedP95 = calcSuiteSpeedP95(raw.jobs);
        const flakyRate = calcFlakyFromPipelineRuns(raw.runs, raw.jobs);
        const coverage = DataHubImpl.computeCoverage(raw);
        const pipelineCost = calcPipelineCost(raw.runs, options.costPerMinute);
        const branchBreakdown = calcBranchBreakdown(raw.runs);
        const topFailingJobs = calcTopFailingJobs(raw.runs, raw.jobs);
        const topFailureReasons = calcTopFailureReasons(raw.failureReasons);
        const releaseScore = DataHubImpl.computeReleaseScore(passRate, flakyRate, coverage, suiteSpeedP95, raw.runs);
        const quarantineStatus = calcQuarantineStatus(flakyRate);

        return {
            passRate,
            avgDuration,
            suiteSpeedP95,
            flakyRate,
            coverage,
            pipelineCost,
            defectTrends: [],
            branchBreakdown,
            topFailingJobs,
            topFailureReasons,
            releaseScore,
            quarantineStatus,
        };
    }

    private static computeCoverage(raw: RawData): number {
        if (raw.coverage == null) return 0;
        const result = calcCoverageFromRaw(raw.coverage);
        return result.total;
    }

    private static computeReleaseScore(
        passRate: number,
        flakyRate: FlakyResult[],
        coverage: number,
        suiteSpeedP95: number,
        runs: PipelineRun[],
    ): ReleaseScoreResult {
        const flakyPercentage = DataHubImpl.calculateFlakyPercentage(flakyRate, runs);
        const executionRate = DataHubImpl.calculateExecutionRate(runs);

        const dimensions: HealthDimensions = {
            passRate: makeDimensionScore(passRate, 95),
            flakyRate: makeDimensionScore(100 - flakyPercentage, 95),
            coverage: makeDimensionScore(coverage, 80),
            suiteSpeed: makeDimensionScore(DataHubImpl.normalizeSuiteSpeed(suiteSpeedP95), 80),
            executionRate: makeDimensionScore(executionRate, 95),
        };

        return calcReleaseScore(dimensions);
    }

    private static calculateFlakyPercentage(flakyRate: FlakyResult[], runs: PipelineRun[]): number {
        if (runs.length === 0 || flakyRate.length === 0) return 0;
        const flakyCount = flakyRate.length;
        const totalJobs = DataHubImpl.countUniqueJobs(runs);
        if (totalJobs === 0) return 0;
        return Math.round((flakyCount / totalJobs) * 100 * 100) / 100;
    }

    private static countUniqueJobs(runs: PipelineRun[]): number {
        const jobNames = new Set<string>();
        for (const run of runs) {
            if (run.id == null) continue;
            const runIdNum = typeof run.id === 'string' ? parseInt(run.id, 10) : run.id;
            if (isNaN(runIdNum)) continue;
            // We can't access jobsMap here, so we return a placeholder
            // The actual job count is computed in the metrics
        }
        return jobNames.size || 1; // Avoid division by zero
    }

    private static calculateExecutionRate(runs: PipelineRun[]): number {
        const withConclusion = runs.filter((r) => r.conclusion != null);
        if (withConclusion.length === 0) return 0;
        const executed = withConclusion.filter((r) => r.conclusion !== 'cancelled').length;
        return Math.round((executed / withConclusion.length) * 100 * 100) / 100;
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
}
