/**
 * Data Hub — Hub (Orchestration Layer).
 *
 * Orchestrates providers to fetch raw data and compute functions to calculate
 * metrics. Returns a DataHub object with raw data and computed metrics.
 *
 * @reference SOLID — Single Responsibility: only orchestrates, does not compute
 *
 * N2-B (warning debt, not suppressed): lines 223/503/649 trigger
 * `security/detect-object-injection` on pre-existing `Map.get(key)` / `obj[key]`
 * access with runtime-derived keys. Dynamic-key access is required by the
 * map-backed API surface; not corrected (no eslint-disable, config untouched).
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
    MetricsRun,
    CoverageSnapshot,
    DataSource,
    FailureClassification,
    QualityMetricsSnapshot,
    FailureRecord,
    SecurityFinding,
    Deployment,
    Release,
    DoraMetrics,
    RawIssue,
    CoverageFile,
    RawCoverage,
    PerformanceMetrics,
    RawPullRequest,
    FlatTest,
    ReportMeta,
    BranchEntry,
    DataAvailability,
} from '../types/data-hub.js';
import type { PipelineRun, PipelineJob } from '../types/ci-cd.js';
import type { ArtifactParseResult } from './artifact-parser.js';
import type { ParseResult } from '../result_parser.js';
import { mergeCategoryArrays, mergeProvenance } from './raw-merge.js';
import { gateRawData, type QualityReport, type QualityCategory, type QualityCategoryMap } from './quality.js';
import { loadQuarantine, type QuarantineStore } from '../validation/quarantine.js';
import { rootLogger } from '../logger.js';
import { askTestSource } from './test-source-fallback.js';
import type { FallbackResult } from './test-source-fallback.js';
import {
    calcPipelinePassRate,
    calcRunPassRate,
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
    calcRetryFlaky,
    calcComputeCost,
    aggregateDefectTrends,
    aggregateDefectSeasonality,
    detectSilentRegressions,
    computeAiMetrics,
    computeOptimizationActions,
    computeImpactAlerts,
    computeIncidentEvents,
    computeTraceabilityTree,
    computeCoverageGap,
    computeSuiteBreakdown,
    computeFailureClassifications,
    computePipelineCostResult,
} from './compute/index.js';
import { mapJiraIssuesToBacklogHealth, analyzeBacklogHealth } from '../report/backlog-health.js';
import { buildDeveloperProfile } from '../quality/developer-profile.js';

/** Options for creating a DataHub. */
export interface DataHubOptions {
    /** Number of recent runs to fetch. Default: 30. */
    count?: number;
    /** Cost per minute for pipeline cost estimation. */
    costPerMinute?: number;
    /**
     * When true, a no-data (Camada 7) result returns a resilient empty hub
     * instead of throwing Layer7UnavailableError. Used by resilient consumers
     * (dashboards/metrics). PR report generation must NOT set this.
     */
    allowEmpty?: boolean;
    /**
     * Project name stamped on MetricsRun entries derived from parsed
     * artifacts. Every consumer filter (`r.project === project`) matches this.
     * Defaults to `options.repo` when absent.
     */
    project?: string;
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
    computed: ComputedMetrics;
    private readonly persistence: DataHubPersistence;
    timestamp: Date;
    readonly provider: 'github' | 'gitlab';
    readonly repo: string;
    private readonly quality: QualityCategoryMap;
    private readonly quarantine: QuarantineStore;

    private constructor(
        raw: RawData,
        computed: ComputedMetrics,
        provider: 'github' | 'gitlab',
        repo: string,
        persistence: DataHubPersistence,
        quality: QualityCategoryMap,
    ) {
        this.raw = raw;
        this.computed = computed;
        this.persistence = persistence;
        this.timestamp = new Date();
        this.provider = provider;
        this.repo = repo;
        this.quality = quality;
        this.quarantine = loadQuarantine();
    }

    // ─── SSOT Persistence Operations ───────────────────────────────────────
    // Consumers MUST use these methods instead of accessing persistence directly.
    // Persistence is encapsulated — private, not exposed on the interface.

    saveRun(sha: string, run: MetricsRun): void {
        this.persistence.saveRun(sha, run);
    }

    saveCoverageSnapshot(snapshot: CoverageSnapshot): void {
        this.persistence.saveCoverageSnapshot(snapshot);
    }

    saveFailureClassification(classification: FailureClassification): void {
        this.persistence.saveFailureClassification(classification);
    }

    flush(message: string): void {
        this.persistence.flush(message);
    }

    // ─── SSOT Persistence Operations (expanded) ────────────────────────────
    // Pure delegates — identical pattern to the 4 above.

    loadCoverageHistory(project: string): CoverageSnapshot[] {
        return this.persistence.loadCoverageHistory(project);
    }

    loadFailureClassifications(project: string): FailureClassification[] {
        return this.persistence.loadFailureClassifications(project);
    }

    saveMetricsStore(store: MetricsStore): void {
        this.persistence.saveMetricsStore(store);
    }

    /**
     * Persist the parse AND reconcile it as the authoritative current run
     * (F0-T8). After this call, `computed.metricsRuns[0]` reflects `result`
     * (same tests), so report generation / failure analysis never read a stale
     * hub. Keyed by `sourceRunId` when provided (idempotent dedup by real CI
     * run id); otherwise a synthetic user-fallback slot (key 0, matching
     * `createFromParseResult`'s convention).
     */
    saveParseResult(project: string, result: ParseResult, sourceRunId?: number): MetricsRun {
        if (sourceRunId !== undefined && !Number.isInteger(sourceRunId)) {
            throw new Error(
                `saveParseResult: sourceRunId deve ser um inteiro válido — recebido ${String(sourceRunId)} (projeto ${project}).`,
            );
        }
        const run = this.persistence.saveParseResult(project, result);
        const artifacts = this.raw.parsedArtifacts ?? new Map<number, ArtifactParseResult[]>();
        const key = sourceRunId ?? 0;
        artifacts.set(key, [
            {
                fileName: sourceRunId !== undefined ? String(sourceRunId) : 'user-fallback',
                data: result,
                format: 'ctrf',
            },
        ]);
        this.raw.parsedArtifacts = artifacts;
        this.computed = DataHubImpl.computeMetrics(this.raw, { repo: this.repo, project });
        this.timestamp = new Date();
        return run;
    }

    saveQualityMetrics(snapshot: QualityMetricsSnapshot): void {
        this.persistence.saveQualityMetrics(snapshot);
    }

    loadQualityMetricsHistory(): QualityMetricsSnapshot[] {
        return this.persistence.loadQualityMetricsHistory();
    }

    // ─── SSOT Expansion (ST-1): new data categories ─────────────────────────
    // Pure delegates — identical pattern to the persistence operations above.
    saveFailureRecords(records: FailureRecord[]): void {
        this.persistence.saveFailureRecords(records);
    }
    loadFailureRecords(): FailureRecord[] {
        return this.persistence.loadFailureRecords();
    }
    saveSecurityFindings(findings: SecurityFinding[]): void {
        this.persistence.saveSecurityFindings(findings);
    }
    loadSecurityFindings(): SecurityFinding[] {
        return this.persistence.loadSecurityFindings();
    }
    saveDeployments(deployments: Deployment[]): void {
        this.persistence.saveDeployments(deployments);
    }
    loadDeployments(): Deployment[] {
        return this.persistence.loadDeployments();
    }
    saveReleases(releases: Release[]): void {
        this.persistence.saveReleases(releases);
    }
    loadReleases(): Release[] {
        return this.persistence.loadReleases();
    }
    saveDoraMetrics(metrics: DoraMetrics): void {
        this.persistence.saveDoraMetrics(metrics);
    }
    loadDoraMetrics(): DoraMetrics | null {
        return this.persistence.loadDoraMetrics();
    }
    savePmIssues(issues: RawIssue[]): void {
        this.persistence.savePmIssues(issues);
    }
    loadPmIssues(): RawIssue[] {
        return this.persistence.loadPmIssues();
    }
    saveCoverageFiles(files: CoverageFile[]): void {
        this.persistence.saveCoverageFiles(files);
    }
    loadCoverageFiles(): CoverageFile[] {
        return this.persistence.loadCoverageFiles();
    }
    savePerformanceMetrics(metrics: PerformanceMetrics): void {
        this.persistence.savePerformanceMetrics(metrics);
    }
    loadPerformanceMetrics(): PerformanceMetrics | null {
        return this.persistence.loadPerformanceMetrics();
    }
    savePullRequests(pullRequests: RawPullRequest[]): void {
        this.persistence.savePullRequests(pullRequests);
    }
    loadPullRequests(): RawPullRequest[] {
        return this.persistence.loadPullRequests();
    }

    /**
     * Quality report for a gated ST-1 category, computed at the ingest boundary.
     * Reflects the trustworthy in-memory model (hub.raw), never the durable store.
     */
    getQuality(category: QualityCategory): QualityReport | undefined {
        const entry = Object.entries(this.quality).find(([key]) => key === category);

        return entry ? entry[1] : undefined;
    }

    // ─── SSOT Serving (EIXO C): typed category accessors ────────────────────
    // Return the gated in-memory model (hub.raw). Never expose persistence here.
    // `undefined` means the category was not fetched — never an empty sentinel.

    getRuns(): PipelineRun[] {
        return this.raw.runs;
    }

    getFailureRecords(): FailureRecord[] | undefined {
        return this.raw.failureRecords;
    }

    getSecurityFindings(): SecurityFinding[] | undefined {
        return this.raw.securityFindings;
    }

    getDeployments(): Deployment[] | undefined {
        return this.raw.deployments;
    }

    getReleases(): Release[] | undefined {
        return this.raw.releases;
    }

    getDoraMetrics(): DoraMetrics | undefined {
        return this.raw.doraMetrics;
    }

    getPmIssues(): RawIssue[] | undefined {
        return this.raw.pmIssues;
    }

    getCoverageFiles(): CoverageFile[] | undefined {
        return this.raw.coverageFiles;
    }

    getCoverage(): RawCoverage | undefined {
        return this.raw.coverage;
    }

    getPerformanceMetrics(): PerformanceMetrics | undefined {
        return this.raw.performanceMetrics;
    }

    getPullRequests(): RawPullRequest[] | undefined {
        return this.raw.pullRequests;
    }

    getProvenance(): Map<string, DataSource> | undefined {
        return this.raw.provenance;
    }

    /**
     * Quarantine store owned by the hub (SSOT for the quarantined-test list).
     * Loaded once at construction; consumers MUST read via this instead of
     * calling `isQuarantined()` directly (which reads quarantine.json itself).
     */
    getQuarantine(): QuarantineStore {
        return this.quarantine;
    }

    // ─── Test-result cache (SHA-keyed) — SSOT, delegates to persistence ───────

    loadReport(sha: string): { tests: FlatTest[] } | null {
        return this.persistence.loadReport(sha);
    }

    saveReport(sha: string, tests: FlatTest[]): void {
        this.persistence.saveReport(sha, tests);
    }

    put(sha: string, meta: ReportMeta): void {
        this.persistence.put(sha, meta);
    }

    getBranch(branch: string): BranchEntry[] {
        return this.persistence.getBranch(branch);
    }

    pruneReports(dryRun?: boolean): string[] {
        return this.persistence.pruneReports(dryRun);
    }

    loadMetrics<T = Record<string, unknown>>(): T | null {
        return this.persistence.loadMetrics<T>();
    }

    saveMetrics<T = Record<string, unknown>>(data: T): void {
        this.persistence.saveMetrics(data);
    }

    /**
     * Pipeline pass rate for a single branch (Gap 3 — branch-aware metrics).
     * Filters `raw.runs` to `branch` (head_branch ?? ref) before computing.
     */
    getBranchPassRate(branch: string): number {
        return calcPipelinePassRate(this.raw.runs, branch);
    }

    /**
     * Gap 4 (G4.4): merge newly-fetched raw data into this hub incrementally.
     *
     * Existing runs (by id) are preserved; only runs not already present are added.
     * Maps and category arrays are merged with the same dedup semantics used when
     * combining providers (no silent drops, no duplicates — AGENTS §25).
     * Recomputes `computed` and refreshes `timestamp`.
     */
    mergeIncremental(incoming: RawData): void {
        const seen = new Set(this.raw.runs.map((r) => r.id));
        const deduped: RawData = {
            ...incoming,
            runs: incoming.runs.filter((r) => !seen.has(r.id)),
        };
        DataHubImpl.mergeRawData(this.raw, deduped);
        this.computed = DataHubImpl.computeMetrics(this.raw, { repo: this.repo });
        this.timestamp = new Date();
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
    /**
     * Erro não-recuperável lançado quando a Camada 7 (fallback manual do usuário)
     * é a única fonte possível mas está indisponível (contexto não-interativo).
     * É explicitamente NÃO silencioso: obriga o chamador a falhar em vez de
     * produzir relatório parcial/vazio.
     */
    static readonly Layer7UnavailableError = class Layer7UnavailableError extends Error {
        constructor(message: string) {
            super(message);
            this.name = 'Layer7UnavailableError';
        }
    };

    /**
     * Verifica se um erro desconhecido é o `Layer7UnavailableError`, sem depender
     * de identidade de classe (evita acoplamento de tipo em diffs/linters).
     * O nome é definido no construtor da classe acima.
     */
    static isLayer7UnavailableError(err: unknown): boolean {
        return (err as { name?: unknown } | null)?.name === 'Layer7UnavailableError';
    }

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
            // Contexto não-interativo (CI/sem TTY) sem fonte de dados: falha explícita.
            // Nunca silencia como `skipped: true` — contrário à decisão arquitetural das 7 camadas.
            throw new DataHubImpl.Layer7UnavailableError(
                `Camada 7 indisponível (${fallback.error}): sem dados do versionador/Jira e sem relatório manual em contexto não-interativo.`,
            );
        }
        return { skipped: false, noFile: true };
    }

    /**
     * Cria um DataHub a partir de um `ParseResult` fornecido manualmente (Camada 7).
     * Usado quando o versionador/Jira não dispõe de dados e o usuário fornece um arquivo.
     *
     * @param parseResult - Resultado de `parseTestResultsFile` (CTRF/JUnit/Mochawesome).
     * @param repo - Nome do repositório (contexto).
     * @param persistence - Camada de persistência (encapsulada, obrigatória).
     */
    static createFromParseResult(parseResult: ParseResult, repo: string, persistence: DataHubPersistence): DataHubImpl {
        const parsedArtifacts = new Map<number, ArtifactParseResult[]>([
            [0, [{ fileName: 'user-fallback', data: parseResult, format: 'ctrf' }]],
        ]);
        const raw: RawData = {
            runs: [],
            jobs: new Map(),
            artifacts: new Map(),
            failureReasons: new Map(),
            parsedArtifacts,
        };
        const gated = gateRawData(raw);
        const computed = DataHubImpl.computeMetrics(gated.raw, { repo });
        return new DataHubImpl(gated.raw, computed, 'github', repo, persistence, gated.quality);
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

    /**
     * Resolve Layer 7 fallback. Returns an empty-hub result when no data is
     * available and `allowEmpty` is set (resilient consumers: dashboards/metrics).
     * Otherwise rethrows Camada 7 explicitly — the PR report (main) does NOT set
     * allowEmpty and must fail explicitly on missing data.
     */
    private static async resolveLayer7(
        raw: RawData,
        providerSource: 'github' | 'gitlab',
        repo: string,
        persistence: DataHubPersistence,
        allowEmpty: boolean,
    ): Promise<{ kind: 'ok'; skipped: boolean; noFile: boolean } | { kind: 'empty'; result: DataHubResult }> {
        try {
            const layer7 = await DataHubImpl.applyLayer7Fallback(raw);

            return { kind: 'ok', skipped: layer7.skipped, noFile: layer7.noFile };
        } catch (err) {
            if (DataHubImpl.isLayer7UnavailableError(err) && allowEmpty) {
                return {
                    kind: 'empty',
                    result: DataHubImpl.buildResult(
                        DataHubImpl.createEmpty(providerSource, repo, persistence),
                        'warning',
                        {
                            code: 'NO_DATA',
                            message: 'No test data available — resilient empty hub',
                        },
                        false,
                    ),
                };
            }
            throw err;
        }
    }

    static async create(
        providers: DataProvider[],
        options: FetchOptions & DataHubOptions = { repo: '' },
        persistence: DataHubPersistence,
    ): Promise<DataHubResult> {
        const { raw, providerFailures } = await DataHubImpl.fetchFromProviders(providers, options);
        const allProvidersFailed = providerFailures > 0 && providerFailures >= providers.length;
        const someProvidersFailed = providerFailures > 0 && !allProvidersFailed;

        const providerSource = DataHubImpl.determineProviderSource(providers);

        const layer7Resolution = await DataHubImpl.resolveLayer7(
            raw,
            providerSource,
            options.repo,
            persistence,
            options.allowEmpty ?? false,
        );
        if (layer7Resolution.kind === 'empty') {
            return layer7Resolution.result;
        }
        const layer7Skipped = layer7Resolution.skipped;
        const layer7NoFile = layer7Resolution.noFile;

        const gated = gateRawData(raw);
        const computed = DataHubImpl.computeMetrics(gated.raw, options);
        const hub = new DataHubImpl(gated.raw, computed, providerSource, options.repo, persistence, gated.quality);

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
    static createEmpty(provider: 'github' | 'gitlab', repo: string, persistence: DataHubPersistence): DataHubImpl {
        const raw: RawData = {
            runs: [],
            jobs: new Map(),
            artifacts: new Map(),
            failureReasons: new Map(),
        };
        const gated = gateRawData(raw);
        const computed = DataHubImpl.computeMetrics(gated.raw, { repo });
        return new DataHubImpl(gated.raw, computed, provider, repo, persistence, gated.quality);
    }

    /**
     * Create a DataHub from persisted MetricsStore data.
     *
     * Direct mapping (no round-trip):
     * - MetricsRun[] → parsedArtifacts (ArtifactParseResult directly)
     * - MetricsRun[] → PipelineRun[] (metadata only, correct timestamps)
     * - CoverageSnapshot[] → RawCoverage
     * - FailureClassification[] → raw.failureClassifications
     */
    static loadFromStore(store: MetricsStore, repo: string, persistence: DataHubPersistence): DataHubImpl {
        const parsedArtifacts = new Map<number, ArtifactParseResult[]>();
        const runs: PipelineRun[] = [];
        const runsArray = Array.isArray(store.runs) ? store.runs : [];

        for (const [i, m] of runsArray.entries()) {
            parsedArtifacts.set(i, [
                {
                    fileName: 'metrics-store',
                    data: {
                        tests: m.tests,
                        stats: {
                            passed: m.passed,
                            failed: m.failed,
                            skipped: m.skipped,
                            total: m.total,
                            duration: m.duration,
                        },
                    },
                    format: 'ctrf',
                },
            ]);

            runs.push({
                id: i,
                run_number: i,
                head_branch: m.project || 'unknown',
                status: 'completed',
                conclusion: m.passed > m.failed ? 'success' : 'failure',
                created_at: m.timestamp,
                event: 'push',
            });
        }

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
            parsedArtifacts,
        };
        if (coverageHistory.length > 0) {
            raw.coverageHistory = coverageHistory;
        }
        if (coverage != null) {
            raw.coverage = coverage;
        }
        if (store.failureClassifications != null && store.failureClassifications.length > 0) {
            raw.failureClassifications = store.failureClassifications;
        }

        const gated = gateRawData(raw);
        const computed = DataHubImpl.computeMetrics(gated.raw, { repo });
        return new DataHubImpl(gated.raw, computed, 'github', repo, persistence, gated.quality);
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
        mergeCategoryArrays(target, source);
        mergeProvenance(target, source);
    }

    private static mergeCoverage(target: RawData, source: RawData): void {
        if (source.coverage != null && target.coverage == null) target.coverage = source.coverage;
        if (source.coverageHistory != null && source.coverageHistory.length > 0) {
            if (target.coverageHistory == null) target.coverageHistory = [];
            target.coverageHistory.push(...source.coverageHistory);
        }
    }

    private static mergeFirstNonNull(target: RawData, source: RawData): void {
        DataHubImpl.mergeCoverage(target, source);
        if (source.jiraIssues != null && target.jiraIssues == null) target.jiraIssues = source.jiraIssues;
        if (source.framework != null && target.framework == null) target.framework = source.framework;
        if (source.gitlabTestReport != null && target.gitlabTestReport == null) {
            target.gitlabTestReport = source.gitlabTestReport;
        }
        if (source.commitLog && !target.commitLog) target.commitLog = source.commitLog;
        if (source.ciRuns && source.ciRuns.length > 0 && (!target.ciRuns || target.ciRuns.length === 0)) {
            target.ciRuns = source.ciRuns;
        }
        DataHubImpl.mergeXray(target, source);
    }

    private static mergeXray(target: RawData, source: RawData): void {
        if (source.xray == null) return;
        if (target.xray == null) {
            target.xray = { testExecutions: [], testRuns: [] };
        }
        const seenExec = new Set(target.xray.testExecutions.map((e) => e.key).filter(Boolean));
        for (const exec of source.xray.testExecutions) {
            if (exec.key && !seenExec.has(exec.key)) {
                seenExec.add(exec.key);
                target.xray.testExecutions.push(exec);
            }
        }
        const seenRuns = new Set(target.xray.testRuns.map((r) => r.id).filter(Boolean));
        for (const run of source.xray.testRuns) {
            if (run.id && !seenRuns.has(run.id)) {
                seenRuns.add(run.id);
                target.xray.testRuns.push(run);
            }
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
        const testCounts = DataHubImpl.aggregateTestCounts(raw.parsedArtifacts);
        const runPassRate = calcRunPassRate({ passed: testCounts.passed, failed: testCounts.failed });
        // Coherent passRate (SSOT — B1): pipeline-level when CI runs with conclusion exist;
        // otherwise falls back to the test-level pass rate from parsed artifacts; 0 only when
        // there is genuinely no data. Prevents the self-run contradiction (100% vs critical).
        const pipelineRunsWithConclusion = raw.runs.filter((r) => r.conclusion != null);
        const passRate = pipelineRunsWithConclusion.length > 0 ? calcPipelinePassRate(raw.runs) : runPassRate;
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
        // ─── Data availability (B2 — SSOT) ───────────────────────────────────
        // Declares whether each health dimension has a REAL data source behind its
        // computed value. A missing source (no runs / no coverage / no jobs) must be
        // distinguishable from a measured 0 — consumers show "N/A", never 0
        // (AGENTS.md §24/§25). Mirrors computeCoverage / calcSuiteSpeedP95 sources.
        const dataAvailability: DataAvailability = {
            passRate: pipelineRunsWithConclusion.length > 0 || testCounts.passed + testCounts.failed > 0,
            flaky: raw.runs.length > 0,
            coverage: DataHubImpl.coverageSourcePresent(raw),
            executionRate: pipelineRunsWithConclusion.length > 0,
            suiteSpeed: DataHubImpl.suiteSpeedSourcePresent(raw),
        };
        const perRunCosts = calcPerRunCosts(raw.runs, options.costPerMinute);
        const metricsRuns =
            raw.parsedArtifacts != null
                ? convertToMetricsRuns(raw.parsedArtifacts, raw.runs, options.project ?? options.repo)
                : [];
        const flakinessEntries = calcFlakinessEntries(metricsRuns);
        const metricsTrends = calcMetricsTrends(metricsRuns);
        // ─── SSOT expansion — test-level metrics ────────────────────────────
        const flakyTestRate = metricsRuns.length > 0 ? calculateFlakyTestRate(metricsRuns) : 0;
        const testDurationP95 = metricsRuns.length > 0 ? calcTestDurationP95(metricsRuns) : 0;
        const runFailureRate = metricsRuns.length > 0 ? calcRunFailureRate(metricsRuns) : 0;
        const retryFlaky = calcRetryFlaky(raw.runs);
        const computeCost = calcComputeCost(raw.runs, raw.timing);
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
            dataAvailability,
        );
        const quarantineStatus = calcQuarantineStatus(flakyRate);
        const testPassRate =
            testCounts.total > 0 ? Math.round((testCounts.passed / testCounts.total) * 100 * 100) / 100 : 0;
        const framework = raw.framework ?? 'unknown';
        // ─── Content specification computed metrics ────────────────────────────
        const defectAggregation = aggregateDefectTrends(raw.failureClassifications ?? []);
        const seasonalityAggregation = aggregateDefectSeasonality(raw.failureClassifications ?? []);
        const regressionDetection = detectSilentRegressions(testDurationMap);
        const aiMetrics = raw.aiRecords != null ? computeAiMetrics(raw.aiRecords) : undefined;
        const optimizationActions = computeOptimizationActions(
            testDurationMap,
            Object.fromEntries(flakinessEntries.map((e) => [e.title, e.rate])),
        );
        const impactAlerts = computeImpactAlerts(raw, {
            passRate,
            coverage,
            topFailingJobs,
        } as ComputedMetrics);
        const incidentEvents = computeIncidentEvents(raw, {
            passRate,
            runFailureRate,
            regressionDetection,
            seasonalityAggregation,
        } as ComputedMetrics);
        const traceabilityTree = computeTraceabilityTree(raw, {
            metricsRuns,
            flakyRate,
        } as ComputedMetrics);
        // ─── Coverage gap computation ──────────────────────────────────────
        const coverageGap =
            raw.jiraIssues != null && raw.jiraIssues.length > 0 ? computeCoverageGap(raw.jiraIssues) : undefined;
        // ─── Suite breakdown and failure classifications ──────────────────
        const suiteBreakdown = metricsRuns.length > 0 ? computeSuiteBreakdown(metricsRuns) : [];
        const failureClassifications = metricsRuns.length > 0 ? computeFailureClassifications(metricsRuns) : {};
        // ─── N6 / I-1 — hub-first SSOT (hub computa, renderers nunca) ─────
        const backlogHealth = analyzeBacklogHealth(mapJiraIssuesToBacklogHealth(raw.jiraIssues ?? []));
        const developerProfile = buildDeveloperProfile(raw.failureClassifications ?? []);
        // aiComparison/crossSquad permanecem undefined (ausência explícita,
        // Rule 25.2): raw não carrega AiComparisonRecord nem dados de squad e o
        // wrapper fabricador de cross-squad foi removido (Q3/F0.3). Nunca
        // fabricar comparação de AI-vs-manual (Rule 25).
        const pipelineCostResult = computePipelineCostResult(raw.runs, perRunCosts, options.costPerMinute);

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
            runPassRate,
            retryFlaky,
            computeCost,
            defectAggregation,
            seasonalityAggregation,
            regressionDetection,
            aiMetrics,
            optimizationActions,
            impactAlerts,
            incidentEvents,
            traceabilityTree,
            coverageGap,
            suiteBreakdown,
            failureClassifications,
            dataAvailability,
            backlogHealth,
            developerProfile,
            pipelineCostResult,
        };
    }

    private static computeCoverage(raw: RawData): number {
        // First, try to get coverage from raw.coverage (extracted from job logs)
        // A finite percentage (including a measured 0%) is a real data source —
        // hiding 0% as noData would mask a critical condition (AGENTS.md §25).
        if (raw.coverage != null && Number.isFinite(raw.coverage.percentage)) {
            return calcCoverageFromRaw(raw.coverage).total;
        }
        // Fallback: extract coverage from parsed CTRF artifacts
        if (raw.parsedArtifacts != null) {
            for (const artifacts of raw.parsedArtifacts.values()) {
                for (const artifact of artifacts) {
                    if (artifact.coverage != null && Number.isFinite(artifact.coverage.percentage)) {
                        return artifact.coverage.percentage;
                    }
                }
            }
        }
        return 0;
    }

    /** Whether a real coverage source exists (mirrors computeCoverage sources). */
    private static coverageSourcePresent(raw: RawData): boolean {
        // A coverage report is a real data source even at 0% — only absent reports
        // or non-finite percentages (missing measurement) count as "no data".
        if (raw.coverage != null && Number.isFinite(raw.coverage.percentage)) {
            return true;
        }
        if (raw.parsedArtifacts != null) {
            for (const artifacts of raw.parsedArtifacts.values()) {
                for (const artifact of artifacts) {
                    if (artifact.coverage != null && Number.isFinite(artifact.coverage.percentage)) {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    /** Whether job duration / run timing data exists (mirrors calcSuiteSpeedP95 sources). */
    private static suiteSpeedSourcePresent(raw: RawData): boolean {
        if (raw.timing != null) {
            for (const timingData of raw.timing.values()) {
                if (Number.isFinite(timingData.run_duration_ms) && timingData.run_duration_ms >= 0) {
                    return true;
                }
            }
        }
        for (const jobList of raw.jobs.values()) {
            for (const job of jobList) {
                if (job.duration != null && job.duration > 0) {
                    return true;
                }
            }
        }
        return false;
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
        availability: DataAvailability,
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

        // B2/§25 — availability mirrors the health dimensions (flakyPercentage/executionRate
        // are derived from the same run/job sources).
        return calcReleaseScore(dimensions, undefined, {
            passRate: availability.passRate,
            flakyRate: availability.flaky,
            coverage: availability.coverage,
            suiteSpeed: availability.suiteSpeed,
            executionRate: availability.executionRate,
        });
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
