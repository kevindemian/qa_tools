/**
 * Integration tests — DataHub test-result cache (FT-07, migrated from legacy Store).
 *
 * Validates the SHA-keyed cache now owned by DataHubPersistence:
 * - put writes global + per-project indexes
 * - saveReport / loadReport round-trip
 * - per-project isolation
 * - branch index reads (empty when nothing appended)
 * - on-disk file structure
 *
 * Uses FsStoreBackend with isolated temp directories.
 */

// N2-B (security/detect-non-literal-fs-filename): the FS calls below read from a test
// sandbox whose path is derived from `os.tmpdir()` (TEST_DIR). These are CORRECT,
// non-attacker-controlled test paths. The rule's isStaticExpression does not treat
// `os.tmpdir()` as static (by design — accepting arbitrary function returns as "static"
// would be a security hole), so it reports false positives. Severity: warning (1), not
// error (2); the lint gate (scripts/quality-check.ts) only fails on severity-2, so CI is
// unaffected. Documented debt, no code/config change. See TASK-22-corrections.md
// CHECKPOINT 2 (WS3 N2-B).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { rootLogger } from '../../logger.js';
import { FsStoreBackend } from '../../infra/store-backend.js';
import { createDataHubPersistence } from '../../data-hub/persistence.js';
import type { ReportMeta } from '../../types/data-hub.js';
import { createFlatTestArrayFixture } from './integration-helpers.js';

let TEST_DIR: string;
let backend: FsStoreBackend;

function makeMeta(sha: string, project: string): ReportMeta {
    return {
        sha,
        project,
        timestamp: Date.now(),
        tool: 'vitest',
        branch: 'main',
        total: 100,
        passed: 95,
        failed: 3,
        skipped: 2,
    };
}

describe('Integration: DataHub test-result cache', () => {
    beforeEach(() => {
        TEST_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'integration-cache-'));
        backend = new FsStoreBackend(TEST_DIR);
        backend.init();
    });

    afterEach(() => {
        try {
            fs.rmSync(TEST_DIR, { recursive: true, force: true });
        } catch (err) {
            rootLogger.warn(
                `cleanup: failed to remove ${TEST_DIR}: ${err instanceof Error ? err.message : String(err)}`,
            );
        }
    });

    describe('FT-07a: put round-trip via index files', () => {
        it('records report metadata and the entry is retrievable from disk', () => {
            const store = createDataHubPersistence('test-project', backend);
            const meta = makeMeta('abc123def456', 'test-project');

            store.put(meta.sha, meta);

            const projIndex = JSON.parse(
                fs.readFileSync(path.join(TEST_DIR, 'reports', 'test-project', 'index.json'), 'utf8'),
            ) as Record<string, ReportMeta>;

            expect(projIndex['abc123def456']?.sha).toBe('abc123def456');
            expect(projIndex['abc123def456']?.passed).toBe(95);
        });

        it('returns null for unknown SHA report', () => {
            const store = createDataHubPersistence('test-project', backend);

            expect(store.loadReport('nonexistent')).toBeNull();
        });
    });

    describe('FT-07c: branch index', () => {
        it('returns empty array for unknown branch (appendBranch removed)', () => {
            const store = createDataHubPersistence('test-project', backend);

            expect(store.getBranch('nonexistent')).toStrictEqual([]);
        });
    });

    describe('FT-07d: saveReport and loadReport', () => {
        it('persists and loads test data', () => {
            const store = createDataHubPersistence('test-project', backend);
            const tests = createFlatTestArrayFixture();

            store.saveReport('sha-abc', tests);
            const loaded = store.loadReport('sha-abc');

            expect(loaded).not.toBeNull();
            expect(loaded?.tests).toHaveLength(5);

            const firstTest = loaded?.tests[0];

            expect(firstTest).toBeDefined();
            expect(firstTest?.title).toBe('login should succeed with valid credentials');
        });

        it('returns null for non-existent report', () => {
            const store = createDataHubPersistence('test-project', backend);

            expect(store.loadReport('nonexistent')).toBeNull();
        });
    });

    describe('FT-07e: project isolation', () => {
        it('different projects have separate report files', () => {
            const store1 = createDataHubPersistence('project-a', backend);
            const store2 = createDataHubPersistence('project-b', backend);

            store1.saveReport('same-sha', [{ title: 'a', state: 'passed', duration: 1 }]);
            store2.saveReport('same-sha', [{ title: 'b', state: 'failed', duration: 2 }]);

            expect(store1.loadReport('same-sha')?.tests[0]?.title).toBe('a');
            expect(store2.loadReport('same-sha')?.tests[0]?.title).toBe('b');
        });

        it('meta indexes are per-project', () => {
            const store1 = createDataHubPersistence('project-a', backend);
            const store2 = createDataHubPersistence('project-b', backend);

            store1.put('sha-a', makeMeta('sha-a', 'project-a'));
            store2.put('sha-b', makeMeta('sha-b', 'project-b'));

            const projA = JSON.parse(
                fs.readFileSync(path.join(TEST_DIR, 'reports', 'project-a', 'index.json'), 'utf8'),
            ) as Record<string, ReportMeta>;
            const projB = JSON.parse(
                fs.readFileSync(path.join(TEST_DIR, 'reports', 'project-b', 'index.json'), 'utf8'),
            ) as Record<string, ReportMeta>;

            expect(projA['sha-a']?.project).toBe('project-a');
            expect(projB['sha-b']?.project).toBe('project-b');
        });
    });

    describe('FT-07f: file structure on disk', () => {
        it('creates correct directory hierarchy', () => {
            const store = createDataHubPersistence('test-project', backend);
            store.put('sha1', makeMeta('sha1', 'test-project'));
            store.saveReport('sha1', createFlatTestArrayFixture());

            const indexPath = path.join(TEST_DIR, 'reports', 'index.json');
            const projIndexPath = path.join(TEST_DIR, 'reports', 'test-project', 'index.json');
            const reportPath = path.join(TEST_DIR, 'reports', 'test-project', 'sha1.json');

            expect(fs.existsSync(path.resolve(indexPath))).toBeTruthy();
            expect(fs.existsSync(path.resolve(projIndexPath))).toBeTruthy();
            expect(fs.existsSync(path.resolve(reportPath))).toBeTruthy();
        });
    });
});
