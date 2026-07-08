/** Metrics persistence: run history, flakiness calculation, and coverage tracking.
 * Internal persistence uses StoreBackend (git-backed or fs-backed). */
import Config from './config.js';
import { rootLogger } from './logger.js';
import { detectProjectGitDir, detectStoreBackend, FsStoreBackend } from './store-backend.js';
import type { StoreBackend } from './store-backend.js';
import type { ParseResult, FlatTest } from './result_parser.js';
import { MetricsStoreSchema } from './data-hub/schemas.js';

/** Represents a single test run with pass/fail/skip counts and individual test results. */
export interface MetricsRun {
    timestamp: string;
    project: string;
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    duration: number;
    tests: FlatTest[];
}

export interface CoverageSnapshot {
    timestamp: string;
    project: string;
    totalIssues: number;
    mappedIssues: number;
    coveragePct: number;
}

export interface FailureClassification {
    timestamp: string;
    testTitle: string;
    category: string;
    project: string;
}

/** Persistent store of test run history, coverage snapshots, and failure classifications. */
export interface MetricsStore {
    runs: MetricsRun[];
    coverageHistory?: CoverageSnapshot[];
    failureClassifications?: FailureClassification[];
}

export interface FlakinessEntry {
    title: string;
    project: string;
    passCount: number;
    failCount: number;
    skipCount: number;
    totalRuns: number;
    rate: number;
}

export interface TrendPoint {
    label: string;
    passRate: number;
    total: number;
    failed: number;
}

const METRICS_FILE = 'metrics/global.json';

export function createDefaultBackend(): StoreBackend {
    const gitDir = detectProjectGitDir();
    const backend = detectStoreBackend(gitDir ?? undefined);
    backend.init();
    return backend;
}

function getBackend(config?: Config): StoreBackend {
    if (config) {
        const xdg = config.get('xdgStateHome');
        if (xdg) {
            const backend = new FsStoreBackend(xdg);
            backend.init();
            return backend;
        }
    }

    return createDefaultBackend();
}

export function loadMetrics(config?: Config, backend?: StoreBackend): MetricsStore {
    try {
        const b = backend ?? getBackend(config);
        const raw = b.read(METRICS_FILE);
        if (!raw) return { runs: [] };
        const parsed: unknown = JSON.parse(raw.toString('utf8'));
        return MetricsStoreSchema.parse(parsed) as MetricsStore;
    } catch (err) {
        rootLogger.warn('Failed to load metrics. Verify the metrics file exists and is readable: ' + String(err));
        return { runs: [] };
    }
}

export function saveMetrics(store: MetricsStore, config?: Config, backend?: StoreBackend): void {
    try {
        const b = backend ?? getBackend(config);
        b.write(METRICS_FILE, Buffer.from(JSON.stringify(store, null, 2), 'utf8'));
        b.flush('qa-tools: update metrics run');
    } catch (err) {
        rootLogger.error('Failed to save metrics. Check write permissions and disk space: ' + String(err));
    }
}

export function saveRunMetrics(run: MetricsRun, config?: Config): void {
    const store = loadMetrics(config);
    store.runs.push(run);
    const max = parseInt(String(config ? config.get('METRICS_MAX_RUNS') : Config.get('METRICS_MAX_RUNS')), 10) || 50;
    if (store.runs.length > max) {
        store.runs = store.runs.slice(-max);
    }
    saveMetrics(store, config);
}

export function saveParseResult(project: string, result: ParseResult, config?: Config): MetricsRun {
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
    saveRunMetrics(run, config);
    return run;
}

function accumulateTestState(entry: { pass: number; fail: number; skip: number }, state: string): void {
    if (state === 'passed') entry.pass++;
    else if (state === 'failed') entry.fail++;
    else entry.skip++;
}

function buildFlakinessEntry(
    key: string,
    counts: { pass: number; fail: number; skip: number; project: string },
    minRuns: number,
): FlakinessEntry | null {
    const title = key.split('::')[1] ?? key;
    const executedCount = counts.pass + counts.fail;
    if (executedCount < minRuns) return null;
    const rate = executedCount > 0 ? counts.fail / executedCount : 0;
    if (counts.fail <= 0 || counts.pass <= 0) return null;
    return {
        title,
        project: counts.project,
        passCount: counts.pass,
        failCount: counts.fail,
        skipCount: counts.skip,
        totalRuns: executedCount,
        rate,
    };
}

export function calculateFlakiness(store: MetricsStore, minRuns = 2): FlakinessEntry[] {
    const testMap = new Map<string, { pass: number; fail: number; skip: number; project: string }>();

    for (const run of store.runs) {
        for (const t of run.tests) {
            const key = `${run.project}::${t.title}`;
            const entry = testMap.get(key) || { pass: 0, fail: 0, skip: 0, project: run.project };
            accumulateTestState(entry, t.state);
            testMap.set(key, entry);
        }
    }

    const result: FlakinessEntry[] = [];
    for (const [key, counts] of testMap) {
        const entry = buildFlakinessEntry(key, counts, minRuns);
        if (entry) result.push(entry);
    }

    result.sort((a, b) => b.rate - a.rate);
    return result;
}

export function calculateFlakyRate(store: MetricsStore, minRuns = 2): number {
    const flakyEntries = calculateFlakiness(store, minRuns);
    if (flakyEntries.length === 0) return 0;

    const testRunCounts = new Map<string, number>();
    for (const run of store.runs) {
        for (const t of run.tests) {
            if (t.state === 'skipped') continue;
            testRunCounts.set(t.title, (testRunCounts.get(t.title) ?? 0) + 1);
        }
    }

    let totalQualifying = 0;
    for (const count of testRunCounts.values()) {
        if (count >= minRuns) totalQualifying++;
    }

    if (totalQualifying === 0) return 0;
    return (flakyEntries.length / totalQualifying) * 100;
}

export function saveCoverageSnapshot(snapshot: CoverageSnapshot, config?: Config): void {
    const store = loadMetrics(config);
    if (!store.coverageHistory) store.coverageHistory = [];
    store.coverageHistory.push(snapshot);
    saveMetrics(store, config);
}

export function getTrends(store: MetricsStore, window = 10): TrendPoint[] {
    const runs = store.runs.slice(-window);
    return runs.map((r) => ({
        label: r.timestamp.slice(0, 10),
        passRate: r.passed + r.failed > 0 ? (r.passed / (r.passed + r.failed)) * 100 : 0,
        total: r.total,
        failed: r.failed,
    }));
}
