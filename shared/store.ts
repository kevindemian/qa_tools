import type { StoreBackend } from './store-backend.js';
import type { FlatTest } from './result_parser.js';

export interface ReportMeta {
    sha: string;
    project: string;
    timestamp: number;
    tool: string;
    branch: string;
    total: number;
    passed: number;
    failed: number;
    skipped: number;
}

export interface BranchEntry {
    sha: string;
    timestamp: number;
}

function readJson<T>(backend: StoreBackend, relPath: string): T | null {
    const buf = backend.read(relPath);
    if (!buf) return null;
    try {
        return JSON.parse(buf.toString('utf8')) as T;
    } catch {
        return null;
    }
}

function writeJson<T>(backend: StoreBackend, relPath: string, data: T): void {
    backend.write(relPath, Buffer.from(JSON.stringify(data, null, 2), 'utf8'));
}

export class Store {
    private initialized = false;

    constructor(
        private readonly backend: StoreBackend,
        private readonly project: string,
    ) {}

    private ensure(): void {
        if (!this.initialized) {
            this.backend.init();
            this.initialized = true;
        }
    }

    lookup(sha: string): ReportMeta | null {
        const index = readJson<Record<string, ReportMeta>>(this.backend, 'reports/index.json');
        return index?.[sha] ?? null;
    }

    put(sha: string, meta: ReportMeta): void {
        this.ensure();
        const globalIndex = readJson<Record<string, ReportMeta>>(this.backend, 'reports/index.json') ?? {};
        globalIndex[sha] = meta;
        writeJson(this.backend, 'reports/index.json', globalIndex);

        const projIndex =
            readJson<Record<string, ReportMeta>>(this.backend, `reports/${this.project}/index.json`) ?? {};
        projIndex[sha] = meta;
        writeJson(this.backend, `reports/${this.project}/index.json`, projIndex);
    }

    listByProject(): ReportMeta[] {
        const projIndex =
            readJson<Record<string, ReportMeta>>(this.backend, `reports/${this.project}/index.json`) ?? {};
        return Object.values(projIndex).sort((a, b) => b.timestamp - a.timestamp);
    }

    appendBranch(branch: string, entry: BranchEntry): void {
        this.ensure();
        const bi =
            readJson<Record<string, BranchEntry[]>>(this.backend, `reports/${this.project}/branch-index.json`) ?? {};
        (bi[branch] ??= []).unshift(entry);
        writeJson(this.backend, `reports/${this.project}/branch-index.json`, bi);
    }

    getBranch(branch: string): BranchEntry[] {
        const bi =
            readJson<Record<string, BranchEntry[]>>(this.backend, `reports/${this.project}/branch-index.json`) ?? {};
        return bi[branch] ?? [];
    }

    saveReport(sha: string, data: FlatTest[]): void {
        this.ensure();
        writeJson(this.backend, `reports/${this.project}/${sha}.json`, { tests: data });
    }

    loadReport(sha: string): { tests: FlatTest[] } | null {
        return readJson<{ tests: FlatTest[] }>(this.backend, `reports/${this.project}/${sha}.json`);
    }

    loadMetrics<T = Record<string, unknown>>(): T | null {
        return readJson<T>(this.backend, `reports/${this.project}/metrics.json`);
    }

    saveMetrics<T>(data: T): void {
        this.ensure();
        writeJson(this.backend, `reports/${this.project}/metrics.json`, data);
    }

    flush(message: string): void {
        this.ensure();
        this.backend.flush(message);
    }
}
