/** Metrics persistence: run history, flakiness calculation, and coverage tracking.
 * Internal persistence uses StoreBackend (git-backed or fs-backed). */
import { z } from 'zod';
import Config from './config.js';
import { rootLogger } from './logger.js';
import { detectProjectGitDir, detectStoreBackend, FsStoreBackend } from './store-backend.js';
import type { StoreBackend } from './store-backend.js';
import type { ParseResult, FlatTest } from './result_parser.js';

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

export interface MetricsStore {
    runs: MetricsRun[];
    coverageHistory?: CoverageSnapshot[];
    failureClassifications?: FailureClassification[];
}

const FlatTestSchema = z.object({
    title: z.string(),
    state: z.union([z.literal('passed'), z.literal('failed'), z.literal('skipped')]),
    duration: z.number().nonnegative(),
    error: z.string().optional(),
    fullTitle: z.string().optional(),
    steps: z
        .array(z.object({ action: z.string().optional(), expected: z.string().optional() }).passthrough())
        .optional(),
    screenshots: z.array(z.object({ title: z.string(), dataUri: z.string() }).passthrough()).optional(),
    logs: z.array(z.string()).optional(),
});

const MetricsRunSchema = z.object({
    timestamp: z.string(),
    project: z.string(),
    total: z.number().int().nonnegative(),
    passed: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    skipped: z.number().int().nonnegative(),
    duration: z.number().nonnegative(),
    tests: z.array(FlatTestSchema),
});

const CoverageSnapshotSchema: z.ZodType<CoverageSnapshot> = z.object({
    timestamp: z.string(),
    project: z.string(),
    totalIssues: z.number().int().nonnegative(),
    mappedIssues: z.number().int().nonnegative(),
    coveragePct: z.number().min(0).max(100),
});

const FailureClassificationSchema = z.object({
    timestamp: z.string(),
    testTitle: z.string(),
    category: z.string(),
    project: z.string(),
});

const MetricsStoreSchema = z.object({
    runs: z.array(MetricsRunSchema),
    coverageHistory: z.array(CoverageSnapshotSchema).optional(),
    failureClassifications: z.array(FailureClassificationSchema).optional(),
});

export interface FlakinessEntry {
    title: string;
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

function getBackend(config?: Config): StoreBackend {
    if (config) {
        const xdg = config.get('xdgStateHome');
        if (xdg) {
            const backend = new FsStoreBackend(xdg);
            backend.init();
            return backend;
        }
    }

    const gitDir = detectProjectGitDir();
    const backend = detectStoreBackend(gitDir ?? undefined);
    backend.init();
    return backend;
}

export function loadMetrics(config?: Config): MetricsStore {
    try {
        const backend = getBackend(config);
        const raw = backend.read(METRICS_FILE);
        if (!raw) return { runs: [] };
        const parsed: unknown = JSON.parse(raw.toString('utf8'));
        return MetricsStoreSchema.parse(parsed) as MetricsStore;
    } catch (err) {
        rootLogger.warn('Failed to load metrics: ' + (err instanceof Error ? err.message : String(err)));
        return { runs: [] };
    }
}

export function saveMetrics(store: MetricsStore, config?: Config): void {
    try {
        const backend = getBackend(config);
        backend.write(METRICS_FILE, Buffer.from(JSON.stringify(store, null, 2), 'utf8'));
        backend.flush('qa-tools: update metrics run');
    } catch (err) {
        rootLogger.error('Failed to save metrics: ' + (err as Error).message);
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

export function calculateFlakiness(store: MetricsStore, minRuns = 2): FlakinessEntry[] {
    const testMap = new Map<string, { pass: number; fail: number; skip: number }>();

    for (const run of store.runs) {
        for (const t of run.tests) {
            const entry = testMap.get(t.title) || { pass: 0, fail: 0, skip: 0 };
            if (t.state === 'passed') entry.pass++;
            else if (t.state === 'failed') entry.fail++;
            else entry.skip++;
            testMap.set(t.title, entry);
        }
    }

    const result: FlakinessEntry[] = [];
    for (const [title, counts] of testMap) {
        const totalRunAppearances = counts.pass + counts.fail + counts.skip;
        if (totalRunAppearances < minRuns) continue;
        const rate = totalRunAppearances > 0 ? counts.fail / totalRunAppearances : 0;
        if (counts.fail > 0 && counts.pass > 0) {
            result.push({
                title,
                passCount: counts.pass,
                failCount: counts.fail,
                skipCount: counts.skip,
                totalRuns: totalRunAppearances,
                rate,
            });
        }
    }

    result.sort((a, b) => b.rate - a.rate);
    return result;
}

export function calculateFlakyRate(store: MetricsStore, minRuns = 2): number {
    const entries = calculateFlakiness(store, minRuns);
    if (entries.length === 0) return 0;
    const flakyCount = entries.filter((e) => e.rate > 0).length;
    const totalConsidered = entries.length;
    if (totalConsidered === 0) return 0;
    return (flakyCount / totalConsidered) * 100;
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
