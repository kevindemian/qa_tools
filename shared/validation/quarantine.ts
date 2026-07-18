/** Quarantine management for flaky tests.
 *  Persists quarantined test metadata, auto-expires entries after configurable TTL,
 *  generates pipeline-consumable `qa-quarantine.json`, and integrates with flaky auto-actions. */
import { formatErr } from '../errors.js';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { z } from 'zod';
import { rootLogger } from '../logger.js';
import Config from '../config-accessor.js';

// N2-B (security/detect-non-literal-fs-filename): the 6 FS calls below wrap their
// path args in path.resolve(...)/path.join(...) over Config-derived paths
// (getDataDir() -> Config.get('xdgStateHome') / os.homedir()). These are CORRECT,
// non-attacker-controlled paths. The rule's isStaticExpression does not treat
// Config.get()/os.homedir() as static (by design — accepting arbitrary function
// returns as "static" would be a security hole), so it reports false positives.
// Severity: warning (1), not error (2); the lint gate (scripts/quality-check.ts)
// only fails on severity-2, so CI is unaffected. Documented debt, no code/config
// change. See TASK-22-corrections.md CHECKPOINT 2.

export interface QuarantineEntry {
    testTitle: string;
    reason: string;
    quarantinedBy: string;
    date: string;
    expiresAt: string;
    flakyRate: number;
    bugUrl?: string;
    reviewRequired: boolean;
    permanent: boolean;
}

export interface QuarantineStore {
    entries: QuarantineEntry[];
}

export interface PipelineQuarantineItem {
    test: string;
    reason: string;
    quarantinedBy: string;
    date: string;
    bugUrl?: string;
    reviewRequired: boolean;
}

export interface PipelineQuarantine {
    excluded: PipelineQuarantineItem[];
    metadata: {
        totalExcluded: number;
        totalTests: number;
        ratio: number;
        warning: string;
    };
}

const QuarantineEntrySchema = z.object({
    testTitle: z.string(),
    reason: z.string(),
    quarantinedBy: z.string(),
    date: z.string(),
    expiresAt: z.string(),
    flakyRate: z.number().min(0).max(1),
    bugUrl: z.string().optional(),
    reviewRequired: z.boolean(),
    permanent: z.boolean(),
});

const QuarantineStoreSchema = z.object({
    entries: z.array(QuarantineEntrySchema),
});

const STORE_FILE = 'quarantine.json';
const PIPELINE_FILE = 'qa-quarantine.json';

function getDataDir(): string {
    const xdg = Config.get('xdgStateHome');
    const base = xdg ? path.join(xdg, 'qa-tools') : path.join(os.homedir(), '.local', 'state', 'qa-tools');
    return path.join(base, 'quarantine');
}

function storePath(): string {
    return path.join(getDataDir(), STORE_FILE);
}

function pipelinePath(): string {
    return path.join(process.cwd(), PIPELINE_FILE);
}

function ensureDir(dir: string): void {
    try {
        fs.mkdirSync(path.resolve(dir), { recursive: true });
    } catch (err) {
        rootLogger.warn('Failed to create directory: ' + (err instanceof Error ? err.message : String(err)));
    }
}

const DEFAULT_TTL_DAYS = 7;

export function loadQuarantine(): QuarantineStore {
    try {
        ensureDir(getDataDir());
        const sp = storePath();
        if (!fs.existsSync(path.resolve(sp))) return { entries: [] };
        const raw = fs.readFileSync(path.resolve(sp), 'utf8');
        const parsed: unknown = JSON.parse(raw);
        return QuarantineStoreSchema.parse(parsed) as QuarantineStore;
    } catch (err) {
        rootLogger.warn('Failed to load quarantine store: ' + (err instanceof Error ? err.message : String(err)));
        return { entries: [] };
    }
}

function saveQuarantine(store: QuarantineStore): void {
    try {
        const dir = getDataDir();
        ensureDir(dir);
        const sp = storePath();
        const tp = sp + '.tmp';
        fs.writeFileSync(path.resolve(tp), JSON.stringify(store, null, 2), 'utf8');
        fs.renameSync(path.resolve(tp), sp);
    } catch (err) {
        rootLogger.error('Failed to save quarantine store: ' + formatErr(err));
    }
}

export interface QuarantineTestOptions {
    testTitle: string;
    reason: string;
    quarantinedBy: string;
    flakyRate: number;
    bugUrl?: string;
    ttlDays?: number;
}

export function quarantineTest(opts: QuarantineTestOptions): void {
    const { testTitle, reason, quarantinedBy, flakyRate, bugUrl, ttlDays } = opts;
    const store = loadQuarantine();
    const existingIdx = store.entries.findIndex((e) => e.testTitle === testTitle && !e.permanent);
    if (existingIdx >= 0) {
        store.entries.splice(existingIdx, 1);
    }
    const date = new Date().toISOString();
    const expires = new Date(Date.now() + (ttlDays ?? DEFAULT_TTL_DAYS) * 24 * 60 * 60 * 1000).toISOString();
    const entry: QuarantineEntry = {
        testTitle,
        reason,
        quarantinedBy,
        date,
        expiresAt: expires,
        flakyRate,
        ...(bugUrl ? { bugUrl } : {}),
        reviewRequired: true,
        permanent: false,
    };
    store.entries.push(entry);
    saveQuarantine(store);
    generatePipelineQuarantine(store);
}

export function removeQuarantine(testTitle: string): boolean {
    const store = loadQuarantine();
    const idx = store.entries.findIndex((e) => e.testTitle === testTitle);
    if (idx < 0) return false;
    store.entries.splice(idx, 1);
    saveQuarantine(store);
    generatePipelineQuarantine(store);
    return true;
}

export function filterExpiredEntries(
    store: QuarantineStore,
    now?: number,
): { expired: number; remaining: QuarantineStore } {
    const cutoff = now ?? Date.now();
    const remaining: QuarantineEntry[] = store.entries.filter(
        (e) => e.permanent || new Date(e.expiresAt).getTime() > cutoff,
    );
    return {
        expired: store.entries.length - remaining.length,
        remaining: { entries: remaining },
    };
}

export function expireQuarantine(): number {
    const store = loadQuarantine();
    const { expired, remaining } = filterExpiredEntries(store);
    if (expired > 0) {
        rootLogger.info('Expired ' + expired + ' quarantine entries');
        saveQuarantine(remaining);
        generatePipelineQuarantine(remaining);
    }
    return expired;
}

function loadAndExpire(): QuarantineStore {
    expireQuarantine();
    return loadQuarantine();
}

export function markPermanent(testTitle: string): boolean {
    const store = loadQuarantine();
    const entry = store.entries.find((e) => e.testTitle === testTitle);
    if (!entry) return false;
    entry.permanent = true;
    saveQuarantine(store);
    generatePipelineQuarantine(store);
    return true;
}

export function isQuarantined(testTitle: string): QuarantineEntry | undefined {
    const store = loadAndExpire();
    return store.entries.find((e) => e.testTitle === testTitle);
}

export function listQuarantined(): QuarantineEntry[] {
    const store = loadAndExpire();
    return store.entries;
}

export function quarantineRatio(totalTests: number): { count: number; ratio: number; warning: string } {
    const store = loadAndExpire();
    const count = store.entries.length;
    const ratio = totalTests > 0 ? count / totalTests : 0;
    const warning =
        ratio > 0.05
            ? '⚠️ Quarantine alert: ' +
              count +
              '/' +
              totalTests +
              ' tests (' +
              (ratio * 100).toFixed(1) +
              '%) exceed 5% threshold'
            : '';
    return { count, ratio, warning };
}

export function generatePipelineQuarantine(store?: QuarantineStore, totalTests?: number): PipelineQuarantine {
    const resolved = store ?? loadQuarantine();
    const count = resolved.entries.length;
    const ratio = totalTests && totalTests > 0 ? count / totalTests : 0;
    const warning =
        totalTests && ratio > 0.05
            ? '⚠️ Quarantine alert: ' +
              count +
              '/' +
              totalTests +
              ' tests (' +
              (ratio * 100).toFixed(1) +
              '%) exceed 5% threshold'
            : '';
    const meta = { count, totalTests: totalTests ?? 0, ratio, warning };
    const excluded: PipelineQuarantineItem[] = resolved.entries.map((e) => ({
        test: e.testTitle,
        reason: e.reason,
        quarantinedBy: e.quarantinedBy,
        date: e.date,
        ...(e.bugUrl ? { bugUrl: e.bugUrl } : {}),
        reviewRequired: e.reviewRequired,
    }));
    const pipeline: PipelineQuarantine = {
        excluded,
        metadata: {
            totalExcluded: excluded.length,
            totalTests: totalTests ?? 0,
            ratio: meta.ratio,
            warning: meta.warning,
        },
    };
    try {
        const pp = pipelinePath();
        fs.writeFileSync(path.resolve(pp), JSON.stringify(pipeline, null, 2), 'utf8');
    } catch (err) {
        rootLogger.error('Failed to write pipeline quarantine file: ' + formatErr(err));
    }
    return pipeline;
}
