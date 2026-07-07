/**
 * Unit tests for DataHubPersistence adapter.
 *
 * Tests the persistence layer that wraps StoreBackend.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createDataHubPersistence } from '../persistence.js';
import type { MetricsRun, MetricsStore, CoverageSnapshot, FailureClassification } from '../../types/data-hub.js';
import type { StoreBackend } from '../../store-backend.js';

/* ── Mock StoreBackend ──────────────────────────────────────────────────── */

function createMockBackend(): StoreBackend & { data: Map<string, Buffer>; flushFn: ReturnType<typeof vi.fn> } {
    const data = new Map<string, Buffer>();
    const flushFn = vi.fn();
    return {
        data,
        init: vi.fn(),
        read: vi.fn((path: string) => data.get(path) ?? null),
        write: vi.fn((path: string, content: Buffer) => {
            data.set(path, content);
        }),
        flush: flushFn,
        exists: vi.fn((path: string) => data.has(path)),
        flushFn,
    };
}

function makeMetricsRun(overrides?: Partial<MetricsRun>): MetricsRun {
    return {
        timestamp: '2026-01-01T10:00:00Z',
        project: 'test',
        total: 10,
        passed: 8,
        failed: 2,
        skipped: 0,
        duration: 1000,
        tests: [],
        ...overrides,
    };
}

function makeCoverageSnapshot(overrides?: Partial<CoverageSnapshot>): CoverageSnapshot {
    return {
        timestamp: '2026-01-01T10:00:00Z',
        project: 'test',
        totalIssues: 100,
        mappedIssues: 80,
        coveragePct: 80,
        ...overrides,
    };
}

function makeFailureClassification(overrides?: Partial<FailureClassification>): FailureClassification {
    return {
        timestamp: '2026-01-01T10:00:00Z',
        testTitle: 'flaky test',
        category: 'FLAKY',
        project: 'test',
        ...overrides,
    };
}

/* ── Tests ──────────────────────────────────────────────────────────────── */

describe('DataHubPersistence', () => {
    let backend: ReturnType<typeof createMockBackend>;
    let persistence: ReturnType<typeof createDataHubPersistence>;

    beforeEach(() => {
        backend = createMockBackend();
        persistence = createDataHubPersistence('test-project', backend);
    });

    describe('SaveRun / LoadRun', () => {
        it('saveRun persists run to metrics store', () => {
            expect.hasAssertions();

            const run = makeMetricsRun({ passed: 8 });

            persistence.saveRun('abc123', run);

            const stored = JSON.parse(
                backend.data.get('metrics/global.json')?.toString('utf8') ?? '{}',
            ) as MetricsStore;

            expect(stored.runs).toHaveLength(1);
            expect(stored.runs[0]?.passed).toBe(8);
        });

        it('loadRun returns null (SHA-based lookup not supported)', () => {
            expect.hasAssertions();

            expect(persistence.loadRun('abc123')).toBeNull();
        });
    });

    describe('SaveCoverageSnapshot / LoadCoverageHistory', () => {
        it('saveCoverageSnapshot persists snapshot', () => {
            expect.hasAssertions();

            const snapshot = makeCoverageSnapshot({ coveragePct: 80 });

            persistence.saveCoverageSnapshot(snapshot);

            const stored = JSON.parse(
                backend.data.get('metrics/global.json')?.toString('utf8') ?? '{}',
            ) as MetricsStore;

            expect(stored.coverageHistory).toHaveLength(1);
            expect(stored.coverageHistory?.[0]?.coveragePct).toBe(80);
        });

        it('loadCoverageHistory returns empty array when no data', () => {
            expect.hasAssertions();

            expect(persistence.loadCoverageHistory('test')).toStrictEqual([]);
        });
    });

    describe('SaveFailureClassification / LoadFailureClassifications', () => {
        it('saveFailureClassification persists classification', () => {
            expect.hasAssertions();

            const classification = makeFailureClassification({ category: 'FLAKY' });

            persistence.saveFailureClassification(classification);

            const stored = JSON.parse(
                backend.data.get('metrics/global.json')?.toString('utf8') ?? '{}',
            ) as MetricsStore;

            expect(stored.failureClassifications).toHaveLength(1);
            expect(stored.failureClassifications?.[0]?.category).toBe('FLAKY');
        });

        it('loadFailureClassifications returns empty array when no data', () => {
            expect.hasAssertions();

            expect(persistence.loadFailureClassifications('test')).toStrictEqual([]);
        });
    });

    describe('SaveMetricsStore / LoadMetricsStore', () => {
        it('saveMetricsStore persists full store', () => {
            expect.hasAssertions();

            const store: MetricsStore = {
                runs: [
                    makeMetricsRun({
                        total: 5,
                        passed: 5,
                        failed: 0,
                        duration: 500,
                    }),
                ],
            };

            persistence.saveMetricsStore(store);

            const stored = JSON.parse(
                backend.data.get('metrics/global.json')?.toString('utf8') ?? '{}',
            ) as MetricsStore;

            expect(stored.runs).toHaveLength(1);
        });

        it('loadMetricsStore returns empty store when no data', () => {
            expect.hasAssertions();

            expect(persistence.loadMetricsStore()).toStrictEqual({ runs: [] });
        });
    });

    describe('Flush', () => {
        it('flush calls backend.flush', () => {
            expect.hasAssertions();

            persistence.flush('test commit');

            expect(backend.flushFn).toHaveBeenCalledWith('test commit');
        });
    });
});
