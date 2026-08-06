/**
 * DataHub report retention policy — unit tests (C-12).
 *
 * Locks the retention contract: opt-in knobs default OFF (no-op, §10), union
 * semantics (kept if in the last N runs OR younger than the max age), protected
 * newest entry per branch, atomic index sanitation (no dangling refs), dry-run
 * never deletes, and invalid policies fail high (Regra 24).
 *
 * The policy is exercised via the real FsStoreBackend (no mock-teatro §26):
 * writes go to a mkdtemp sandbox and indexes are re-read from disk.
 *
 * N2-B: the sandbox is derived from `os.tmpdir()` via `mkdtempSync` (`tmpDir`).
 * The only direct FS call in this file is `rmSync` (sandbox cleanup), which
 * `security/detect-non-literal-fs-filename` does not flag — warning-free.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FsStoreBackend } from '../../infra/store-backend.js';
import { createDataHubPersistence } from '../persistence.js';
import type { DataHubPersistence, ReportMeta } from '../../types/data-hub.js';

vi.mock('../../logger');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-retention-test-'));
const backend = new FsStoreBackend(tmpDir);
const project = 'test-proj';

function clearRetentionEnv(): void {
    delete process.env['REPORT_RETENTION_COUNT'];
    delete process.env['REPORT_RETENTION_MAX_AGE_DAYS'];
}

describe('DataHub report retention (C-12)', () => {
    let store: DataHubPersistence;

    beforeEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });

        backend.init();
        store = createDataHubPersistence(project, backend);
        clearRetentionEnv();
    });

    afterEach(() => {
        clearRetentionEnv();
    });

    afterAll(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    function makeMeta(sha: string, timestamp: number, branch = 'main'): ReportMeta {
        return {
            sha,
            project,
            timestamp,
            tool: 'vitest',
            branch,
            total: 10,
            passed: 8,
            failed: 1,
            skipped: 1,
        };
    }

    function addRun(sha: string, timestamp: number, branch = 'main'): void {
        store.saveReport(sha, [{ title: 't-' + sha, state: 'passed', duration: 1 }]);
        store.put(sha, makeMeta(sha, timestamp, branch));
    }

    function readJson<T>(relPath: string): T | null {
        const buf = backend.read(relPath);
        if (!buf) return null;
        return JSON.parse(buf.toString('utf8')) as T;
    }

    function projIndex(): Record<string, ReportMeta> {
        return readJson<Record<string, ReportMeta>>(`reports/${project}/index.json`) ?? {};
    }

    function globalIndex(): Record<string, ReportMeta> {
        return readJson<Record<string, ReportMeta>>('reports/index.json') ?? {};
    }

    function branchIndex(): Record<string, Array<{ sha: string; timestamp: number }>> {
        return (
            readJson<Record<string, Array<{ sha: string; timestamp: number }>>>(
                `reports/${project}/branch-index.json`,
            ) ?? {}
        );
    }

    function seedBranchIndex(branches: Record<string, Array<{ sha: string; timestamp: number }>>): void {
        backend.write(`reports/${project}/branch-index.json`, Buffer.from(JSON.stringify(branches, null, 2), 'utf8'));
    }

    function sortShas(shas: string[]): string[] {
        return [...shas].sort((a, b) => a.localeCompare(b));
    }

    it('default (both knobs off) keeps every report — no-op (§10)', () => {
        expect.hasAssertions();

        for (let i = 1; i <= 7; i++) addRun('sha' + i, 1_000 + i);

        expect(store.loadReport('sha1')).not.toBeNull();
        expect(Object.keys(projIndex())).toHaveLength(7);
        expect(Object.keys(globalIndex())).toHaveLength(7);
        expect(store.pruneReports(false)).toStrictEqual([]);
        expect(store.loadReport('sha1')).not.toBeNull();
    });

    it('count=5 removes the 2 oldest cached reports after a put', () => {
        expect.hasAssertions();

        process.env['REPORT_RETENTION_COUNT'] = '5';
        for (let i = 1; i <= 7; i++) addRun('sha' + i, 1_000 + i);

        expect(store.loadReport('sha1')).toBeNull();
        expect(store.loadReport('sha2')).toBeNull();
        expect(store.loadReport('sha7')).not.toBeNull();
    });

    it('count=5 keeps global/project indexes consistent after the hook', () => {
        expect.hasAssertions();

        process.env['REPORT_RETENTION_COUNT'] = '5';
        for (let i = 1; i <= 7; i++) addRun('sha' + i, 1_000 + i);

        expect(Object.keys(projIndex())).toHaveLength(5);
        expect(Object.keys(globalIndex())).toHaveLength(5);
        expect(projIndex()['sha1']).toBeUndefined();
        expect(projIndex()['sha7']).toBeDefined();
        expect(globalIndex()['sha2']).toBeUndefined();
        expect(globalIndex()['sha7']).toBeDefined();
    });

    it('dry-run reports would-be removals without touching the store', () => {
        expect.hasAssertions();

        for (let i = 1; i <= 7; i++) addRun('sha' + i, 1_000 + i);
        process.env['REPORT_RETENTION_COUNT'] = '5';

        const removed = store.pruneReports(true);

        expect(removed).toHaveLength(2);
        expect(sortShas(removed)).toStrictEqual(['sha1', 'sha2']);
        expect(store.loadReport('sha1')).not.toBeNull();
        expect(Object.keys(projIndex())).toHaveLength(7);
        expect(Object.keys(globalIndex())).toHaveLength(7);
    });

    it('execute after dry-run deletes the removed report files', () => {
        expect.hasAssertions();

        for (let i = 1; i <= 7; i++) addRun('sha' + i, 1_000 + i);
        process.env['REPORT_RETENTION_COUNT'] = '5';

        expect(store.pruneReports(true)).toHaveLength(2);

        const removed = store.pruneReports(false);

        expect(sortShas(removed)).toStrictEqual(['sha1', 'sha2']);
        expect(store.loadReport('sha1')).toBeNull();
        expect(store.loadReport('sha2')).toBeNull();
        expect(backend.exists(`reports/${project}/sha1.json`)).toBeFalsy();
        expect(backend.exists(`reports/${project}/sha7.json`)).toBeTruthy();
    });

    it('execute keeps indexes consistent and is idempotent on re-run', () => {
        expect.hasAssertions();

        for (let i = 1; i <= 7; i++) addRun('sha' + i, 1_000 + i);
        process.env['REPORT_RETENTION_COUNT'] = '5';

        store.pruneReports(false);

        expect(Object.keys(projIndex())).toHaveLength(5);
        expect(Object.keys(globalIndex())).toHaveLength(5);
        expect(store.pruneReports(false)).toStrictEqual([]);
    });

    it('protects the newest entry per branch even when outside the last N', () => {
        expect.hasAssertions();

        seedBranchIndex({ main: [{ sha: 'sha1', timestamp: 1_001 }] });
        process.env['REPORT_RETENTION_COUNT'] = '5';
        for (let i = 1; i <= 7; i++) addRun('sha' + i, 1_000 + i);

        expect(store.loadReport('sha1')).not.toBeNull();
        expect(store.loadReport('sha2')).toBeNull();
        expect(Object.keys(projIndex())).toHaveLength(6);
    });

    it('filters removed SHAs out of the branch index (no dangling refs)', () => {
        expect.hasAssertions();

        seedBranchIndex({
            main: [
                { sha: 'sha1', timestamp: 1_001 },
                { sha: 'sha7', timestamp: 1_007 },
            ],
        });
        for (let i = 1; i <= 7; i++) addRun('sha' + i, 1_000 + i);
        process.env['REPORT_RETENTION_COUNT'] = '5';

        store.pruneReports(false);
        const entries = branchIndex()['main'] ?? [];

        expect(entries.map((e) => e.sha)).not.toContain('sha1');
        expect(entries.map((e) => e.sha)).not.toContain('sha2');
    });

    it('max-age only removes runs older than the threshold', () => {
        expect.hasAssertions();

        process.env['REPORT_RETENTION_MAX_AGE_DAYS'] = '1';
        const now = Date.now();
        for (let i = 1; i <= 5; i++) addRun('recent' + i, now - 60_000);
        addRun('old1', now - 10 * 86_400_000);
        addRun('old2', now - 15 * 86_400_000);

        expect(store.loadReport('old1')).toBeNull();
        expect(store.loadReport('old2')).toBeNull();
    });

    it('max-age only keeps recent runs', () => {
        expect.hasAssertions();

        process.env['REPORT_RETENTION_MAX_AGE_DAYS'] = '1';
        const now = Date.now();
        for (let i = 1; i <= 5; i++) addRun('recent' + i, now - 60_000);
        addRun('old1', now - 10 * 86_400_000);

        expect(store.loadReport('recent1')).not.toBeNull();
        expect(store.loadReport('recent5')).not.toBeNull();
        expect(Object.keys(projIndex())).toHaveLength(5);
    });

    it('union semantics: young-but-not-in-N is kept; only old-and-not-in-N is removed', () => {
        expect.hasAssertions();

        process.env['REPORT_RETENTION_COUNT'] = '3';
        process.env['REPORT_RETENTION_MAX_AGE_DAYS'] = '30';
        const now = Date.now();
        for (let i = 1; i <= 7; i++) addRun('recent' + i, now - 86_400_000);
        addRun('old1', now - 40 * 86_400_000);
        addRun('old2', now - 50 * 86_400_000);

        expect(store.loadReport('old1')).toBeNull();
        expect(store.loadReport('old2')).toBeNull();
        expect(store.loadReport('recent1')).not.toBeNull();
        expect(Object.keys(projIndex())).toHaveLength(7);
    });

    it('invalid retention values fail high (int >= 0)', () => {
        expect.hasAssertions();

        process.env['REPORT_RETENTION_COUNT'] = '-1';

        expect(() => store.pruneReports(false)).toThrow(/REPORT_RETENTION_COUNT/);

        Reflect.deleteProperty(process.env, 'REPORT_RETENTION_COUNT');
        process.env['REPORT_RETENTION_COUNT'] = 'abc';

        expect(() => store.pruneReports(false)).toThrow(/REPORT_RETENTION_COUNT/);

        Reflect.deleteProperty(process.env, 'REPORT_RETENTION_COUNT');
        process.env['REPORT_RETENTION_COUNT'] = '5.5';

        expect(() => store.pruneReports(false)).toThrow(/REPORT_RETENTION_COUNT/);

        Reflect.deleteProperty(process.env, 'REPORT_RETENTION_COUNT');
        process.env['REPORT_RETENTION_MAX_AGE_DAYS'] = '-3';

        expect(() => store.pruneReports(false)).toThrow(/REPORT_RETENTION_MAX_AGE_DAYS/);

        Reflect.deleteProperty(process.env, 'REPORT_RETENTION_MAX_AGE_DAYS');
        process.env['REPORT_RETENTION_MAX_AGE_DAYS'] = '3';

        expect(() => store.pruneReports(false)).not.toThrow();
    });
});
