/**
 * Data Hub — Public types.
 *
 * Defines the DataHub interface, ComputedMetrics, RawData, and all derived
 * metric types that consumers use. This is the public contract
 * between the hub and its consumers.
 */
import type { PipelineRun, PipelineJob, ArtifactInfo, GitLabTestReport } from './ci-cd.js';
import type { ArtifactParseResult } from '../data-hub/artifact-parser.js';

/** Timing data for a workflow run (from GitHub timing endpoint). */
export interface WorkflowRunTiming {
    /** Total run duration in milliseconds. */
    run_duration_ms: number;
}

/** Raw data returned by providers. All fields optional to support partial data. */
export interface RawData {
    runs: PipelineRun[];
    jobs: Map<number, PipelineJob[]>;
    /** Artifacts metadata — stored for future use (e.g., artifact size analysis, download trends). */
    artifacts: Map<number, ArtifactInfo[]>;
    failureReasons: Map<number, string[]>;
    coverage?: RawCoverage;
    jiraIssues?: RawJiraIssue[];
    /** Timing data for each run, keyed by run ID. */
    timing?: Map<number, WorkflowRunTiming>;
    /** Parsed test artifacts (CTRF/JUnit/Mochawesome), keyed by run ID. */
    parsedArtifacts?: Map<number, ArtifactParseResult[]>;
    /** Detected test framework (e.g., 'vitest', 'jest', 'mocha'). */
    framework?: string;
    /** GitLab test report for the latest pipeline (GitLab-specific). */
    gitlabTestReport?: GitLabTestReport;
}

/** Coverage data from Istanbul/CTRF. */
export interface RawCoverage {
    total: number;
    covered: number;
    percentage: number;
    files?: { [key: string]: { total: number; covered: number; percentage: number } };
}

/** Simplified Jira issue. */
export interface RawJiraIssue {
    key: string;
    summary: string;
    status: string;
    type: string;
    labels: string[];
    created: string;
    updated: string;
    resolution?: string | undefined;
}

/** Options for fetching raw data from a provider. */
export interface FetchOptions {
    repo: string;
    count?: number;
    branch?: string;
    since?: Date;
}

/** Strategy interface — each provider adapts one data source. */
export interface DataProvider {
    readonly name: string;
    readonly source: 'github' | 'gitlab' | 'jira' | 'coverage';
    fetchRawData(options: FetchOptions): Promise<RawData>;
}

/** Flaky test/job detected across runs. */
export interface FlakyResult {
    /** Test or job name. */
    title: string;
    /** Failure rate (0-100). */
    rate: number;
    /** Number of runs analyzed. */
    runs: number;
}

/** Pipeline cost estimate. */
export interface CostEstimate {
    /** Total CI minutes consumed. */
    totalMinutes: number;
    /** Estimated cost in USD (based on costPerMinute). */
    estimatedCost: number;
}

/** A single trend data point. */
export interface TrendPoint {
    /** Date string (YYYY-MM-DD). */
    date: string;
    /** Pass rate for this date (0-100). */
    passRate: number;
    /** Number of runs on this date. */
    count: number;
}

/** Branch health summary. */
export interface BranchHealth {
    /** Pass rate for this branch (0-100). */
    passRate: number;
    /** Number of runs on this branch. */
    count: number;
}

/** A top failing job entry. */
export interface FailingJob {
    /** Job name. */
    name: string;
    /** Failure rate (0-100). */
    failureRate: number;
    /** Number of failures. */
    count: number;
}

/** A common failure reason pattern. */
export interface FailureReason {
    /** Pattern extracted from logs. */
    pattern: string;
    /** Number of occurrences. */
    count: number;
}

/** Health score for a single dimension. */
export interface DimensionScore {
    /** Score (0-100). */
    score: number;
    /** Whether the dimension passes the threshold. */
    status: 'pass' | 'fail';
}

/** All five health score dimensions. */
export interface HealthDimensions {
    passRate: DimensionScore;
    flakyRate: DimensionScore;
    coverage: DimensionScore;
    suiteSpeed: DimensionScore;
    executionRate: DimensionScore;
}

/** Release score breakdown. */
export interface ReleaseScoreResult {
    /** Overall release score (0-100). */
    score: number;
    /** Individual dimension scores. */
    dimensions: HealthDimensions;
    /** Grade (A-F). */
    grade: string;
}

/** Quarantine status for flaky tests. */
export interface QuarantineStatus {
    /** Number of flaky tests detected. */
    flakyCount: number;
    /** Number of tests currently quarantined. */
    quarantinedCount: number;
}

/** Aggregated test counts from parsed artifacts. */
export interface TestCounts {
    passed: number;
    failed: number;
    skipped: number;
    total: number;
}

/** All computed metrics from the hub. */
export interface ComputedMetrics {
    passRate: number;
    avgDuration: number;
    suiteSpeedP95: number;
    flakyRate: FlakyResult[];
    coverage: number;
    pipelineCost: CostEstimate;
    defectTrends: TrendPoint[];
    branchBreakdown: { [key: string]: BranchHealth };
    topFailingJobs: FailingJob[];
    topFailureReasons: FailureReason[];
    releaseScore: ReleaseScoreResult;
    quarantineStatus: QuarantineStatus;
    /** Test pass rate from parsed artifacts (0-100). 0 if no test data available. */
    testPassRate: number;
    /** Aggregated test counts from parsed artifacts. */
    testCounts: TestCounts;
    /** Detected test framework. */
    framework: string;
}

/** The Data Hub — single source of truth. */
export interface DataHub {
    /** Raw data from providers. */
    readonly raw: RawData;
    /** Computed metrics. */
    readonly computed: ComputedMetrics;
    /** When the hub was created. */
    readonly timestamp: Date;
    /** Provider source. */
    readonly provider: 'github' | 'gitlab';
    /** Repository identifier. */
    readonly repo: string;
}
