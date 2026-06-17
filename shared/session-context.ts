/** Per-session state: counters, results, busy flag, and history.
 * Each command handler receives a {@link SessionContext} to track progress and build context lines.
 *
 * Sprint C extension: resolveTestDataSource() replaces manual path with
 * SHA-keyed cache lookup + CI auto-download via Store. */
import { withSpinner } from './prompt.js';
import { getHeadSha, getCurrentBranch } from './git-sha.js';
import { detectStoreBackend, detectProjectGitDir } from './store-backend.js';
import { Store, type ReportMeta } from './store.js';
import { fetchLatestTestRun } from './git-artifact-downloader.js';
import type { ParseResult } from './result_parser.js';
import { rootLogger } from './logger.js';

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
    /** Store instance for cache access (populated by resolveSessionContext). */
    store: Store | null;

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
        const counts = ok > 0 || er > 0 ? ' | ' + ok + ' ok' + (er > 0 ? ' · ' + er + ' erro' : '') : '';
        const prefix = projectName || '';
        return prefix + (this.lastOperation ? ' | ' + this.lastOperation : '') + counts;
    }
}

/** Resolve Git SHA, branch, and initialize Store for the given project. */
export function resolveSessionContext(
    ctx: SessionContext,
    projectName: string,
): { sha: string | null; branch: string | null; store: Store } {
    const sha = getHeadSha();
    const branch = getCurrentBranch();
    const gitDir = detectProjectGitDir();
    const backend = detectStoreBackend(gitDir ?? undefined);
    const store = new Store(backend, projectName);

    ctx.sha = sha;
    ctx.branch = branch;
    ctx.store = store;

    return { sha, branch, store };
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
    store: Store,
): Promise<{ result: ParseResult; source: 'cache' | 'ci' | 'branch' } | null> {
    if (sha) {
        try {
            const cached = store.loadReport(sha);
            if (cached && Array.isArray(cached.tests) && cached.tests.length > 0) {
                const tests = cached.tests;
                const passed = tests.filter((t) => t.state === 'passed').length;
                const failed = tests.filter((t) => t.state === 'failed').length;
                const skipped = tests.filter((t) => t.state === 'skipped').length;
                return {
                    result: {
                        tests,
                        stats: { passed, failed, skipped, total: tests.length, duration: 0 },
                    },
                    source: 'cache',
                };
            }
        } catch {
            rootLogger.warn('resolveTestDataSource: corrupted cache entry, falling through');
        }
    }

    const downloaded = await fetchLatestTestRun();
    if (downloaded && downloaded.stats.total > 0) {
        if (sha) {
            store.saveReport(sha, downloaded.tests);
            const meta: ReportMeta = {
                sha,
                project: projectName,
                timestamp: Date.now(),
                tool: '',
                branch: branch || '',
                total: downloaded.stats.total,
                passed: downloaded.stats.passed,
                failed: downloaded.stats.failed,
                skipped: downloaded.stats.skipped,
            };
            store.put(sha, meta);
            store.flush(`qa-tools: auto-cache ${sha.slice(0, 7)}`);
        }
        return { result: downloaded, source: 'ci' };
    }

    if (branch && sha) {
        const entries = store.getBranch(branch);
        if (entries.length > 0) {
            const lastSha = entries[0]?.sha;
            if (lastSha) {
                return resolveTestDataSource(projectName, lastSha, branch, store);
            }
        }
    }

    return null;
}
