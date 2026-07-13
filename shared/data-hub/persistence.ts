/**
 * DataHub Persistence Adapter.
 *
 * Implements DataHubPersistence by delegating to the existing Store backend
 * (git-backed or filesystem-backed). This absorbs MetricsStore functionality
 * into DataHub, making it the single interface for all data operations.
 *
 * @module persistence
 */
import { rootLogger } from '../logger.js';
import { getErrorMessage } from '../errors.js';
import { detectProjectGitDir, detectStoreBackend } from '../store-backend.js';
import type { StoreBackend } from '../store-backend.js';
import type {
    DataHubPersistence,
    MetricsRun,
    MetricsStore,
    CoverageSnapshot,
    FailureClassification,
    QualityMetricsSnapshot,
    FailureRecord,
    SecurityFinding,
    Deployment,
    Release,
    DoraMetrics,
    RawIssue,
    CoverageFile,
    PerformanceMetrics,
    ReportMeta,
    BranchEntry,
} from '../types/data-hub.js';
import type { ParseResult, FlatTest } from '../result_parser.js';
import { extractErrorMessage, humanizeError } from '../prompt-errors.js';
import { MetricsStoreSchema } from './schemas.js';
import {
    validateAndScoreFailureRecords,
    validateAndScoreSecurityFindings,
    validateAndScoreDeployments,
    validateAndScoreReleases,
    validateAndScorePmIssues,
    validateAndScoreCoverageFiles,
    validateAndScoreDoraMetrics,
    validateAndScorePerformanceMetrics,
} from './quality.js';

const METRICS_FILE = 'metrics/global.json';
const QUALITY_METRICS_FILE = 'metrics/quality-metrics.json';

// ─── ST-1 category files (quality-gated, one file per category) ─────────────
const FAILURE_RECORDS_FILE = 'metrics/failure-records.json';
const SECURITY_FINDINGS_FILE = 'metrics/security-findings.json';
const DEPLOYMENTS_FILE = 'metrics/deployments.json';
const RELEASES_FILE = 'metrics/releases.json';
const DORA_FILE = 'metrics/dora-metrics.json';
const PM_ISSUES_FILE = 'metrics/pm-issues.json';
const COVERAGE_FILES_FILE = 'metrics/coverage-files.json';
const PERFORMANCE_FILE = 'metrics/performance-metrics.json';

/**
 * Read JSON from the store backend with error handling.
 */
function readJson<T>(backend: StoreBackend, relPath: string): T | null {
    try {
        const buf = backend.read(relPath);
        if (!buf) return null;
        const parsed: unknown = JSON.parse(buf.toString('utf8'));
        return parsed as T;
    } catch (err: unknown) {
        const raw = extractErrorMessage(err);
        const known = humanizeError(raw);
        rootLogger.warn(`data-hub-persistence: falha ao ler ${relPath} — ${known ? known.msg : raw}`);
        return null;
    }
}

/**
 * Write JSON to the store backend with error handling.
 */
function writeJson<T>(backend: StoreBackend, relPath: string, data: T): void {
    try {
        backend.write(relPath, Buffer.from(JSON.stringify(data, null, 2), 'utf8'));
    } catch (err: unknown) {
        const raw = extractErrorMessage(err);
        const known = humanizeError(raw);
        rootLogger.error(`data-hub-persistence: falha ao escrever ${relPath} — ${known ? known.msg : raw}`);
        throw err;
    }
}

/**
 * Internal data-hub factory: build a DataHubPersistence instance backed by the
 * existing Store infrastructure.
 *
 * NOTE: This is an INTERNAL factory of `shared/data-hub/`. Its sole production
 * consumer is `createDataHub` in `factory.ts` (same package). It is intentionally
 * NOT part of the public DataHub API surface — callers must use `createDataHub`
 * rather than constructing persistence directly. Do not consume it from outside
 * `shared/data-hub/`, as that would bypass the centralized creation/retry path.
 *
 * @param project - Project name for scoping stored data.
 * @param backend - Optional pre-initialized StoreBackend. If not provided, auto-detects.
 * @returns DataHubPersistence implementation.
 */
export function createDataHubPersistence(_project: string, backend?: StoreBackend): DataHubPersistence {
    const b =
        backend ??
        (() => {
            const gitDir = detectProjectGitDir();
            const storeBackend = detectStoreBackend(gitDir ?? undefined);
            storeBackend.init();
            return storeBackend;
        })();
    // Legacy Store.ensure() initialized the backend before the first write.
    // init() is idempotent (mkdir + conditional git init), so calling it here
    // restores that behavior when a pre-built backend is supplied by callers.
    b.init();

    function loadMetricsStore(): MetricsStore {
        const raw = readJson<unknown>(b, METRICS_FILE);
        if (!raw) return { runs: [] };
        try {
            return MetricsStoreSchema.parse(raw) as MetricsStore;
        } catch (err: unknown) {
            const rawError = getErrorMessage(err);
            rootLogger.warn(`data-hub-persistence: metrics store schema validation failed — ${rawError}`);
            return { runs: [] };
        }
    }

    function saveMetricsStore(store: MetricsStore): void {
        writeJson(b, METRICS_FILE, store);
    }

    // ─── ST-1 category helpers (quality-gated; never silently drop) ─────────
    const saveCategoryArray = <T>(relPath: string, data: T[]): void => writeJson(b, relPath, data);
    const loadCategoryArray = <T>(relPath: string): T[] => {
        const data = readJson<T[]>(b, relPath);
        return Array.isArray(data) ? data : [];
    };
    const saveCategoryObject = <T>(relPath: string, data: T): void => writeJson(b, relPath, data);
    const loadCategoryObject = <T>(relPath: string): T | null => {
        const data = readJson<T>(b, relPath);
        return data ?? null;
    };

    return {
        saveRun(_sha: string, run: MetricsRun): void {
            const store = loadMetricsStore();
            store.runs.push(run);
            const max = 50;
            if (store.runs.length > max) {
                store.runs = store.runs.slice(-max);
            }
            saveMetricsStore(store);
        },

        saveCoverageSnapshot(snapshot: CoverageSnapshot): void {
            const store = loadMetricsStore();
            if (!store.coverageHistory) store.coverageHistory = [];
            store.coverageHistory.push(snapshot);
            saveMetricsStore(store);
        },

        loadCoverageHistory(project: string): CoverageSnapshot[] {
            const store = loadMetricsStore();
            return (store.coverageHistory ?? []).filter((s) => s.project === project);
        },

        saveFailureClassification(classification: FailureClassification): void {
            const store = loadMetricsStore();
            if (!store.failureClassifications) store.failureClassifications = [];
            store.failureClassifications.push(classification);
            saveMetricsStore(store);
        },

        loadFailureClassifications(project: string): FailureClassification[] {
            const store = loadMetricsStore();
            return (store.failureClassifications ?? []).filter((c) => c.project === project);
        },

        saveMetricsStore(store: MetricsStore): void {
            saveMetricsStore(store);
        },

        saveParseResult(project: string, result: ParseResult): MetricsRun {
            const run: MetricsRun = {
                timestamp: new Date().toISOString(),
                project,
                total: result.stats.total,
                passed: result.stats.passed,
                failed: result.stats.failed,
                skipped: result.stats.skipped,
                duration: result.stats.duration,
                tests: result.tests,
            };
            const store = loadMetricsStore();
            store.runs.push(run);
            const max = 50;
            if (store.runs.length > max) {
                store.runs = store.runs.slice(-max);
            }
            saveMetricsStore(store);
            return run;
        },

        saveQualityMetrics(snapshot: QualityMetricsSnapshot): void {
            const existing = readJson<{ snapshots: QualityMetricsSnapshot[] }>(b, QUALITY_METRICS_FILE);
            const store = existing ?? { snapshots: [] };
            store.snapshots.push(snapshot);
            writeJson(b, QUALITY_METRICS_FILE, store);
        },

        loadQualityMetricsHistory(): QualityMetricsSnapshot[] {
            const existing = readJson<{ snapshots: QualityMetricsSnapshot[] }>(b, QUALITY_METRICS_FILE);
            return existing?.snapshots ?? [];
        },

        // ─── ST-1 new categories (quality-gated at the store trust boundary) ─
        // Defense-in-depth: the in-memory model is already gated at ingest; this
        // backstop guarantees the durable store never holds schema-invalid,
        // NaN/Infinity, or un-deduped data. Invalid/low-quality data is TAGGED
        // (stored as-is), never dropped (AGENTS §25: zero silenciamento).
        saveFailureRecords(records: FailureRecord[]): void {
            saveCategoryArray(FAILURE_RECORDS_FILE, validateAndScoreFailureRecords(records).items);
        },
        loadFailureRecords(): FailureRecord[] {
            return loadCategoryArray<FailureRecord>(FAILURE_RECORDS_FILE);
        },
        saveSecurityFindings(findings: SecurityFinding[]): void {
            saveCategoryArray(SECURITY_FINDINGS_FILE, validateAndScoreSecurityFindings(findings).items);
        },
        loadSecurityFindings(): SecurityFinding[] {
            return loadCategoryArray<SecurityFinding>(SECURITY_FINDINGS_FILE);
        },
        saveDeployments(deployments: Deployment[]): void {
            saveCategoryArray(DEPLOYMENTS_FILE, validateAndScoreDeployments(deployments).items);
        },
        loadDeployments(): Deployment[] {
            return loadCategoryArray<Deployment>(DEPLOYMENTS_FILE);
        },
        saveReleases(releases: Release[]): void {
            saveCategoryArray(RELEASES_FILE, validateAndScoreReleases(releases).items);
        },
        loadReleases(): Release[] {
            return loadCategoryArray<Release>(RELEASES_FILE);
        },
        saveDoraMetrics(metrics: DoraMetrics): void {
            saveCategoryObject(DORA_FILE, validateAndScoreDoraMetrics(metrics).value);
        },
        loadDoraMetrics(): DoraMetrics | null {
            return loadCategoryObject<DoraMetrics>(DORA_FILE);
        },
        savePmIssues(issues: RawIssue[]): void {
            saveCategoryArray(PM_ISSUES_FILE, validateAndScorePmIssues(issues).items);
        },
        loadPmIssues(): RawIssue[] {
            return loadCategoryArray<RawIssue>(PM_ISSUES_FILE);
        },
        saveCoverageFiles(files: CoverageFile[]): void {
            saveCategoryArray(COVERAGE_FILES_FILE, validateAndScoreCoverageFiles(files).items);
        },
        loadCoverageFiles(): CoverageFile[] {
            return loadCategoryArray<CoverageFile>(COVERAGE_FILES_FILE);
        },
        savePerformanceMetrics(metrics: PerformanceMetrics): void {
            saveCategoryObject(PERFORMANCE_FILE, validateAndScorePerformanceMetrics(metrics).value);
        },
        loadPerformanceMetrics(): PerformanceMetrics | null {
            return loadCategoryObject<PerformanceMetrics>(PERFORMANCE_FILE);
        },

        // ─── Test-result cache (SHA-keyed) — owned by DataHub (replaces legacy Store) ─
        loadReport(sha: string): { tests: FlatTest[] } | null {
            return readJson<{ tests: FlatTest[] }>(b, `reports/${_project}/${sha}.json`);
        },

        saveReport(sha: string, tests: FlatTest[]): void {
            writeJson(b, `reports/${_project}/${sha}.json`, { tests });
        },

        put(sha: string, meta: ReportMeta): void {
            const globalIndex = readJson<Record<string, ReportMeta>>(b, 'reports/index.json') ?? {};
            const globalEntries = Object.entries(globalIndex).filter(([k]) => k !== sha);
            globalEntries.push([sha, meta]);
            writeJson(b, 'reports/index.json', Object.fromEntries(globalEntries));

            const projIndex = readJson<Record<string, ReportMeta>>(b, `reports/${_project}/index.json`) ?? {};
            const projEntries = Object.entries(projIndex).filter(([k]) => k !== sha);
            projEntries.push([sha, meta]);
            writeJson(b, `reports/${_project}/index.json`, Object.fromEntries(projEntries));
        },

        getBranch(branch: string): BranchEntry[] {
            const raw = readJson<Record<string, unknown>>(b, `reports/${_project}/branch-index.json`) ?? {};
            const entry = Object.entries(raw).find(([k]) => k === branch);
            const value = entry?.[1];
            return Array.isArray(value) ? (value as BranchEntry[]) : [];
        },

        loadMetrics<T = Record<string, unknown>>(): T | null {
            return readJson<T>(b, `reports/${_project}/metrics.json`);
        },

        saveMetrics<T = Record<string, unknown>>(data: T): void {
            writeJson(b, `reports/${_project}/metrics.json`, data);
        },

        flush(message: string): void {
            try {
                b.flush(message);
            } catch (err: unknown) {
                const raw = extractErrorMessage(err);
                const known = humanizeError(raw);
                rootLogger.warn(`data-hub-persistence: flush failed — ${known ? known.msg : raw}`);
                throw err;
            }
        },
    };
}
