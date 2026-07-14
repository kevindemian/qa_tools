/**
 * Shared DataHub test mocks.
 *
 * Single source of truth for mock implementations of `DataHubPersistence` and
 * `DataHub`, so interface extensions (ST-1 categories) are satisfied in ONE
 * place — no duplicated mock boilerplate across ~14 test files (AGENTS §6).
 * Every save* is a `vi.fn()`; array loaders return `[]`; object loaders return
 * `null` — matching the real backend's empty/absent semantics.
 *
 * @module data-hub-mock
 */
import { vi } from 'vitest';
import { calcPipelinePassRate } from '../../data-hub/compute/pass-rate.js';
import type {
    DataHub,
    DataHubPersistence,
    RawData,
    ComputedMetrics,
    FlakyResult,
    DateTrendPoint,
    FailingJob,
    FailureReason,
    PerRunCost,
    MetricsRun,
    FlakinessEntry,
    TrendPoint,
    FlatTest,
    ReportMeta,
    BranchEntry,
} from '../../types/data-hub.js';
import type { QualityReport, QualityCategory } from '../../data-hub/quality.js';
import type { DataSource } from '../../types/data-hub.js';
import type { QuarantineStore } from '../../quarantine.js';

/** Default `computed` metrics — all zeros/empty so overrides can be partial. */
const defaultComputed: ComputedMetrics = {
    passRate: 0,
    avgDuration: 0,
    suiteSpeedP95: 0,
    flakyRate: [] as FlakyResult[],
    coverage: 0,
    pipelineCost: { totalMinutes: 0, estimatedCost: 0 },
    defectTrends: [] as DateTrendPoint[],
    branchBreakdown: {},
    topFailingJobs: [] as FailingJob[],
    topFailureReasons: [] as FailureReason[],
    releaseScore: {
        score: 0,
        dimensions: {
            passRate: { score: 0, status: 'fail' },
            flakyRate: { score: 0, status: 'fail' },
            coverage: { score: 0, status: 'fail' },
            executionRate: { score: 0, status: 'fail' },
            suiteSpeed: { score: 0, status: 'fail' },
        },
        grade: 'F',
    },
    quarantineStatus: { flakyCount: 0, quarantinedCount: 0 },
    testPassRate: 0,
    testCounts: { passed: 0, failed: 0, skipped: 0, total: 0 },
    framework: 'unknown',
    executionRate: 0,
    flakyPercentage: 0,
    perRunCosts: [] as PerRunCost[],
    metricsRuns: [] as MetricsRun[],
    flakinessEntries: [] as FlakinessEntry[],
    metricsTrends: [] as TrendPoint[],
    flakyTestRate: 0,
    testDurationP95: 0,
    runFailureRate: 0,
    testDurationMap: {},
};

/** Build a fully-satisfied `DataHubPersistence` mock. */
export function makeDataHubPersistenceMock(): DataHubPersistence {
    return {
        saveRun: vi.fn(),
        saveCoverageSnapshot: vi.fn(),
        loadCoverageHistory: vi.fn().mockReturnValue([]),
        saveFailureClassification: vi.fn(),
        loadFailureClassifications: vi.fn().mockReturnValue([]),
        saveMetricsStore: vi.fn(),
        saveParseResult: vi.fn().mockReturnValue({
            timestamp: new Date().toISOString(),
            project: '',
            total: 0,
            passed: 0,
            failed: 0,
            skipped: 0,
            duration: 0,
            tests: [],
        }),
        saveQualityMetrics: vi.fn(),
        loadQualityMetricsHistory: vi.fn().mockReturnValue([]),
        // ─── ST-1 categories ───────────────────────────────────────────────
        saveFailureRecords: vi.fn(),
        loadFailureRecords: vi.fn().mockReturnValue([]),
        saveSecurityFindings: vi.fn(),
        loadSecurityFindings: vi.fn().mockReturnValue([]),
        saveDeployments: vi.fn(),
        loadDeployments: vi.fn().mockReturnValue([]),
        saveReleases: vi.fn(),
        loadReleases: vi.fn().mockReturnValue([]),
        saveDoraMetrics: vi.fn(),
        loadDoraMetrics: vi.fn().mockReturnValue(null),
        savePmIssues: vi.fn(),
        loadPmIssues: vi.fn().mockReturnValue([]),
        saveCoverageFiles: vi.fn(),
        loadCoverageFiles: vi.fn().mockReturnValue([]),
        savePerformanceMetrics: vi.fn(),
        loadPerformanceMetrics: vi.fn().mockReturnValue(null),
        savePullRequests: vi.fn(),
        loadPullRequests: vi.fn().mockReturnValue([]),
        // ─── Test-result cache (SHA-keyed) — owned by DataHub (replaces legacy Store) ─
        loadReport: vi.fn<(sha: string) => { tests: FlatTest[] } | null>().mockReturnValue(null),
        saveReport: vi.fn<(sha: string, tests: FlatTest[]) => void>(),
        put: vi.fn<(sha: string, meta: ReportMeta) => void>(),
        getBranch: vi.fn<(branch: string) => BranchEntry[]>().mockReturnValue([]),
        loadMetrics: vi.fn().mockReturnValue(null),
        saveMetrics: vi.fn(),
        flush: vi.fn(),
    };
}

/**
 * SSOT category getters for DataHub mocks (EIXO C). Returns the gated in-memory
 * model (`raw.*`) so mocks mirror `DataHubImpl`'s serving surface without
 * duplicating the real implementation.
 */
export function makeDataHubGetters(): Pick<
    DataHub,
    | 'getRuns'
    | 'getFailureRecords'
    | 'getSecurityFindings'
    | 'getDeployments'
    | 'getReleases'
    | 'getDoraMetrics'
    | 'getPmIssues'
    | 'getCoverageFiles'
    | 'getCoverage'
    | 'getPerformanceMetrics'
    | 'getPullRequests'
    | 'getProvenance'
> {
    return {
        getRuns(this: DataHub) {
            const raw = this.raw as RawData | undefined;
            return raw?.runs ?? [];
        },
        getFailureRecords(this: DataHub) {
            const raw = this.raw as RawData | undefined;
            return raw?.failureRecords ?? [];
        },
        getSecurityFindings(this: DataHub) {
            const raw = this.raw as RawData | undefined;
            return raw?.securityFindings ?? [];
        },
        getDeployments(this: DataHub) {
            const raw = this.raw as RawData | undefined;
            return raw?.deployments ?? [];
        },
        getReleases(this: DataHub) {
            const raw = this.raw as RawData | undefined;
            return raw?.releases ?? [];
        },
        getDoraMetrics(this: DataHub) {
            const raw = this.raw as RawData | undefined;
            return raw?.doraMetrics;
        },
        getPmIssues(this: DataHub) {
            const raw = this.raw as RawData | undefined;
            return raw?.pmIssues ?? [];
        },
        getCoverageFiles(this: DataHub) {
            const raw = this.raw as RawData | undefined;
            return raw?.coverageFiles ?? [];
        },
        getCoverage(this: DataHub) {
            const raw = this.raw as RawData | undefined;
            return raw?.coverage;
        },
        getPerformanceMetrics(this: DataHub) {
            const raw = this.raw as RawData | undefined;
            return raw?.performanceMetrics;
        },
        getPullRequests(this: DataHub) {
            const raw = this.raw as RawData | undefined;
            return raw?.pullRequests ?? [];
        },
        getProvenance(this: DataHub) {
            const raw = this.raw as RawData | undefined;
            return raw?.provenance;
        },
    };
}

/** Build a fully-satisfied `DataHub` mock with overridable raw/computed. */
export function makeDataHubMock(
    overrides: {
        raw?: RawData;
        computed?: Partial<ComputedMetrics>;
        provider?: 'github' | 'gitlab';
        repo?: string;
        provenance?: Map<string, DataSource>;
        quality?: Partial<Record<QualityCategory, QualityReport>>;
    } = {},
): DataHub {
    const raw: RawData = {
        ...(overrides.raw ?? {
            runs: [],
            jobs: new Map(),
            artifacts: new Map(),
            failureReasons: new Map(),
        }),
        ...(overrides.provenance ? { provenance: overrides.provenance } : {}),
    };
    const computed: ComputedMetrics = { ...defaultComputed, ...overrides.computed };
    return {
        raw,
        computed,
        timestamp: new Date(),
        provider: overrides.provider ?? 'github',
        repo: overrides.repo ?? 'test/repo',
        saveRun: vi.fn(),
        saveCoverageSnapshot: vi.fn(),
        saveFailureClassification: vi.fn(),
        flush: vi.fn(),
        loadCoverageHistory: vi.fn().mockReturnValue([]),
        loadFailureClassifications: vi.fn().mockReturnValue([]),
        saveMetricsStore: vi.fn(),
        saveParseResult: vi.fn().mockReturnValue({
            timestamp: new Date().toISOString(),
            project: '',
            total: 0,
            passed: 0,
            failed: 0,
            skipped: 0,
            duration: 0,
            tests: [],
        }),
        saveQualityMetrics: vi.fn(),
        loadQualityMetricsHistory: vi.fn().mockReturnValue([]),
        // ─── ST-1 categories ───────────────────────────────────────────────
        saveFailureRecords: vi.fn(),
        loadFailureRecords: vi.fn().mockReturnValue([]),
        saveSecurityFindings: vi.fn(),
        loadSecurityFindings: vi.fn().mockReturnValue([]),
        saveDeployments: vi.fn(),
        loadDeployments: vi.fn().mockReturnValue([]),
        saveReleases: vi.fn(),
        loadReleases: vi.fn().mockReturnValue([]),
        saveDoraMetrics: vi.fn(),
        loadDoraMetrics: vi.fn().mockReturnValue(null),
        savePmIssues: vi.fn(),
        loadPmIssues: vi.fn().mockReturnValue([]),
        saveCoverageFiles: vi.fn(),
        loadCoverageFiles: vi.fn().mockReturnValue([]),
        savePerformanceMetrics: vi.fn(),
        loadPerformanceMetrics: vi.fn().mockReturnValue(null),
        savePullRequests: vi.fn(),
        loadPullRequests: vi.fn().mockReturnValue([]),
        getQuality: vi.fn<(category: QualityCategory) => QualityReport | undefined>(
            overrides.quality ? (category: QualityCategory) => overrides.quality?.[category] : undefined,
        ),
        getQuarantine: vi.fn<() => QuarantineStore>(() => ({ entries: [] })),
        ...makeDataHubGetters(),
        getBranchPassRate: (branch: string): number => calcPipelinePassRate(raw.runs, branch),
        mergeIncremental: vi.fn<(incoming: RawData) => void>(),
        // ─── Test-result cache (SHA-keyed) ─────────────────────────────────────
        loadReport: vi.fn<(sha: string) => { tests: FlatTest[] } | null>().mockReturnValue(null),
        saveReport: vi.fn<(sha: string, tests: FlatTest[]) => void>(),
        put: vi.fn<(sha: string, meta: ReportMeta) => void>(),
        getBranch: vi.fn<(branch: string) => BranchEntry[]>().mockReturnValue([]),
        // ─── Legacy metrics blob ───────────────────────────────────────────────
        loadMetrics: vi.fn(),
        saveMetrics: vi.fn(),
    };
}
