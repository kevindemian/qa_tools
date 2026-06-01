/** Metrics persistence: run history, flakiness calculation, and coverage tracking.
 * Stores JSON files per-project and calculates flakiness rates from historical runs. */
import fs from 'fs';
import path from 'path';
import os from 'os';
import Config from './config';
import { rootLogger } from './logger';
import type { ParseResult, FlatTest } from './result_parser';

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

export interface MetricsStore {
    runs: MetricsRun[];
    coverageHistory?: CoverageSnapshot[];
}

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

const STORE_FILE = 'metrics.json';

function getMetricsDir(config?: Config): string {
    const xdg = config ? config.get('xdgStateHome') : Config.get('xdgStateHome');
    const base = xdg ? path.join(xdg, 'qa-tools') : path.join(os.homedir(), '.local', 'state', 'qa-tools');
    return path.join(base, 'metrics');
}

function storePath(config?: Config): string {
    return path.join(getMetricsDir(config), STORE_FILE);
}

function tmpPath(config?: Config): string {
    return storePath(config) + '.tmp';
}

function ensureDir(dir: string): boolean {
    try {
        fs.mkdirSync(dir, { recursive: true });
        return true;
    } catch {
        return false;
    }
}

export function loadMetrics(config?: Config): MetricsStore {
    try {
        ensureDir(getMetricsDir(config));
        const sp = storePath(config);
        if (!fs.existsSync(sp)) return { runs: [] };
        const raw = fs.readFileSync(sp, 'utf8');
        return JSON.parse(raw) as MetricsStore;
    } catch (err) {
        rootLogger.warn('Failed to load metrics: ' + (err as Error).message);
        return { runs: [] };
    }
}

function saveMetrics(store: MetricsStore, config?: Config): void {
    try {
        const dir = getMetricsDir(config);
        ensureDir(dir);
        const sp = storePath(config);
        const tp = tmpPath(config);
        fs.writeFileSync(tp, JSON.stringify(store, null, 2), 'utf8');
        fs.renameSync(tp, sp);
    } catch (err) {
        rootLogger.error('Failed to save metrics: ' + (err as Error).message);
    }
}

export function saveRunMetrics(run: MetricsRun, config?: Config): void {
    const store = loadMetrics(config);
    store.runs.push(run);
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
        passRate: r.total > 0 ? (r.passed / r.total) * 100 : 0,
        total: r.total,
        failed: r.failed,
    }));
}
