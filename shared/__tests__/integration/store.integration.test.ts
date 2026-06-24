/**
 * Integration tests — Store (FT-07)
 *
 * Validates the report metadata store:
 * - put and lookup round-trip
 * - listByProject returns sorted entries
 * - appendBranch and getBranch round-trip
 * - saveReport and loadReport round-trip
 * - saveMetrics and loadMetrics round-trip
 *
 * Uses FsStoreBackend with isolated temp directories.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Store } from '../../store.js';
import { FsStoreBackend } from '../../store-backend.js';
import { rootLogger } from '../../logger.js';
import { createFlatTestArrayFixture } from './integration-helpers.js';

let TEST_DIR: string;
let backend: FsStoreBackend;

describe('Integration: Store', () => {
    beforeEach(() => {
        TEST_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'integration-store-'));
        backend = new FsStoreBackend(TEST_DIR);
        backend.init();
    });

    afterEach(() => {
        try {
            fs.rmSync(TEST_DIR, { recursive: true, force: true });
        } catch {
            rootLogger.warn('store integration cleanup failed');
        }
    });

    describe('FT-07a: put and lookup round-trip', () => {
        it('stores and retrieves report metadata by SHA', () => {
            const store = new Store(backend, 'test-project');
            const meta = {
                sha: 'abc123def456',
                project: 'test-project',
                timestamp: Date.now(),
                tool: 'vitest',
                branch: 'main',
                total: 100,
                passed: 95,
                failed: 3,
                skipped: 2,
            };

            store.put(meta.sha, meta);
            const found = store.lookup(meta.sha);

            expect(found).not.toBeNull();
            expect(found?.sha).toBe('abc123def456');
            expect(found?.project).toBe('test-project');
            expect(found?.passed).toBe(95);
        });

        it('returns null for unknown SHA', () => {
            const store = new Store(backend, 'test-project');

            expect(store.lookup('nonexistent')).toBeNull();
        });
    });

    describe('FT-07b: listByProject', () => {
        it('returns project entries sorted by timestamp descending', () => {
            const store = new Store(backend, 'test-project');

            store.put('sha1', {
                sha: 'sha1',
                project: 'test-project',
                timestamp: 1000,
                tool: 'vitest',
                branch: 'main',
                total: 50,
                passed: 48,
                failed: 1,
                skipped: 1,
            });
            store.put('sha2', {
                sha: 'sha2',
                project: 'test-project',
                timestamp: 2000,
                tool: 'vitest',
                branch: 'main',
                total: 60,
                passed: 58,
                failed: 1,
                skipped: 1,
            });

            const list = store.listByProject();

            expect(list).toHaveLength(2);

            const first = list[0];
            const second = list[1];

            expect(first).toBeDefined();
            expect(second).toBeDefined();

            if (!first || !second) throw new Error('expected two entries');

            expect(first.sha).toBe('sha2'); // newer first
            expect(second.sha).toBe('sha1');
        });

        it('returns empty array when no entries exist', () => {
            const store = new Store(backend, 'empty-project');

            expect(store.listByProject()).toEqual([]);
        });
    });

    describe('FT-07c: appendBranch and getBranch', () => {
        it('appends branch entry and retrieves it', () => {
            const store = new Store(backend, 'test-project');
            const entry = { sha: 'branch-sha', timestamp: Date.now() };

            store.appendBranch('feature-x', entry);
            const entries = store.getBranch('feature-x');

            expect(entries).toHaveLength(1);

            const firstEntry = entries[0];

            expect(firstEntry).toBeDefined();

            if (!firstEntry) throw new Error('expected entry');

            expect(firstEntry.sha).toBe('branch-sha');
        });

        it('returns empty array for unknown branch', () => {
            const store = new Store(backend, 'test-project');

            expect(store.getBranch('nonexistent')).toEqual([]);
        });

        it('multiple entries are ordered newest first', () => {
            const store = new Store(backend, 'test-project');
            store.appendBranch('main', { sha: 'old', timestamp: 1000 });
            store.appendBranch('main', { sha: 'new', timestamp: 2000 });

            const entries = store.getBranch('main');
            const firstEntry = entries[0];
            const secondEntry = entries[1];

            expect(firstEntry).toBeDefined();
            expect(secondEntry).toBeDefined();

            if (!firstEntry || !secondEntry) throw new Error('expected two entries');

            expect(firstEntry.sha).toBe('new');
            expect(secondEntry.sha).toBe('old');
        });
    });

    describe('FT-07d: saveReport and loadReport', () => {
        it('persists and loads test data', () => {
            const store = new Store(backend, 'test-project');
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
            const store = new Store(backend, 'test-project');

            expect(store.loadReport('nonexistent')).toBeNull();
        });
    });

    describe('FT-07e: project isolation', () => {
        it('different projects have separate per-project indexes', () => {
            const store1 = new Store(backend, 'project-a');
            const store2 = new Store(backend, 'project-b');

            store1.put('sha1', {
                sha: 'sha1',
                project: 'project-a',
                timestamp: Date.now(),
                tool: 'vitest',
                branch: 'main',
                total: 10,
                passed: 10,
                failed: 0,
                skipped: 0,
            });
            store2.put('sha2', {
                sha: 'sha2',
                project: 'project-b',
                timestamp: Date.now(),
                tool: 'vitest',
                branch: 'main',
                total: 20,
                passed: 20,
                failed: 0,
                skipped: 0,
            });

            // listByProject is per-project
            expect(store1.listByProject()).toHaveLength(1);
            expect(store2.listByProject()).toHaveLength(1);

            const first1 = store1.listByProject()[0];
            const first2 = store2.listByProject()[0];

            expect(first1).toBeDefined();
            expect(first2).toBeDefined();

            if (!first1 || !first2) throw new Error('expected entries');

            expect(first1.project).toBe('project-a');
            expect(first2.project).toBe('project-b');
        });

        it('lookup uses global index (shared across projects)', () => {
            const store1 = new Store(backend, 'project-a');
            const store2 = new Store(backend, 'project-b');

            store1.put('sha-a', {
                sha: 'sha-a',
                project: 'project-a',
                timestamp: Date.now(),
                tool: 'vitest',
                branch: 'main',
                total: 10,
                passed: 10,
                failed: 0,
                skipped: 0,
            });
            store2.put('sha-b', {
                sha: 'sha-b',
                project: 'project-b',
                timestamp: Date.now(),
                tool: 'vitest',
                branch: 'main',
                total: 20,
                passed: 20,
                failed: 0,
                skipped: 0,
            });

            // Global index stores both — lookup is global, not per-project
            expect(store1.lookup('sha-a')?.project).toBe('project-a');
            expect(store1.lookup('sha-b')?.project).toBe('project-b');
        });
    });

    describe('FT-07f: file structure on disk', () => {
        it('creates correct directory hierarchy', () => {
            const store = new Store(backend, 'test-project');
            store.put('sha1', {
                sha: 'sha1',
                project: 'test-project',
                timestamp: Date.now(),
                tool: 'vitest',
                branch: 'main',
                total: 10,
                passed: 10,
                failed: 0,
                skipped: 0,
            });

            const indexPath = path.join(TEST_DIR, 'reports', 'index.json');
            const projIndexPath = path.join(TEST_DIR, 'reports', 'test-project', 'index.json');

            expect(fs.existsSync(indexPath)).toBeTruthy();
            expect(fs.existsSync(projIndexPath)).toBeTruthy();
        });
    });
});
