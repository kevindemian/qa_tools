/** Per-session state: counters, results, busy flag, and history.
 * Each command handler receives a {@link SessionContext} to track progress and build context lines.
 *
 * Sprint C extension: resolveTestDataSource() replaces manual path with
 * SHA-keyed cache lookup (DataHub-owned) + CI auto-download. */

function isNonNullObject(val: unknown): val is Record<string, unknown> {
    return val != null && Object.getPrototypeOf(val) !== null;
}

function getErrorMessage(err: unknown): string {
    if (isNonNullObject(err) && 'message' in err) {
        return String((err as { message: unknown }).message);
    }
    return String(err);
}
import { withSpinner } from './prompt.js';
import { getHeadSha, getCurrentBranch } from './git-sha.js';
import type { DataHub, ReportMeta } from './types/data-hub.js';
// ci-test-downloader removed — DataHub.raw.parsedArtifacts is SSOT (Invariant 6)
import { isDataHubInitialized, getDataHub } from './data-hub/global-hub.js';
import type { ParseResult } from './result_parser.js';
import { rootLogger } from './logger.js';
import { statsFromTests } from './report-utils.js';

interface SessionCountersItem {
    op: string;
    detail: string;
    status: string;
}

interface TestResultSummary {
    status: 'ok' | 'error';
    label: string;
    message: string;
}

/** Tracks the current interactive session: operation history, results, busy flag, and project context. */
export class SessionContext {
    isBusy: boolean;
    lastOperation: string;
    sessionCounters: SessionCountersItem[];
    packageManager: unknown;
    createPackageManager?: (dir: string) => unknown;
    git_directory: string;
    inMemoryTasksId: string[];
    inMemoryTasksText: string[];
    project_name: string;
    results: TestResultSummary[];

    /** Resolved Git SHA for the current session (populated by resolveSessionContext). */
    sha: string | null;
    /** Current Git branch (populated by resolveSessionContext). */
    branch: string | null;
    /** DataHub cache (SHA-keyed) for test-result access (populated by resolveSessionContext). */
    store: DataHub | null;

    constructor() {
        this.isBusy = false;
        this.lastOperation = '';
        this.sessionCounters = [];
        this.packageManager = undefined;
        this.git_directory = 'no_dir_selected';
        this.inMemoryTasksId = [];
        this.inMemoryTasksText = [];
        this.project_name = '';
        this.results = [];
        this.sha = null;
        this.branch = null;
        this.store = null;
    }

    resetResults(): void {
        this.results = [];
    }

    async withBusy<T>(fn: () => Promise<T>, label?: string): Promise<T> {
        const spinnerFn = withSpinner;
        this.isBusy = true;
        try {
            if (label) return await spinnerFn(label, fn);
            return await fn();
        } finally {
            this.isBusy = false;
        }
    }

    pushHistory(op: string, detail: string, status: string): void {
        this.sessionCounters.push({ op, detail, status });
        this.lastOperation = op + ': ' + detail;
    }

    buildContextLine(projectName?: string): string {
        const ok = this.sessionCounters.filter((c) => c.status === 'ok').length;
        const er = this.sessionCounters.filter((c) => c.status === 'error').length;
        let counts = '';
        if (ok > 0 || er > 0) {
            counts = ' | ' + ok + ' ok';
            if (er > 0) {
                counts += ' · ' + er + ' erro';
            }
        }
        const prefix = projectName;
        return prefix + (this.lastOperation ? ' | ' + this.lastOperation : '') + counts;
    }
}

/** Resolve Git SHA, branch, and the DataHub-owned report cache.
 * `_projectName` is retained for API compatibility with immutable callers
 * (case15.ts is `chattr +i`-guarded); the cache is keyed by the global
 * DataHub's repo, not by projectName. */
export function resolveSessionContext(
    ctx: SessionContext,
    _projectName: string,
): {
    sha: string | null;
    branch: string | null;
    store: DataHub;
} {
    const sha = getHeadSha();
    const branch = getCurrentBranch();
    const store = getDataHub();

    ctx.sha = sha;
    ctx.branch = branch;
    ctx.store = store;

    return { sha, branch, store };
}

function tryLoadFromCache(sha: string | null, store: DataHub): { result: ParseResult; source: 'cache' } | null {
    if (!sha) return null;
    try {
        const cached = store.loadReport(sha);
        if (cached && Array.isArray(cached.tests) && cached.tests.length > 0) {
            const tests = cached.tests;
            const stats = statsFromTests(tests);
            return {
                result: {
                    tests,
                    stats: { ...stats, duration: 0 },
                },
                source: 'cache',
            };
        }
    } catch (err) {
        rootLogger.warn('resolveTestDataSource: corrupted cache entry, falling through: ' + getErrorMessage(err));
    }
    return null;
}

function trySaveCiResult(
    downloaded: ParseResult,
    sha: string | null,
    branch: string | null,
    projectName: string,
    store: DataHub,
): void {
    if (!sha) return;
    store.saveReport(sha, downloaded.tests);
    const meta: ReportMeta = {
        sha,
        project: projectName,
        timestamp: Date.now(),
        tool: '',
        branch: branch ?? '',
        total: downloaded.stats.total,
        passed: downloaded.stats.passed,
        failed: downloaded.stats.failed,
        skipped: downloaded.stats.skipped,
    };
    store.put(sha, meta);
    store.flush(`qa-tools: auto-cache ${sha.slice(0, 7)}`);
}

/**
 * Get latest test result from DataHub.parsedArtifacts (SSOT).
 * Returns null when DataHub is not initialized or has no parsed artifacts.
 * Replaces fetchLatestTestRun() which made direct CI API calls (Invariant 6).
 */
function _getLatestTestResultFromDataHub(): ParseResult | null {
    if (!isDataHubInitialized()) return null;
    const hub = getDataHub();
    const artifacts = hub.raw.parsedArtifacts;
    if (!artifacts || artifacts.size === 0) return null;
    // Iterate runs in reverse order (latest first) and return first valid result
    const runIds = Array.from(artifacts.keys()).sort((a, b) => b - a);
    for (const runId of runIds) {
        const results = artifacts.get(runId);
        if (!results) continue;
        for (const artifact of results) {
            if (artifact.data.stats.total > 0) {
                return artifact.data;
            }
        }
    }
    return null;
}

function resolveFromBranch(
    projectName: string,
    branch: string | null,
    sha: string | null,
    store: DataHub,
): Promise<{ result: ParseResult; source: 'cache' | 'ci' | 'branch' } | null> | null {
    if (!branch || !sha) return null;
    const entries = store.getBranch(branch);
    if (entries.length === 0) return null;
    const lastSha = entries[0]?.sha;
    if (!lastSha) return null;
    return resolveTestDataSource(projectName, lastSha, branch, store);
}

/** Resolve test data source using 4-step sequential fallback:
 *  1. SHA cache hit → return cached
 *  2. CI download → cache → return
 *  3. Branch baseline → SHA → step 1
 *  4. Return null (caller handles prompt)
 *
 * This replaces _chooseTestDataSource in case17 with a
 * SHA-keyed, Git-backed resolution that never asks for a manual path. */
export async function resolveTestDataSource(
    projectName: string,
    sha: string | null,
    branch: string | null,
    store: DataHub,
): Promise<{ result: ParseResult; source: 'cache' | 'ci' | 'branch' } | null> {
    const cached = tryLoadFromCache(sha, store);
    if (cached) return cached;

    // DataHub SSOT: read parsed artifacts instead of downloading directly (Invariant 6)
    const downloaded = _getLatestTestResultFromDataHub();
    if (downloaded && downloaded.stats.total > 0) {
        trySaveCiResult(downloaded, sha, branch, projectName, store);
        return { result: downloaded, source: 'ci' };
    }

    const branchResult = resolveFromBranch(projectName, branch, sha, store);
    if (branchResult) return branchResult;

    return null;
}
