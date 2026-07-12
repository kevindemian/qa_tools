/**
 * Data Hub — Public types.
 *
 * Defines the DataHub interface, ComputedMetrics, RawData, and all derived
 * metric types that consumers use. This is the public contract
 * between the hub and its consumers.
 *
 * DataHub is the SINGLE interface for ALL data operations.
 * Consumers NEVER download, parse, calculate, or persist — they only read
 * from DataHub.raw.*, DataHub.computed.*, and DataHub.persistence.*.
 */
import type { PipelineRun, PipelineJob, ArtifactInfo, GitLabTestReport } from './ci-cd.js';
import type { ArtifactParseResult } from '../data-hub/artifact-parser.js';
import type { FlatTest, ParseResult } from '../result_parser.js';
import type { CoverageSnapshot } from './coverage.js';
import type { QualityReport, QualityCategory } from '../data-hub/quality.js';

/** Quality engineering metrics snapshot — invariant fire rates, layer pass rates, drift detection. */
export interface QualityMetricsSnapshot {
    /** ISO timestamp of the snapshot. */
    timestamp: string;
    /** Count of fires per invariant ID. */
    invariantFireCount: Record<string, number>;
    /** Pass rates per layer (0-1). */
    layerPassRates: { layer1: number; layer2: number; layer3: number };
    /** Total attempts per layer. */
    layerAttempts: { layer1: number; layer2: number; layer3: number };
    /** Count of artifacts by type. */
    artifactTypeCounts: Record<string, number>;
    /** Average structure score (0-1). */
    avgStructureScore: number;
}

/** Re-export FlatTest for consumers that need test-level data. */
export type { FlatTest } from '../result_parser.js';

/** Re-export CoverageSnapshot for consumers that need coverage history. */
export type { CoverageSnapshot } from './coverage.js';

/** Timing data for a workflow run (from GitHub timing endpoint). */
export interface WorkflowRunTiming {
    /** Total run duration in milliseconds. */
    run_duration_ms: number;
}

/** Data provenance — tracks where data came from and confidence level. */
export interface DataSource {
    /** Confidence level (0-1) in the data quality. */
    confidence: number;
    /** Source identifier (e.g., 'github-api', 'gitlab-api', 'local-parse'). */
    source: string;
    /** ISO timestamp when data was fetched. */
    timestamp: string;
}

/** Raw data returned by providers. All fields optional to support partial data. */
export interface RawData {
    runs: PipelineRun[];
    jobs: Map<number, PipelineJob[]>;
    /** Artifacts metadata — stored for future use (e.g., artifact size analysis, download trends). */
    artifacts: Map<number, ArtifactInfo[]>;
    failureReasons: Map<number, string[]>;
    coverage?: RawCoverage;
    /** Historical coverage snapshots — enables coverage trend analysis without loadMetricsStore(). */
    coverageHistory?: CoverageSnapshot[];
    jiraIssues?: RawJiraIssue[];
    /** Timing data for each run, keyed by run ID. */
    timing?: Map<number, WorkflowRunTiming>;
    /** Parsed test artifacts (CTRF/JUnit/Mochawesome), keyed by run ID. */
    parsedArtifacts?: Map<number, ArtifactParseResult[]>;
    /** Detected test framework (e.g., 'vitest', 'jest', 'mocha'). */
    framework?: string;
    /** GitLab test report for the latest pipeline (GitLab-specific). */
    gitlabTestReport?: GitLabTestReport;
    /** Commit log — formatted string of recent commits from CI workflow runs. */
    commitLog?: string;
    /** CI run statistics derived from workflow runs — pass/fail/skip counts per run. */
    ciRuns?: CiRunStats[];
    /** Failure classifications from MetricsStore — preserved for aggregateDefectTrends/Seasonality. */
    failureClassifications?: FailureClassification[];
    /** Data provenance — tracks source and confidence for each data category. */
    provenance?: Map<string, DataSource>;
    /** Xray Cloud test execution data (raw, mapped from GraphQL). */
    xray?: RawXrayData;
    /** Structured failure records (CTRF/Allure-aligned) — replaces string failureReasons for analysis. */
    failureRecords?: FailureRecord[];
    /** Security findings (SAST/DAST/dependency/container/secret/code-scanning/Dependabot). */
    securityFindings?: SecurityFinding[];
    /** Deployments to environments. */
    deployments?: Deployment[];
    /** Releases/tags published from the versionador. */
    releases?: Release[];
    /** DORA metrics. */
    doraMetrics?: DoraMetrics;
    /** Generic project-manager issues (GitHub Issues / GitLab Issues). */
    pmIssues?: RawIssue[];
    /** Per-file coverage breakdown. */
    coverageFiles?: CoverageFile[];
    /** Performance metrics extracted from CI. */
    performanceMetrics?: PerformanceMetrics;
}

/** CI pipeline run statistics — derived from workflow run artifacts. */
export interface CiRunStats {
    runId: number | string;
    createdAt: string;
    passed: number;
    failed: number;
    skipped: number;
    total: number;
}

/** Coverage data from Istanbul/CTRF. */
export interface RawCoverage {
    total: number;
    covered: number;
    percentage: number;
    files?: { [key: string]: { total: number; covered: number; percentage: number } };
}

/** Simplified Jira issue — deep extraction (última gota do SSOT).
 *  Campos opcionais preservam compatibilidade com consumidores existentes. */
export interface RawJiraIssue {
    key: string;
    summary: string;
    status: string;
    /** Categoria de status (ex.: 'Done', 'In Progress') quando disponível. */
    statusCategory?: string | undefined;
    type: string;
    /** Prioridade (ex.: 'High', 'Medium'). */
    priority?: string | undefined;
    /** Usuário assignee (displayName). */
    assignee?: string | undefined;
    /** Usuário reporter (displayName). */
    reporter?: string | undefined;
    /** Componentes do issue. */
    components: string[];
    /** Versões alvo (fix versions). */
    fixVersions: string[];
    /** Sprint (nome) quando presente. */
    sprint?: string | undefined;
    /** Story points quando presentes. */
    storyPoints?: number | undefined;
    /** Issue pai (epic/Parent) quando presente. */
    parentKey?: string | undefined;
    labels: string[];
    created: string;
    updated: string;
    resolution?: string | undefined;
    /** Data de resolução (resolutiondate) quando resolvido. */
    resolutionDate?: string | undefined;
}

/** A single Xray Cloud test run (within a test execution). */
export interface RawXrayTestRun {
    /** Xray test run ID. */
    id: string;
    /** Linked test issue key (e.g. CALC-123). */
    testKey?: string | undefined;
    /** Execution status (PASSED / FAILED / SKIPPED / EXECUTING / PENDING). */
    status: string;
    /** Parent test execution key. */
    testExecutionKey?: string | undefined;
    /** ISO timestamp when the run started. */
    startedOn?: string | undefined;
    /** ISO timestamp when the run finished. */
    finishedOn?: string | undefined;
    /** Free-text comment / evidence. */
    comment?: string | undefined;
}

/** A single Xray Cloud test execution (aggregates test runs). */
export interface RawXrayTestExecution {
    /** Test Execution issue key (e.g. CALC-456). */
    key: string;
    summary?: string | undefined;
    status?: string | undefined;
    startedOn?: string | undefined;
    finishedOn?: string | undefined;
    testRunCount?: number | undefined;
    passed?: number | undefined;
    failed?: number | undefined;
    skipped?: number | undefined;
    total?: number | undefined;
}

/** Raw Xray Cloud data mapped from GraphQL. */
export interface RawXrayData {
    testExecutions: RawXrayTestExecution[];
    testRuns: RawXrayTestRun[];
}

/**
 * Failure record — CTRF/Allure-aligned canonical form for a single test failure.
 * Replaces ad-hoc string-based failure reasons. `confidence`/`source` enforce the
 * SSOT quality gate (AGENTS §24.1 / §25): every failure carries provenance.
 */
export interface FailureRecord {
    /** Test name. */
    name: string;
    /** Suite/path the test belongs to. */
    suite?: string | undefined;
    /** CTRF status: failed (product defect) vs broken (infra/environment). */
    status: 'failed' | 'broken' | 'skipped';
    /** Human-readable failure message. */
    message?: string | undefined;
    /** Full stack trace. */
    trace?: string | undefined;
    /** Source file (nullable — future enrichment may populate). */
    file?: string | undefined;
    /** Line number in source file. */
    line?: number | undefined;
    /** Duration in ms. */
    duration?: number | undefined;
    /** Retry count (CTRF flaky detection). */
    retries?: number | undefined;
    /** Whether the test is flaky (CTRF/Allure). */
    flaky?: boolean | undefined;
    /** Root-cause bucket (assertion | timeout | network | panic | known-bug | environment). */
    category?: string | undefined;
    /** Confidence in the extraction (0-1). */
    confidence: number;
    /** Provenance source (e.g., 'check-run-annotation', 'junit', 'log'). */
    source: string;
}

/** Severity of a security finding. */
export type SecuritySeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

/** A single security finding (SAST/DAST/dependency/container/secret/code-scanning/Dependabot). */
export interface SecurityFinding {
    /** Tool that produced the finding. */
    tool: string;
    severity: SecuritySeverity;
    /** Rule ID (e.g., CWE, gitleaks rule). */
    rule?: string | undefined;
    title: string;
    description?: string | undefined;
    file?: string | undefined;
    line?: number | undefined;
    /** Deep-link to the finding. */
    url?: string | undefined;
    /** open | dismissed | fixed. */
    state?: string | undefined;
    cwe?: string | undefined;
    /** Confidence in the extraction (0-1). */
    confidence: number;
}

/** A deployment to an environment. */
export interface Deployment {
    id: string;
    environment: string;
    /** success | failure | in_progress. */
    status: string;
    sha?: string | undefined;
    ref?: string | undefined;
    createdAt: string;
    updatedAt?: string | undefined;
    url?: string | undefined;
    /** Confidence in the extraction (0-1). */
    confidence: number;
}

/** A release/tag published from the versionador. */
export interface Release {
    id: string;
    tag: string;
    draft: boolean;
    prerelease: boolean;
    createdAt: string;
    name?: string | undefined;
    publishedAt?: string | undefined;
    author?: string | undefined;
    url?: string | undefined;
    confidence: number;
}

/** DORA metrics (deployment frequency, lead time, MTTR, change failure rate). */
export interface DoraMetrics {
    deploymentFrequency?: number | undefined;
    leadTimeForChanges?: number | undefined;
    meanTimeToRecovery?: number | undefined;
    changeFailureRate?: number | undefined;
    /** Provenance source (e.g., 'github', 'gitlab'). */
    source?: string | undefined;
    confidence: number;
}

/** Generic project-manager issue (GitHub Issues / GitLab Issues). */
export interface RawIssue {
    source: 'github' | 'gitlab';
    id: string | number;
    /** iid (GitLab) or number (GitHub). */
    key?: string | number | undefined;
    title: string;
    state: string;
    author?: string | undefined;
    labels: string[];
    createdAt: string;
    updatedAt?: string | undefined;
    url?: string | undefined;
    assignees?: string[] | undefined;
    confidence: number;
}

/** Per-file coverage breakdown. */
export interface CoverageFile {
    file: string;
    lines: { total: number; covered: number; percentage: number };
    branches?: { total: number; covered: number; percentage: number } | undefined;
    functions?: { total: number; covered: number; percentage: number } | undefined;
    confidence: number;
}

/** Performance metrics extracted from CI (duration, queue, cost, per-test). */
export interface PerformanceMetrics {
    pipelineDurationMs?: number | undefined;
    queueWaitMs?: number | undefined;
    runnerUtilization?: number | undefined;
    billableMinutes?: number | undefined;
    perTestP95Ms?: number | undefined;
    suiteSpeedP95Ms?: number | undefined;
    confidence: number;
}

/** Options for fetching raw data from a provider. */
export interface FetchOptions {
    repo: string;
    count?: number;
    branch?: string;
    since?: Date;
    /** Max artifacts to download per run. Default: 5. */
    maxArtifactsPerRun?: number;
}

/** Strategy interface — each provider adapts one data source. */
export interface DataProvider {
    readonly name: string;
    readonly source: 'github' | 'gitlab' | 'jira' | 'coverage' | 'xray';
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

/** A single date-based trend data point (CI pipeline pass rate per day). */
export interface DateTrendPoint {
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

// ─── Types absorbed from shared/metrics.ts ───────────────────────────────────
// These types were previously defined in metrics.ts and consumed by ~35 files.
// DataHub now produces them directly, eliminating the need for metrics.ts as
// a public interface.

/**
 * A single test run with pass/fail/skip counts and individual test results.
 * Equivalent to MetricsRun in shared/metrics.ts.
 */
export interface MetricsRun {
    /** ISO timestamp of the run. */
    timestamp: string;
    /** Project name. */
    project: string;
    /** Total test count. */
    total: number;
    /** Passed test count. */
    passed: number;
    /** Failed test count. */
    failed: number;
    /** Skipped test count. */
    skipped: number;
    /** Total duration in milliseconds. */
    duration: number;
    /** Individual test results. */
    tests: FlatTest[];
}

/**
 * A classified failure entry.
 * Equivalent to FailureClassification in shared/metrics.ts.
 */
export interface FailureClassification {
    /** ISO timestamp of the classification. */
    timestamp: string;
    /** Test title that failed. */
    testTitle: string;
    /** Failure category (e.g., 'REVERT', 'FLAKY', 'REGRESSION'). */
    category: string;
    /** Project name. */
    project: string;
}

/**
 * A flakiness entry with pass/fail/skip breakdown.
 * Equivalent to FlakinessEntry in shared/metrics.ts.
 */
export interface FlakinessEntry {
    /** Test title. */
    title: string;
    /** Project name. */
    project: string;
    /** Number of passes. */
    passCount: number;
    /** Number of failures. */
    failCount: number;
    /** Number of skips. */
    skipCount: number;
    /** Total runs executed. */
    totalRuns: number;
    /** Failure rate (0-1). */
    rate: number;
}

/**
 * A trend data point with label and detailed counts.
 * Equivalent to TrendPoint in shared/metrics.ts.
 */
export interface TrendPoint {
    /** Date label (YYYY-MM-DD). */
    label: string;
    /** Pass rate (0-100). */
    passRate: number;
    /** Total test count. */
    total: number;
    /** Failed test count. */
    failed: number;
}

/**
 * Persistent store of test run history, coverage snapshots, and failure classifications.
 * Equivalent to MetricsStore in shared/metrics.ts.
 */
export interface MetricsStore {
    /** Historical test runs. */
    runs: MetricsRun[];
    /** Historical coverage snapshots. */
    coverageHistory?: CoverageSnapshot[];
    /** Historical failure classifications. */
    failureClassifications?: FailureClassification[];
}

/** All computed metrics from the hub. */
export interface ComputedMetrics {
    passRate: number;
    avgDuration: number;
    suiteSpeedP95: number;
    flakyRate: FlakyResult[];
    coverage: number;
    pipelineCost: CostEstimate;
    defectTrends: DateTrendPoint[];
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
    // ─── New fields for SSOT centralization ─────────────────────────────────
    // These fields are optional for backward compatibility during migration.
    // Once all consumers are migrated, they become required.
    /** Execution rate: tests executed / total expected (0-100). */
    executionRate?: number;
    /** Flaky percentage: flaky tests / total qualifying tests (0-100). */
    flakyPercentage?: number;
    /** Per-run cost breakdown. */
    perRunCosts?: PerRunCost[];
    /** Metrics runs mapped from parsedArtifacts (for consumers that need FlatTest[]). */
    metricsRuns?: MetricsRun[];
    /** Flakiness entries with pass/fail/skip breakdown. */
    flakinessEntries?: FlakinessEntry[];
    /** Metrics trend points with label, passRate, total, failed. */
    metricsTrends?: TrendPoint[];
    // ─── SSOT expansion (Fase 22.M/22.N) ──────────────────────────────────
    /** Test-level pass rate: passed / (passed + failed) * 100. Computed from metricsRuns. */
    runPassRate?: number;
    /** P95 of individual test durations in milliseconds (test-level). */
    testDurationP95?: number;
    /** Percentage of runs with at least 1 failed test (0-100). */
    runFailureRate?: number;
    /** Per-test title duration map: title → duration array across runs (ms). */
    testDurationMap?: Record<string, number[]>;
    /** Test-level flaky percentage: flaky tests / qualifying tests (0-100). */
    flakyTestRate?: number;
}

/**
 * Per-run cost breakdown.
 * Equivalent to per-run cost data that pipeline-cost.ts computes from raw.runs.
 */
export interface PerRunCost {
    /** Run ID. */
    runId: number;
    /** Run timestamp. */
    timestamp: string;
    /** Duration in minutes. */
    minutes: number;
    /** Estimated cost in USD. */
    cost: number;
    /** Branch name. */
    branch: string;
}

/** The Data Hub — single source of truth for ALL data operations. */
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

    // ─── SSOT Persistence Operations ───────────────────────────────────────
    // Consumers MUST use these methods instead of accessing persistence directly.
    // Persistence is encapsulated — not exposed on the interface.

    /** Save a test run to persistence. Throws if persistence not configured. */
    saveRun(sha: string, run: MetricsRun): void;
    /** Save a coverage snapshot to persistence. Throws if persistence not configured. */
    saveCoverageSnapshot(snapshot: CoverageSnapshot): void;
    /** Save a failure classification to persistence. Throws if persistence not configured. */
    saveFailureClassification(classification: FailureClassification): void;
    /** Flush all pending changes to disk (git commit). Throws if persistence not configured. */
    flush(message: string): void;

    // ─── SSOT Persistence Operations (expanded) ────────────────────────────
    // These methods complete the DataHub persistence surface.
    // They eliminate the need for consumers to call createDataHubPersistence() directly.

    /** Load coverage history for a project. Throws if persistence not configured. */
    loadCoverageHistory(project: string): CoverageSnapshot[];
    /** Load all failure classifications for a project. Throws if persistence not configured. */
    loadFailureClassifications(project: string): FailureClassification[];
    /** Save the full MetricsStore. Throws if persistence not configured. */
    saveMetricsStore(store: MetricsStore): void;
    /**
     * Convert a ParseResult to MetricsRun and save it to history.
     * Throws if persistence not configured.
     */
    saveParseResult(project: string, result: ParseResult): MetricsRun;
    /** Save a quality metrics snapshot. Throws if persistence not configured. */
    saveQualityMetrics(snapshot: QualityMetricsSnapshot): void;
    /** Load all quality metrics snapshots. Throws if persistence not configured. */
    loadQualityMetricsHistory(): QualityMetricsSnapshot[];
    // ─── SSOT Expansion (ST-1): new data categories (consumer-facing) ────────
    /** Save failure records. Throws if persistence not configured. */
    saveFailureRecords(records: FailureRecord[]): void;
    /** Load all failure records. Throws if persistence not configured. */
    loadFailureRecords(): FailureRecord[];
    /** Save security findings. Throws if persistence not configured. */
    saveSecurityFindings(findings: SecurityFinding[]): void;
    /** Load all security findings. Throws if persistence not configured. */
    loadSecurityFindings(): SecurityFinding[];
    /** Save deployments. Throws if persistence not configured. */
    saveDeployments(deployments: Deployment[]): void;
    /** Load all deployments. Throws if persistence not configured. */
    loadDeployments(): Deployment[];
    /** Save releases. Throws if persistence not configured. */
    saveReleases(releases: Release[]): void;
    /** Load all releases. Throws if persistence not configured. */
    loadReleases(): Release[];
    /** Save DORA metrics. Throws if persistence not configured. */
    saveDoraMetrics(metrics: DoraMetrics): void;
    /** Load latest DORA metrics. Throws if persistence not configured. */
    loadDoraMetrics(): DoraMetrics | null;
    /** Save project-manager issues. Throws if persistence not configured. */
    savePmIssues(issues: RawIssue[]): void;
    /** Load all project-manager issues. Throws if persistence not configured. */
    loadPmIssues(): RawIssue[];
    /** Save per-file coverage. Throws if persistence not configured. */
    saveCoverageFiles(files: CoverageFile[]): void;
    /** Load all per-file coverage. Throws if persistence not configured. */
    loadCoverageFiles(): CoverageFile[];
    /** Save performance metrics. Throws if persistence not configured. */
    savePerformanceMetrics(metrics: PerformanceMetrics): void;
    /** Load latest performance metrics. Throws if persistence not configured. */
    loadPerformanceMetrics(): PerformanceMetrics | null;
    /**
     * Quality report for a gated ST-1 category, computed at the ingest boundary.
     * Reflects the trustworthy in-memory model (hub.raw), not the durable store.
     * Returns undefined for an unknown category.
     */
    getQuality(category: QualityCategory): QualityReport | undefined;
}

/**
 * Result of DataHubImpl.create() — wraps the hub with status metadata.
 *
 * Consumers MUST destructure: `const { hub } = await DataHubImpl.create(...)`.
 * The wrapper exists to surface provider failures, partial data, and Layer 7
 * status without throwing exceptions.
 */
export interface DataHubResult {
    /** The created DataHub instance (always present, even on partial failure). */
    hub: DataHub;
    /** Status of the creation operation. */
    status: 'ok' | 'warning';
    /** Warning details when status is 'warning'. Absent when status is 'ok'. */
    warning?: { code: string; message: string };
    /** Whether some providers failed but data is still partial. */
    partialData?: boolean;
}

/**
 * Persistence interface for historical data operations.
 * Replaces direct access to MetricsStore / Store.
 */
export interface DataHubPersistence {
    /** Save a test run to history. */
    saveRun(sha: string, run: MetricsRun): void;
    /**
     * Load a test run by SHA. Currently always returns null because
     * MetricsRun uses timestamp as identifier, not SHA.
     * SHA-based lookup is available through the legacy Store class.
     * Retained for interface completeness.
     */
    /** Save a coverage snapshot. */
    saveCoverageSnapshot(snapshot: CoverageSnapshot): void;
    /** Load coverage history for a project. */
    loadCoverageHistory(project: string): CoverageSnapshot[];
    /** Save a failure classification. */
    saveFailureClassification(classification: FailureClassification): void;
    /** Load all failure classifications for a project. */
    loadFailureClassifications(project: string): FailureClassification[];
    /** Save the full MetricsStore. */
    saveMetricsStore(store: MetricsStore): void;
    /**
     * Convert a ParseResult to MetricsRun and save it to history.
     * This is the primary entry point for persisting test results from parsers.
     *
     * @param project - Project name for scoping.
     * @param result - Parsed test results from CTRF/JUnit/Mochawesome.
     * @returns The created MetricsRun for downstream use.
     */
    saveParseResult(project: string, result: ParseResult): MetricsRun;
    /** Save a quality metrics snapshot. */
    saveQualityMetrics(snapshot: QualityMetricsSnapshot): void;
    /** Load all quality metrics snapshots. */
    loadQualityMetricsHistory(): QualityMetricsSnapshot[];
    // ─── SSOT Expansion (ST-1): new data categories ──────────────────────────
    // Every category is persisted to its own quality-gated JSON file. Save
    // replaces the category entirely (latest extract wins); load returns []/null
    // when absent. No category is ever silently dropped (AGENTS §25).
    /** Save failure records. */
    saveFailureRecords(records: FailureRecord[]): void;
    /** Load all failure records. */
    loadFailureRecords(): FailureRecord[];
    /** Save security findings. */
    saveSecurityFindings(findings: SecurityFinding[]): void;
    /** Load all security findings. */
    loadSecurityFindings(): SecurityFinding[];
    /** Save deployments. */
    saveDeployments(deployments: Deployment[]): void;
    /** Load all deployments. */
    loadDeployments(): Deployment[];
    /** Save releases. */
    saveReleases(releases: Release[]): void;
    /** Load all releases. */
    loadReleases(): Release[];
    /** Save DORA metrics. */
    saveDoraMetrics(metrics: DoraMetrics): void;
    /** Load latest DORA metrics (null when none). */
    loadDoraMetrics(): DoraMetrics | null;
    /** Save project-manager issues. */
    savePmIssues(issues: RawIssue[]): void;
    /** Load all project-manager issues. */
    loadPmIssues(): RawIssue[];
    /** Save per-file coverage. */
    saveCoverageFiles(files: CoverageFile[]): void;
    /** Load all per-file coverage. */
    loadCoverageFiles(): CoverageFile[];
    /** Save performance metrics. */
    savePerformanceMetrics(metrics: PerformanceMetrics): void;
    /** Load latest performance metrics (null when none). */
    loadPerformanceMetrics(): PerformanceMetrics | null;
    /** Flush changes to disk. */
    flush(message: string): void;
}
