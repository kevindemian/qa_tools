/**
 * DataHub persistence error/side-effect paths — unit tests.
 *
 * Exercises the persistence adapter against the REAL FsStoreBackend / GitStoreBackend
 * (no mock-teatro §26): every assertion validates on-disk state or explicit
 * logger side effects. Covers the failure flows that the retention suite does
 * not reach (schema fallback, atomic-write failure, deletion failure, metrics
 * cap, category round-trips, flush failure).
 *
 * The only module mock is the logger boundary (`vi.mock('../../logger')`), the
 * same pattern used by the retention suite — the logger is external console/file
 * I/O, and mocking it lets us assert that errors are NEVER swallowed (§25).
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FsStoreBackend, GitStoreBackend } from '../../infra/store-backend.js';
import { createDataHubPersistence } from '../persistence.js';
import { rootLogger } from '../../logger.js';
import type {
    DataHubPersistence,
    ReportMeta,
    MetricsRun,
    QualityMetricsSnapshot,
    RawPullRequest,
} from '../../types/data-hub.js';

vi.mock('../../logger');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-persistence-real-'));
const backend = new FsStoreBackend(tmpDir);
const project = 'test-proj';

function clearRetentionEnv(): void {
    delete process.env['REPORT_RETENTION_COUNT'];
    delete process.env['REPORT_RETENTION_MAX_AGE_DAYS'];
}

function makeMeta(sha: string, timestamp: number): ReportMeta {
    return {
        sha,
        project,
        timestamp,
        tool: 'vitest',
        branch: 'main',
        total: 10,
        passed: 8,
        failed: 1,
        skipped: 1,
    };
}

function makeRun(title: string): MetricsRun {
    return {
        timestamp: new Date().toISOString(),
        project,
        total: 1,
        passed: 1,
        failed: 0,
        skipped: 0,
        duration: 1,
        tests: [{ title, state: 'passed', duration: 1 }],
    };
}

function readJson<T>(relPath: string): T | null {
    const buf = backend.read(relPath);
    if (!buf) return null;
    return JSON.parse(buf.toString('utf8')) as T;
}

function writeTwoRunIndexes(): void {
    backend.write(
        'reports/index.json',
        Buffer.from(JSON.stringify({ sha1: makeMeta('sha1', 1_001), sha2: makeMeta('sha2', 1_002) }, null, 2), 'utf8'),
    );
    backend.write(
        'reports/test-proj/index.json',
        Buffer.from(JSON.stringify({ sha1: makeMeta('sha1', 1_001), sha2: makeMeta('sha2', 1_002) }, null, 2), 'utf8'),
    );
}

describe('DataHub persistence (real backend)', () => {
    let store: DataHubPersistence;

    beforeEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });

        backend.init();
        store = createDataHubPersistence(project, backend);
        clearRetentionEnv();
        vi.clearAllMocks();
    });

    afterEach(() => {
        clearRetentionEnv();
    });

    afterAll(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('falls back to an empty store and warns when metrics/global.json fails schema validation', () => {
        expect.hasAssertions();

        backend.write('metrics/global.json', Buffer.from('{"runs":"not-an-array"}', 'utf8'));

        expect(store.loadCoverageHistory('test-proj')).toStrictEqual([]);

        expect(rootLogger['warn']).toHaveBeenCalledTimes(1);
        expect(rootLogger['warn']).toHaveBeenCalledWith(expect.stringContaining('schema validation failed'));
    });

    it('logs and rethrows when an index atomic rewrite fails', () => {
        expect.hasAssertions();

        process.env['REPORT_RETENTION_COUNT'] = '1';
        writeTwoRunIndexes();
        backend.write('reports/test-proj/branch-index.json/x', Buffer.from('x'));

        expect(() => store.pruneReports(false)).toThrow(/falha ao escrever atomicamente/);

        expect(rootLogger['error']).toHaveBeenCalledTimes(1);
        expect(rootLogger['error']).toHaveBeenCalledWith(expect.stringContaining('falha ao reescrever atomicamente'));
    });

    it('logs and rethrows when a removed report file cannot be deleted', () => {
        expect.hasAssertions();

        process.env['REPORT_RETENTION_COUNT'] = '1';
        writeTwoRunIndexes();
        backend.write(
            'reports/test-proj/branch-index.json',
            Buffer.from(
                JSON.stringify(
                    {
                        main: [
                            { sha: 'sha1', timestamp: 1_001 },
                            { sha: 'sha2', timestamp: 1_002 },
                        ],
                    },
                    null,
                    2,
                ),
                'utf8',
            ),
        );
        backend.write('reports/test-proj/sha1.json/x', Buffer.from('x'));

        expect(() => store.pruneReports(false)).toThrow(/ENOTEMPTY|EISDIR|ENOTDIR|directory not empty/);

        expect(rootLogger['error']).toHaveBeenCalledTimes(1);
        expect(rootLogger['error']).toHaveBeenCalledWith(expect.stringContaining('falha ao remover'));

        const proj = readJson<Record<string, ReportMeta>>('reports/test-proj/index.json') ?? {};

        expect(proj['sha1']).toBeUndefined();
    });

    it('caps the metrics store at the last 50 runs', () => {
        expect.hasAssertions();

        for (let i = 0; i < 55; i++) store.saveRun('sha' + i, makeRun('run-' + i));

        const parsed = readJson<{ runs: Array<{ tests: Array<{ title: string }> }> }>('metrics/global.json');

        expect(parsed).not.toBeNull();
        expect(parsed?.runs).toHaveLength(50);
        expect(parsed?.runs[0]?.tests[0]?.title).toBe('run-5');
        expect(parsed?.runs[49]?.tests[0]?.title).toBe('run-54');
    });

    it('round-trips quality metrics snapshots through the store', () => {
        expect.hasAssertions();

        const snap1: QualityMetricsSnapshot = {
            timestamp: '2026-01-01T00:00:00.000Z',
            invariantFireCount: { R1: 2 },
            layerPassRates: { layer1: 0.9, layer2: 0.8, layer3: 0.7 },
            layerAttempts: { layer1: 10, layer2: 10, layer3: 10 },
            artifactTypeCounts: { junit: 3 },
            avgStructureScore: 0.85,
        };
        const snap2: QualityMetricsSnapshot = { ...snap1, timestamp: '2026-01-02T00:00:00.000Z' };

        store.saveQualityMetrics(snap1);
        store.saveQualityMetrics(snap2);

        expect(store.loadQualityMetricsHistory()).toStrictEqual([snap1, snap2]);
    });

    it('round-trips pull requests through the store', () => {
        expect.hasAssertions();

        const prs: RawPullRequest[] = [
            { id: 1, number: 42, title: 'feat: x', confidence: 0.9 },
            { id: 2, number: 43, state: 'merged', merged: true, confidence: 0.95 },
        ];

        store.savePullRequests(prs);

        expect(store.loadPullRequests()).toStrictEqual(prs);
    });

    it('round-trips arbitrary metrics JSON through saveMetrics/loadMetrics', () => {
        expect.hasAssertions();

        store.saveMetrics({ foo: 'bar', n: 1, nested: { ok: true } });

        expect(store.loadMetrics()).toStrictEqual({ foo: 'bar', n: 1, nested: { ok: true } });
    });

    it('logs and rethrows when the git flush fails', () => {
        expect.hasAssertions();

        const gitDir = path.join(tmpDir, 'git-flush-persist');
        const fb = new FsStoreBackend(gitDir);
        fb.write('.git', Buffer.from('not a git dir'));
        const gb = new GitStoreBackend(gitDir, '.qa-tools');
        const gstore = createDataHubPersistence(project, gb);

        expect(() => gstore.flush('test commit')).toThrow(/git add\/commit falhou/);

        expect(rootLogger['warn']).toHaveBeenCalledTimes(1);
        expect(rootLogger['warn']).toHaveBeenCalledWith(expect.stringContaining('flush failed'));
    });
});
