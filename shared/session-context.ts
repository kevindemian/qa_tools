/** Per-session state: counters, results, busy flag, and history.
 * Each command handler receives a {@link SessionContext} to track progress and build context lines. */
import { withSpinner } from './prompt';

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
    }

    /** Clear all result entries from the current session. */
    resetResults(): void {
        this.results = [];
    }

    /** Run a function while marking the session as busy (shows a spinner if `label` is provided). */
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

    /** Record an operation in session history.
     * @param op — Operation name (e.g. `'trocar-projeto'`).
     * @param detail — Detail/result (e.g. `'NEWPROJ'`).
     * @param status — `'ok'` or `'error'`. */
    pushHistory(op: string, detail: string, status: string): void {
        this.sessionCounters.push({ op, detail, status });
        this.lastOperation = op + ': ' + detail;
    }

    /** Build a one-line status string for the UI: `"Project | Last Op | 3 ok · 1 erro"`. */
    buildContextLine(projectName?: string): string {
        const ok = this.sessionCounters.filter((c) => c.status === 'ok').length;
        const er = this.sessionCounters.filter((c) => c.status === 'error').length;
        const counts = ok > 0 || er > 0 ? ' | ' + ok + ' ok' + (er > 0 ? ' · ' + er + ' erro' : '') : '';
        const prefix = projectName || '';
        return prefix + (this.lastOperation ? ' | ' + this.lastOperation : '') + counts;
    }
}
