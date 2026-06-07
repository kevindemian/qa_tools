/**
 * Report Cache — local persistent cache of test run data (CTRF JSON) for reuse
 * by the HTML report generator (case17) without requiring manual file upload.
 *
 * Retention: pruned to REPORT_CACHE_MAX (default 20) on each write.
 * Storage: ~/.local/state/qa-tools/reports/
 */
import fs from 'fs';
import path from 'path';
import Config from './config.js';
import type { FlatTest } from './result_parser.js';

const DEFAULT_CACHE_MAX = 20;
const INDEX_FILE = 'index.json';

export interface CachedReportMeta {
    id: string;
    project: string;
    pipelineId: string | number;
    timestamp: string;
    tool: string;
    branch: string;
    total: number;
    passed: number;
    failed: number;
    skipped: number;
}

interface CachedReportIndex {
    reports: CachedReportMeta[];
}

function getReportDir(): string {
    const base =
        Config.get('qaToolsReportsDir') ||
        process.env.XDG_STATE_HOME ||
        path.join(process.env.HOME || '', '.local', 'state');
    return path.join(base, 'qa-tools', 'reports');
}

function ensureDir(dir: string): void {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

function indexPath(): string {
    return path.join(getReportDir(), INDEX_FILE);
}

function dataPath(id: string): string {
    return path.join(getReportDir(), id + '.json');
}

function loadIndex(): CachedReportIndex {
    const ip = indexPath();
    try {
        if (fs.existsSync(ip)) {
            const raw = fs.readFileSync(ip, 'utf-8');
            const parsed: CachedReportIndex = JSON.parse(raw) as CachedReportIndex;
            if (parsed && Array.isArray(parsed.reports)) {
                return parsed;
            }
        }
    } catch {
        /* corrupted index — rebuild from files */
    }
    return { reports: [] };
}

function saveIndex(index: CachedReportIndex): void {
    const ip = indexPath();
    const dir = path.dirname(ip);
    ensureDir(dir);
    const tmp = ip + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(index, null, 2), 'utf-8');
    fs.renameSync(tmp, ip);
}

function pruneInternal(index: CachedReportIndex, max: number): number {
    if (index.reports.length <= max) return 0;
    const toRemove = index.reports.slice(0, index.reports.length - max);
    index.reports = index.reports.slice(-max);
    for (const r of toRemove) {
        const dp = dataPath(r.id);
        try {
            if (fs.existsSync(dp)) fs.unlinkSync(dp);
        } catch {
            /* best effort */
        }
    }
    return toRemove.length;
}

export function cacheReport(
    project: string,
    pipelineId: string | number,
    tests: FlatTest[],
    stats: { passed: number; failed: number; skipped: number; total: number },
    tool?: string,
    branch?: string,
): string {
    const id = `${project}-${String(pipelineId)}-${Date.now()}`;
    const meta: CachedReportMeta = {
        id,
        project,
        pipelineId,
        timestamp: new Date().toISOString(),
        tool: tool || '',
        branch: branch || '',
        total: stats.total,
        passed: stats.passed,
        failed: stats.failed,
        skipped: stats.skipped,
    };

    const dir = getReportDir();
    ensureDir(dir);

    /* Write data file */
    const data = { tests, stats };
    fs.writeFileSync(dataPath(id), JSON.stringify(data), 'utf-8');

    /* Update index */
    const index = loadIndex();
    index.reports.push(meta);

    /* Prune */
    const max = parseInt(Config.get('REPORT_CACHE_MAX') || String(DEFAULT_CACHE_MAX), 10) || DEFAULT_CACHE_MAX;
    pruneInternal(index, max);

    saveIndex(index);
    return id;
}

export function listReports(project?: string): CachedReportMeta[] {
    const index = loadIndex();
    if (project) {
        return index.reports.filter((r) => r.project === project).reverse();
    }
    return [...index.reports].reverse();
}

export function loadReport(
    id: string,
): { tests: FlatTest[]; stats: { passed: number; failed: number; skipped: number; total: number } } | null {
    const dp = dataPath(id);
    try {
        if (fs.existsSync(dp)) {
            const raw = fs.readFileSync(dp, 'utf-8');
            return JSON.parse(raw) as {
                tests: FlatTest[];
                stats: { passed: number; failed: number; skipped: number; total: number };
            };
        }
    } catch {
        /* corrupted data file */
    }
    return null;
}

export function pruneReports(max?: number): number {
    const limit = max || parseInt(Config.get('REPORT_CACHE_MAX') || String(DEFAULT_CACHE_MAX), 10) || DEFAULT_CACHE_MAX;
    const index = loadIndex();
    const removed = pruneInternal(index, limit);
    if (removed > 0) saveIndex(index);
    return removed;
}
