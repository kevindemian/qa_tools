import fs from 'fs';
import path from 'path';
import os from 'os';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { FsStoreBackend } from './store-backend.js';
import { Store, type ReportMeta, type BranchEntry } from './store.js';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-store-test-'));
const backend = new FsStoreBackend(tmpDir);
const project = 'test-proj';

afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
});

beforeEach(() => {
    /* Clean all files in tmpDir */
    for (const f of fs.readdirSync(tmpDir)) {
        const fp = path.join(tmpDir, f);
        fs.rmSync(fp, { recursive: true, force: true });
    }
    backend.init();
});

function makeMeta(sha: string): ReportMeta {
    return {
        sha,
        project,
        timestamp: Date.now(),
        tool: 'vitest',
        branch: 'main',
        total: 10,
        passed: 8,
        failed: 1,
        skipped: 1,
    };
}

describe('Store', () => {
    const store = new Store(backend, project);

    describe('index (lookup / put)', () => {
        it('lookup returns null for unknown sha', () => {
            expect(store.lookup('unknown-sha')).toBeNull();
        });

        it('put stores metadata that can be retrieved', () => {
            const meta = makeMeta('abc123');
            store.put('abc123', meta);
            const loaded = store.lookup('abc123');
            expect(loaded).not.toBeNull();
            if (loaded) {
                expect(loaded.sha).toBe('abc123');
                expect(loaded.project).toBe(project);
                expect(loaded.passed).toBe(8);
                expect(loaded.failed).toBe(1);
            }
        });

        it('put overwrites existing entry', () => {
            store.put('abc123', makeMeta('abc123'));
            const updated = makeMeta('abc123');
            updated.passed = 10;
            store.put('abc123', updated);
            const loaded = store.lookup('abc123');
            if (loaded) expect(loaded.passed).toBe(10);
        });

        it('multiple entries are independent', () => {
            store.put('sha1', makeMeta('sha1'));
            store.put('sha2', makeMeta('sha2'));
            const s1 = store.lookup('sha1');
            const s2 = store.lookup('sha2');
            expect(s1).not.toBeNull();
            expect(s2).not.toBeNull();
            if (s1 && s2) expect(s1.sha).not.toBe(s2.sha);
        });
    });

    describe('listByProject', () => {
        it('returns empty for project with no entries', () => {
            const other = new Store(backend, 'other-proj');
            expect(other.listByProject()).toEqual([]);
        });

        it('returns entries sorted by timestamp descending', () => {
            const oldMeta = makeMeta('old-sha');
            oldMeta.timestamp = 100;
            store.put('old-sha', oldMeta);
            const newMeta = makeMeta('new-sha');
            newMeta.timestamp = 200;
            store.put('new-sha', newMeta);
            const list = store.listByProject();
            expect(list).toHaveLength(2);
            expect(list[0]?.sha).toBe('new-sha');
            expect(list[1]?.sha).toBe('old-sha');
        });

        it('does not include entries from other projects', () => {
            store.put('sha1', makeMeta('sha1'));
            const other = new Store(backend, 'other');
            other.put('sha2', makeMeta('sha2'));
            expect(store.listByProject()).toHaveLength(1);
            expect(other.listByProject()).toHaveLength(1);
        });
    });

    describe('branch index', () => {
        it('getBranch returns empty for unknown branch', () => {
            expect(store.getBranch('nonexistent')).toEqual([]);
        });

        it('appendBranch adds entry to the front', () => {
            const entry1: BranchEntry = { sha: 'abc', timestamp: 100 };
            const entry2: BranchEntry = { sha: 'def', timestamp: 200 };
            store.appendBranch('main', entry1);
            store.appendBranch('main', entry2);
            const list = store.getBranch('main');
            expect(list).toHaveLength(2);
            expect(list[0]?.sha).toBe('def');
            expect(list[1]?.sha).toBe('abc');
        });

        it('branches are isolated', () => {
            store.appendBranch('main', { sha: 'abc', timestamp: 1 });
            store.appendBranch('develop', { sha: 'def', timestamp: 2 });
            expect(store.getBranch('main')).toHaveLength(1);
            expect(store.getBranch('develop')).toHaveLength(1);
        });
    });

    describe('reports (saveReport / loadReport)', () => {
        it('loadReport returns null for missing sha', () => {
            expect(store.loadReport('missing')).toBeNull();
        });

        it('saveReport and loadReport round-trips test data', () => {
            const tests = [
                { title: 't1', state: 'passed' as const, duration: 100 },
                { title: 't2', state: 'failed' as const, duration: 200, error: 'err' },
            ];
            store.saveReport('abc123', tests);
            const loaded = store.loadReport('abc123');
            expect(loaded).not.toBeNull();
            if (loaded) {
                expect(loaded.tests).toHaveLength(2);
                expect(loaded.tests[0]?.title).toBe('t1');
                expect(loaded.tests[1]?.state).toBe('failed');
            }
        });

        it('report files are isolated by sha', () => {
            store.saveReport('sha1', [{ title: 'a', state: 'passed', duration: 1 }]);
            store.saveReport('sha2', [{ title: 'b', state: 'failed', duration: 2 }]);
            const r1 = store.loadReport('sha1');
            const r2 = store.loadReport('sha2');
            if (r1 && r2) {
                expect(r1.tests[0]?.title).toBe('a');
                expect(r2.tests[0]?.title).toBe('b');
            }
        });
    });

    describe('metrics', () => {
        it('loadMetrics returns null when no metrics file', () => {
            expect(store.loadMetrics()).toBeNull();
        });

        it('saveMetrics and loadMetrics round-trips', () => {
            const data = { runs: [{ timestamp: '2026-01-01', passed: 5, failed: 1 }] };
            store.saveMetrics(data);
            const loaded = store.loadMetrics<typeof data>();
            expect(loaded).not.toBeNull();
            if (loaded) {
                expect(loaded.runs).toHaveLength(1);
                expect(loaded.runs[0]?.passed).toBe(5);
            }
        });
    });

    describe('flush', () => {
        it('delegates to backend flush', () => {
            const mockBackend = {
                flush: (msg: string) => msg,
                init: () => {},
                read: () => null,
                write: () => {},
                exists: () => false,
            };
            const spy = vi.spyOn(mockBackend, 'flush');
            const s = new Store(mockBackend, project);
            s.flush('test message');
            expect(spy).toHaveBeenCalledWith('test message');
        });
    });
});
