/**
 * Property-Based Tests — Store (FT-07)
 *
 * Verifies invariants of the report metadata store.
 * Properties defined from domain logic: put↔lookup, project isolation,
 * branch ordering, report persistence.
 *
 * Dimensão 4 — Implementação Ótima: invariantes de round-trip e isolamento.
 */
import * as fc from 'fast-check';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { Store, type ReportMeta } from '../store.js';
import type { BranchEntry } from '../store.js';
import { FsStoreBackend } from '../store-backend.js';

/* ──────────────────────────────────────────────────────────────
 * Property-Based Arbitraries
 * ────────────────────────────────────────────────────────────── */

/** Create an isolated backend + Store pair for each property run */
function createFreshStore(project = 'test-project'): { backend: FsStoreBackend; store: Store; dir: string } {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbt-store-'));
    const backend = new FsStoreBackend(dir);
    backend.init();
    const store = new Store(backend, project);
    return { backend, store, dir };
}

function cleanupDir(dir: string): void {
    try {
        fs.rmSync(dir, { recursive: true, force: true });
    } catch {
        /* best effort */
    }
}

const ReportMetaArb = fc
    .record({
        sha: fc.string({ minLength: 8, maxLength: 64 }).filter((s) => s.trim().length > 0),
        project: fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.trim().length > 0),
        timestamp: fc.nat({ max: Date.now() + 86400000 }),
        tool: fc.constantFrom('vitest' as const, 'jest' as const, 'mocha' as const, 'cypress' as const),
        branch: fc.string({ minLength: 1, maxLength: 30 }),
        total: fc.nat({ max: 1000 }),
        passed: fc.nat({ max: 1000 }),
        failed: fc.nat({ max: 1000 }),
        skipped: fc.nat({ max: 1000 }),
    })
    .map((r) => r as ReportMeta);

const BranchEntryArb = fc
    .record({
        sha: fc.string({ minLength: 8, maxLength: 64 }),
        timestamp: fc.nat({ max: Date.now() + 86400000 }),
    })
    .map((r) => r);

/* ──────────────────────────────────────────────────────────────
 * Properties — Store
 * ────────────────────────────────────────────────────────────── */

describe('Store — property-based', () => {
    it('put + lookup round-trip preserves all fields', () => {
        fc.assert(
            fc.property(ReportMetaArb, (meta) => {
                const { store, dir } = createFreshStore(meta.project);
                try {
                    store.put(meta.sha, meta);
                    const loaded = store.lookup(meta.sha);
                    expect(loaded).not.toBeNull();
                    expect((loaded as ReportMeta).sha).toBe(meta.sha);
                    expect((loaded as ReportMeta).project).toBe(meta.project);
                    expect((loaded as ReportMeta).tool).toBe(meta.tool);
                    expect((loaded as ReportMeta).branch).toBe(meta.branch);
                    expect((loaded as ReportMeta).total).toBe(meta.total);
                    expect((loaded as ReportMeta).passed).toBe(meta.passed);
                    expect((loaded as ReportMeta).failed).toBe(meta.failed);
                    expect((loaded as ReportMeta).skipped).toBe(meta.skipped);
                    expect((loaded as ReportMeta).timestamp).toBe(meta.timestamp);
                } finally {
                    cleanupDir(dir);
                }
            }),
            { numRuns: 100 },
        );
    });

    it('lookup returns null for unknown sha', () => {
        fc.assert(
            fc.property(
                fc.string({ minLength: 8, maxLength: 64 }),
                fc.string({ minLength: 1, maxLength: 20 }),
                (sha, project) => {
                    const { store, dir } = createFreshStore(project);
                    try {
                        expect(store.lookup(sha)).toBeNull();
                    } finally {
                        cleanupDir(dir);
                    }
                },
            ),
            { numRuns: 50 },
        );
    });

    it('multiple puts → listByProject returns sorted by timestamp descending', () => {
        fc.assert(
            fc.property(fc.array(ReportMetaArb, { minLength: 1, maxLength: 20 }), (metas) => {
                fc.pre(metas.length > 0);
                const project = (metas[0] as ReportMeta).project;
                const { store, dir } = createFreshStore(project);
                try {
                    for (const m of metas) {
                        store.put(m.sha, m);
                    }
                    const list = store.listByProject();
                    expect(list.length).toBeGreaterThanOrEqual(1);
                    for (let i = 1; i < list.length; i++) {
                        expect((list[i - 1] as ReportMeta).timestamp).toBeGreaterThanOrEqual(
                            (list[i] as ReportMeta).timestamp,
                        );
                    }
                } finally {
                    cleanupDir(dir);
                }
            }),
            { numRuns: 50 },
        );
    });

    it('listByProject returns only entries for the project', () => {
        fc.assert(
            fc.property(
                fc.uniqueArray(ReportMetaArb, { selector: (m) => m.sha, minLength: 1, maxLength: 10 }),
                fc.uniqueArray(ReportMetaArb, { selector: (m) => m.sha, minLength: 1, maxLength: 10 }),
                (projectAMetas, projectBMetas) => {
                    const { store: storeA, dir: dirA } = createFreshStore('project-a');
                    const { store: storeB, dir: dirB } = createFreshStore('project-b');
                    try {
                        for (const m of projectAMetas) storeA.put(m.sha, { ...m, project: 'project-a' });
                        for (const m of projectBMetas) storeB.put(m.sha, { ...m, project: 'project-b' });

                        expect(storeA.listByProject()).toHaveLength(projectAMetas.length);
                        expect(storeB.listByProject()).toHaveLength(projectBMetas.length);
                    } finally {
                        cleanupDir(dirA);
                        cleanupDir(dirB);
                    }
                },
            ),
            { numRuns: 50 },
        );
    });

    it('appendBranch + getBranch round-trip preserves entries in LIFO order', () => {
        fc.assert(
            fc.property(
                fc.string({ minLength: 1, maxLength: 20 }),
                fc.array(BranchEntryArb, { minLength: 0, maxLength: 30 }),
                (branch, entries) => {
                    const { store, dir } = createFreshStore('test-project');
                    try {
                        for (const e of entries) {
                            store.appendBranch(branch, e);
                        }
                        const loaded = store.getBranch(branch);
                        expect(loaded).toHaveLength(entries.length);
                        for (let i = 0; i < entries.length; i++) {
                            expect((loaded[entries.length - 1 - i] as BranchEntry).sha).toBe(
                                (entries[i] as BranchEntry).sha,
                            );
                            expect((loaded[entries.length - 1 - i] as BranchEntry).timestamp).toBe(
                                (entries[i] as BranchEntry).timestamp,
                            );
                        }
                    } finally {
                        cleanupDir(dir);
                    }
                },
            ),
            { numRuns: 30 },
        );
    });

    it('getBranch returns empty array for unknown branch', () => {
        fc.assert(
            fc.property(fc.string({ minLength: 1, maxLength: 20 }), (branch) => {
                const { store, dir } = createFreshStore('test-project');
                try {
                    expect(store.getBranch(branch)).toEqual([]);
                } finally {
                    cleanupDir(dir);
                }
            }),
            { numRuns: 50 },
        );
    });

    it('saveReport + loadReport round-trip preserves test data', () => {
        fc.assert(
            fc.property(
                fc.string({ minLength: 8, maxLength: 64 }),
                fc.array(
                    fc.record({
                        title: fc.string({ minLength: 1, maxLength: 50 }),
                        state: fc.constantFrom('passed' as const, 'failed' as const, 'skipped' as const),
                        duration: fc.nat({ max: 60000 }),
                    }),
                    { minLength: 0, maxLength: 30 },
                ),
                (sha, tests) => {
                    const { store, dir } = createFreshStore('test-project');
                    try {
                        store.saveReport(sha, tests);
                        const loaded = store.loadReport(sha);
                        expect(loaded).not.toBeNull();
                        const loadedReport = loaded as {
                            tests: Array<{ title: string; state: 'passed' | 'failed' | 'skipped'; duration: number }>;
                        };
                        expect(loadedReport.tests).toHaveLength(tests.length);
                        if (tests.length > 0) {
                            expect(
                                (loadedReport.tests[0] as { title: string; state: string; duration: number }).title,
                            ).toBe((tests[0] as { title: string; state: string; duration: number }).title);
                        }
                    } finally {
                        cleanupDir(dir);
                    }
                },
            ),
            { numRuns: 30 },
        );
    });
});
