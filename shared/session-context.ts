import type { withSpinner } from './prompt';

interface SessionCountersItem {
    op: string;
    detail: string;
    status: string;
}

export interface TestResultSummary {
    status: 'ok' | 'error';
    label: string;
    message: string;
}

export class SessionContext {
    isBusy: boolean;
    lastOperation: string;
    sessionCounters: SessionCountersItem[];
    packageManager: unknown;
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

    resetResults(): void {
        this.results = [];
    }

    async withBusy<T>(fn: () => Promise<T>, label?: string): Promise<T> {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { withSpinner: spinnerFn } = require('./prompt') as { withSpinner: typeof withSpinner };
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
