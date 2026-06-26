import { rootLogger } from './logger.js';
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

function emptyRecord<V>(): Record<string, V> {
    return Object.create(null) as { [key: string]: V };
}

function readJson<T>(backend: StoreBackend, relPath: string): T | null {
    try {
        const buf = backend.read(relPath);
        if (!buf) return null;
        const parsed: unknown = JSON.parse(buf.toString('utf8'));
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
            rootLogger.warn(
                `store: ${relPath} — esperado objeto, recebido ${typeof parsed}. Verifique se o arquivo não foi corrompido.`,
            );
            return null;
        }
        const source = parsed as { [key: string]: unknown };
        const entries = Object.entries(source);
        return Object.fromEntries(entries) as T;
    } catch (err: unknown) {
        rootLogger.warn(
            `store: falha ao ler ${relPath} — ${err instanceof Error ? err.message : String(err)}. Verifique permissões e espaço em disco.`,
        );
        return null;
    }
}

function writeJson<T>(backend: StoreBackend, relPath: string, data: T): void {
    try {
        backend.write(relPath, Buffer.from(JSON.stringify(data, null, 2), 'utf8'));
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        rootLogger.warn(`store: falha ao escrever ${relPath} — ${msg}. Verifique permissões e espaço em disco.`);
        throw err;
    }
}

export class Store {
    private initialized = false;

    constructor(
        private readonly backend: StoreBackend,
        private readonly project: string,
    ) {}

    private ensure(): void {
        if (!this.initialized) {
            try {
                this.backend.init();
                this.initialized = true;
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                rootLogger.warn(`store: falha ao inicializar backend — ${msg}. Verifique o estado do repositório.`);
                throw err;
            }
        }
    }

    lookup(sha: string): ReportMeta | null {
        const index = readJson<Record<string, ReportMeta>>(this.backend, 'reports/index.json');
        const entries = index ? Object.entries(index) : [];
        const entry = entries.find(([k]) => k === sha);
        return entry?.[1] ?? null;
    }

    put(sha: string, meta: ReportMeta): void {
        this.ensure();
        const globalIndex =
            readJson<Record<string, ReportMeta>>(this.backend, 'reports/index.json') ?? emptyRecord<ReportMeta>();
        const globalEntries = Object.entries(globalIndex).filter(([k]) => k !== sha);
        globalEntries.push([sha, meta]);
        writeJson(this.backend, 'reports/index.json', Object.fromEntries(globalEntries));

        const projIndex =
            readJson<Record<string, ReportMeta>>(this.backend, `reports/${this.project}/index.json`) ??
            emptyRecord<ReportMeta>();
        const projEntries = Object.entries(projIndex).filter(([k]) => k !== sha);
        projEntries.push([sha, meta]);
        writeJson(this.backend, `reports/${this.project}/index.json`, Object.fromEntries(projEntries));
    }

    listByProject(): ReportMeta[] {
        const projIndex =
            readJson<Record<string, ReportMeta>>(this.backend, `reports/${this.project}/index.json`) ??
            emptyRecord<ReportMeta>();
        return Object.values(projIndex).sort((a, b) => b.timestamp - a.timestamp);
    }

    appendBranch(branch: string, entry: BranchEntry): void {
        this.ensure();
        const raw =
            readJson<Record<string, unknown>>(this.backend, `reports/${this.project}/branch-index.json`) ??
            emptyRecord<unknown>();
        const rawEntries = Object.entries(raw);
        const existingEntry = rawEntries.find(([k]) => k === branch);
        const existing = existingEntry?.[1];
        const filtered = rawEntries.filter(([k]) => k !== branch);
        const newBranch: BranchEntry[] = [entry];
        if (Array.isArray(existing)) {
            for (const item of existing) newBranch.push(item as BranchEntry);
        }
        filtered.push([branch, newBranch]);
        writeJson(this.backend, `reports/${this.project}/branch-index.json`, Object.fromEntries(filtered));
    }

    getBranch(branch: string): BranchEntry[] {
        const raw =
            readJson<Record<string, unknown>>(this.backend, `reports/${this.project}/branch-index.json`) ??
            emptyRecord<unknown>();
        const rawEntries = Object.entries(raw);
        const entry = rawEntries.find(([k]) => k === branch);
        const val = entry?.[1];
        return Array.isArray(val) ? (val as BranchEntry[]) : [];
    }

    saveReport(sha: string, data: FlatTest[]): void {
        this.ensure();
        writeJson(this.backend, `reports/${this.project}/${sha}.json`, { tests: data });
    }

    loadReport(sha: string): { tests: FlatTest[] } | null {
        return readJson<{ tests: FlatTest[] }>(this.backend, `reports/${this.project}/${sha}.json`);
    }

    loadMetrics<T = { [key: string]: unknown }>(): T | null {
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
