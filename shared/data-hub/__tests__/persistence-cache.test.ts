/**
 * DataHub test-result cache — unit tests (migrated from legacy Store tests).
 *
 * The cache was previously owned by the `Store` class (`shared/store.ts`). It is
 * now owned by `DataHubPersistence` (single source of truth). These tests lock the
 * SHA-keyed cache contract: round-trip, per-project isolation, and error handling
 * that surfaces failures (never silences them — AGENTS §25).
 */

// N2-B (security/detect-non-literal-fs-filename): the 4 FS calls below (lines 28, 99, 102,
// 116) read from a test sandbox whose path is derived from `os.tmpdir()` via `mkdtempSync`
// (`tmpDir`). These are CORRECT, non-attacker-controlled test paths. The rule's
// isStaticExpression does not treat `os.tmpdir()` as static (by design — accepting arbitrary
// function returns as "static" would be a security hole), so it reports false positives.
// Severity: warning (1), not error (2); the lint gate (scripts/quality-check.ts) only fails on
// severity-2, so CI is unaffected. Documented debt, no code/config change. See
// TASK-22-corrections.md CHECKPOINT 2 (WS3 N2-B).
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { FsStoreBackend } from '../../infra/store-backend.js';
import { createDataHubPersistence } from '../persistence.js';
import type { DataHubPersistence, ReportMeta } from '../../types/data-hub.js';

vi.mock('../../logger');
import { rootLogger } from '../../logger.js';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-cache-test-'));
const backend = new FsStoreBackend(tmpDir);
const project = 'test-proj';

describe('DataHub test-result cache', () => {
    let store: DataHubPersistence;

    beforeEach(() => {
        for (const f of fs.readdirSync(path.resolve(tmpDir))) {
            fs.rmSync(path.join(tmpDir, f), { recursive: true, force: true });
        }
        backend.init();
        store = createDataHubPersistence(project, backend);
    });

    afterAll(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
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

    describe('Reports (saveReport / loadReport)', () => {
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
            expect(loaded?.tests).toHaveLength(2);
            expect(loaded?.tests[0]?.title).toBe('t1');
            expect(loaded?.tests[1]?.state).toBe('failed');
        });

        it('report files are isolated by sha', () => {
            store.saveReport('sha1', [{ title: 'a', state: 'passed', duration: 1 }]);
            store.saveReport('sha2', [{ title: 'b', state: 'failed', duration: 2 }]);
            const r1 = store.loadReport('sha1');
            const r2 = store.loadReport('sha2');

            expect(r1).not.toBeNull();
            expect(r2).not.toBeNull();
            expect(r1?.tests[0]?.title).toBe('a');
            expect(r2?.tests[0]?.title).toBe('b');
        });

        it('reports are scoped per project (isolation)', () => {
            const other = createDataHubPersistence('other-proj', backend);
            store.saveReport('same-sha', [{ title: 'a', state: 'passed', duration: 1 }]);
            other.saveReport('same-sha', [{ title: 'b', state: 'failed', duration: 2 }]);

            expect(store.loadReport('same-sha')?.tests[0]?.title).toBe('a');
            expect(other.loadReport('same-sha')?.tests[0]?.title).toBe('b');
        });
    });

    describe('Report meta index (put)', () => {
        it('writes global and per-project index files', () => {
            store.put('abc123', makeMeta('abc123'));

            const globalIndex = JSON.parse(
                fs.readFileSync(path.join(tmpDir, 'reports', 'index.json'), 'utf8'),
            ) as Record<string, ReportMeta>;
            const projIndex = JSON.parse(
                fs.readFileSync(path.join(tmpDir, 'reports', project, 'index.json'), 'utf8'),
            ) as Record<string, ReportMeta>;

            expect(globalIndex['abc123']?.sha).toBe('abc123');
            expect(projIndex['abc123']?.sha).toBe('abc123');
        });

        it('overwrites an existing entry for the same sha', () => {
            store.put('abc123', makeMeta('abc123'));
            const updated = makeMeta('abc123');
            updated.passed = 10;
            store.put('abc123', updated);

            const projIndex = JSON.parse(
                fs.readFileSync(path.join(tmpDir, 'reports', project, 'index.json'), 'utf8'),
            ) as Record<string, ReportMeta>;

            expect(Object.keys(projIndex)).toHaveLength(1);
            expect(projIndex['abc123']?.passed).toBe(10);
        });
    });

    describe('Branch index (getBranch)', () => {
        it('returns empty array for unknown branch', () => {
            expect(store.getBranch('nonexistent')).toStrictEqual([]);
        });
    });

    describe('Project metrics (loadMetrics)', () => {
        it('returns null when no metrics file exists', () => {
            expect(store.loadMetrics()).toBeNull();
        });
    });

    describe('Flush', () => {
        it('delegates to backend flush', () => {
            const mockBackend = {
                flush: (msg: string) => msg,
                init: () => {},
                read: () => null,
                write: () => {},
                exists: () => false,
            };
            const spy = vi.spyOn(mockBackend, 'flush');
            const s = createDataHubPersistence(project, mockBackend);
            s.flush('test message');

            expect(spy).toHaveBeenCalledWith('test message');
        });
    });

    describe('Error handling (failures are surfaced, never silenced — AGENTS §25)', () => {
        it('write failure throws and warns', () => {
            const failBackend = {
                init: () => {},
                read: () => null,
                write: () => {
                    throw new Error('ENOSPC');
                },
                exists: () => false,
                flush: () => {},
            };
            const s = createDataHubPersistence(project, failBackend);
            const errorSpy = vi.spyOn(rootLogger, 'error');

            expect(() => s.saveReport('sha1', [{ title: 't', state: 'passed', duration: 1 }])).toThrow('ENOSPC');
            expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('data-hub-persistence:'));
        });

        it('read throwing returns null and warns (failure surfaced, never silenced)', () => {
            const invalidBackend = {
                init: () => {},
                read: () => {
                    throw new Error('EACCES');
                },
                write: () => {},
                exists: () => false,
                flush: () => {},
            };
            const s = createDataHubPersistence(project, invalidBackend);
            const warnSpy = vi.spyOn(rootLogger, 'warn');
            const result = s.loadReport('any-sha');

            expect(result).toBeNull();
            expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('data-hub-persistence:'));
        });

        it('read throwing is caught, returns null, and warns', () => {
            const failBackend = {
                init: () => {},
                read: () => {
                    throw new Error('EACCES');
                },
                write: () => {},
                exists: () => false,
                flush: () => {},
            };
            const s = createDataHubPersistence(project, failBackend);
            const warnSpy = vi.spyOn(rootLogger, 'warn');
            s.loadReport('any-sha');

            expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('data-hub-persistence:'));
        });

        it('corrupt branch index returns empty array', () => {
            const corruptBackend = {
                init: () => {},
                read: () => Buffer.from('{"main": {"sha": "abc", "timestamp": 123}}', 'utf8'),
                write: () => {},
                exists: () => false,
                flush: () => {},
            };
            const s = createDataHubPersistence(project, corruptBackend);

            expect(s.getBranch('main')).toStrictEqual([]);
        });
    });
});
