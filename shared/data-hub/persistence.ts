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
import { detectProjectGitDir, detectStoreBackend } from '../store-backend.js';
import type { StoreBackend } from '../store-backend.js';
import type {
    DataHubPersistence,
    MetricsRun,
    MetricsStore,
    CoverageSnapshot,
    FailureClassification,
    QualityMetricsSnapshot,
} from '../types/data-hub.js';
import type { ParseResult } from '../result_parser.js';
import { extractErrorMessage, humanizeError } from '../prompt-errors.js';
import { MetricsStoreSchema } from './schemas.js';

const METRICS_FILE = 'metrics/global.json';
const QUALITY_METRICS_FILE = 'metrics/quality-metrics.json';

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
 * Create a DataHubPersistence instance backed by the existing Store infrastructure.
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

    function loadMetricsStore(): MetricsStore {
        const raw = readJson<unknown>(b, METRICS_FILE);
        if (!raw) return { runs: [] };
        try {
            return MetricsStoreSchema.parse(raw) as MetricsStore;
        } catch {
            rootLogger.warn('data-hub-persistence: metrics store schema validation failed, returning empty store');
            return { runs: [] };
        }
    }

    function saveMetricsStore(store: MetricsStore): void {
        writeJson(b, METRICS_FILE, store);
    }

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

        loadRun(_sha: string): MetricsRun | null {
            // SHA-based lookup is not supported by MetricsRun data model.
            // MetricsRun uses timestamp as identifier, not SHA.
            // Consumers needing SHA-based lookup should use Store.loadReport() directly.
            return null;
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

        loadMetricsStore(): MetricsStore {
            return loadMetricsStore();
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

        flush(message: string): void {
            try {
                b.flush(message);
            } catch (err: unknown) {
                const raw = extractErrorMessage(err);
                const known = humanizeError(raw);
                rootLogger.warn(`data-hub-persistence: flush failed — ${known ? known.msg : raw}`);
            }
        },
    };
}
