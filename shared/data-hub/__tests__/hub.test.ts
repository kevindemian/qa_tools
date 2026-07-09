/**
 * Unit tests for DataHubImpl.
 *
 * Tests the orchestration of providers and compute functions.
 */
import { describe, it, expect, vi } from 'vitest';
import { DataHubImpl } from '../hub.js';
import type { DataProvider, RawData, MetricsStore, DataHubPersistence } from '../../types/data-hub.js';
import type { PipelineRun } from '../../types/ci-cd.js';

/* ── Helpers ────────────────────────────────────────────────────────────── */

function makeRun(overrides?: Partial<PipelineRun>): PipelineRun {
    return {
        id: 1,
        conclusion: 'success',
        run_started_at: '2026-01-01T10:00:00Z',
        updated_at: '2026-01-01T10:10:00Z',
        head_branch: 'main',
        ...overrides,
    };
}

function makeProvider(rawData: RawData, name = 'test-provider'): DataProvider {
    return {
        name,
        source: 'github' as const,
        fetchRawData: vi.fn().mockResolvedValue(rawData),
    };
}

function makeEmptyRawData(): RawData {
    return {
        runs: [],
        jobs: new Map(),
        artifacts: new Map(),
        failureReasons: new Map(),
    };
}

function makeRawDataWithRuns(runs: PipelineRun[]): RawData {
    return {
        runs,
        jobs: new Map(),
        artifacts: new Map(),
        failureReasons: new Map(),
    };
}

/* ── Tests ──────────────────────────────────────────────────────────────── */

describe('DataHubImpl', () => {
    it('creates hub from single provider', async () => {
        expect.hasAssertions();

        const runs = [makeRun({ id: 1, conclusion: 'success' }), makeRun({ id: 2, conclusion: 'failure' })];
        const provider = makeProvider(makeRawDataWithRuns(runs));

        const { hub } = await DataHubImpl.create([provider], { repo: 'test/repo' });

        expect(hub).toBeDefined();
        expect(hub.raw.runs).toHaveLength(2);
        expect(hub.repo).toBe('test/repo');
        expect(hub.provider).toBe('github');
    });

    it('computes pass rate from runs', async () => {
        expect.hasAssertions();

        const runs = [
            makeRun({ id: 1, conclusion: 'success' }),
            makeRun({ id: 2, conclusion: 'success' }),
            makeRun({ id: 3, conclusion: 'failure' }),
        ];
        const provider = makeProvider(makeRawDataWithRuns(runs));

        const { hub } = await DataHubImpl.create([provider], { repo: 'test/repo' });

        expect(hub.computed.passRate).toBeCloseTo(66.67, 1);
    });

    it('merges data from multiple providers', async () => {
        expect.hasAssertions();

        const runs1 = [makeRun({ id: 1, conclusion: 'success' })];
        const runs2 = [makeRun({ id: 2, conclusion: 'failure' })];
        const provider1 = makeProvider(makeRawDataWithRuns(runs1), 'provider1');
        const provider2 = makeProvider(makeRawDataWithRuns(runs2), 'provider2');

        const { hub } = await DataHubImpl.create([provider1, provider2], {
            repo: 'test/repo',
        });

        expect(hub.raw.runs).toHaveLength(2);
    });

    it('handles provider failure gracefully', async () => {
        expect.hasAssertions();

        const runs = [makeRun({ id: 1, conclusion: 'success' })];
        const workingProvider = makeProvider(makeRawDataWithRuns(runs));
        const failingProvider: DataProvider = {
            name: 'failing',
            source: 'github' as const,
            fetchRawData: vi.fn().mockRejectedValue(new Error('API error')),
        };

        const { hub } = await DataHubImpl.create([failingProvider, workingProvider], {
            repo: 'test/repo',
        });

        expect(hub.raw.runs).toHaveLength(1);
        expect(hub.computed.passRate).toBe(100);
    });

    it('creates empty hub as fallback', () => {
        expect.hasAssertions();

        const hub = DataHubImpl.createEmpty('github', 'test/repo');

        expect(hub.raw.runs).toHaveLength(0);
        expect(hub.computed.passRate).toBe(0);
        expect(hub.computed.pipelineCost.totalMinutes).toBe(0);
        expect(hub.repo).toBe('test/repo');
        expect(hub.provider).toBe('github');
    });

    it('sets timestamp on creation', async () => {
        expect.hasAssertions();

        const before = Date.now();
        const provider = makeProvider(makeEmptyRawData());

        const { hub } = await DataHubImpl.create([provider], { repo: 'test/repo' });

        expect(hub.timestamp.getTime()).toBeGreaterThanOrEqual(before);
        expect(hub.timestamp.getTime()).toBeLessThanOrEqual(Date.now());
    });
});

/* ── HasDataChanged ─────────────────────────────────────────────────────── */

describe('HasDataChanged', () => {
    it('returns false when runs are identical', async () => {
        expect.hasAssertions();

        const { hasDataChanged } = await import('../hub.js');
        const runs = [makeRun({ id: 1 }), makeRun({ id: 2 })];
        const raw: RawData = makeRawDataWithRuns(runs);
        const provider = makeProvider(raw);
        const { hub } = await DataHubImpl.create([provider], { repo: 'test' });

        const newRaw: RawData = makeRawDataWithRuns([
            makeRun({ id: 1, updated_at: '2026-01-01T10:10:00Z' }),
            makeRun({ id: 2, updated_at: '2026-01-01T10:10:00Z' }),
        ]);

        expect(hasDataChanged(hub, newRaw)).toBeFalsy();
    });

    it('returns true when run count differs', async () => {
        expect.hasAssertions();

        const { hasDataChanged } = await import('../hub.js');
        const raw: RawData = makeRawDataWithRuns([makeRun({ id: 1 })]);
        const provider = makeProvider(raw);
        const { hub } = await DataHubImpl.create([provider], { repo: 'test' });

        const newRaw: RawData = makeRawDataWithRuns([makeRun({ id: 1 }), makeRun({ id: 3 })]);

        expect(hasDataChanged(hub, newRaw)).toBeTruthy();
    });

    it('returns true when new run added', async () => {
        expect.hasAssertions();

        const { hasDataChanged } = await import('../hub.js');
        const raw: RawData = makeRawDataWithRuns([makeRun({ id: 1 })]);
        const provider = makeProvider(raw);
        const { hub } = await DataHubImpl.create([provider], { repo: 'test' });

        const newRaw: RawData = makeRawDataWithRuns([makeRun({ id: 1 }), makeRun({ id: 2 })]);

        expect(hasDataChanged(hub, newRaw)).toBeTruthy();
    });

    it('returns true when run updated_at changes', async () => {
        expect.hasAssertions();

        const { hasDataChanged } = await import('../hub.js');
        const raw: RawData = makeRawDataWithRuns([makeRun({ id: 1, updated_at: '2026-01-01T10:10:00Z' })]);
        const provider = makeProvider(raw);
        const { hub } = await DataHubImpl.create([provider], { repo: 'test' });

        const newRaw: RawData = makeRawDataWithRuns([makeRun({ id: 1, updated_at: '2026-01-01T11:00:00Z' })]);

        expect(hasDataChanged(hub, newRaw)).toBeTruthy();
    });

    it('returns true when run id missing in new data', async () => {
        expect.hasAssertions();

        const { hasDataChanged } = await import('../hub.js');
        const raw: RawData = makeRawDataWithRuns([makeRun({ id: 1 }), makeRun({ id: 2 })]);
        const provider = makeProvider(raw);
        const { hub } = await DataHubImpl.create([provider], { repo: 'test' });

        const newRaw: RawData = makeRawDataWithRuns([makeRun({ id: 1 })]);

        expect(hasDataChanged(hub, newRaw)).toBeTruthy();
    });

    it('returns true when run has null id', async () => {
        expect.hasAssertions();

        const { hasDataChanged } = await import('../hub.js');
        const raw: RawData = makeRawDataWithRuns([makeRun({ id: 1 })]);
        const provider = makeProvider(raw);
        const { hub } = await DataHubImpl.create([provider], { repo: 'test' });

        const newRaw: RawData = makeRawDataWithRuns([makeRun({ id: undefined })]);

        expect(hasDataChanged(hub, newRaw)).toBeTruthy();
    });

    it('returns true when both empty', async () => {
        expect.hasAssertions();

        const { hasDataChanged } = await import('../hub.js');
        const raw: RawData = makeEmptyRawData();
        const provider = makeProvider(raw);
        const { hub } = await DataHubImpl.create([provider], { repo: 'test' });

        const newRaw: RawData = makeEmptyRawData();

        expect(hasDataChanged(hub, newRaw)).toBeFalsy();
    });
});

/* ── loadFromStore tests ─────────────────────────────────────────────────── */

describe('DataHubImpl.loadFromStore', () => {
    function makeMetricsStore(overrides?: Partial<MetricsStore>): MetricsStore {
        return {
            runs: [
                {
                    timestamp: '2026-01-01T10:00:00Z',
                    project: 'main',
                    total: 100,
                    passed: 95,
                    failed: 3,
                    skipped: 2,
                    duration: 5000,
                    tests: [],
                },
                {
                    timestamp: '2026-01-02T10:00:00Z',
                    project: 'main',
                    total: 100,
                    passed: 98,
                    failed: 1,
                    skipped: 1,
                    duration: 4500,
                    tests: [],
                },
            ],
            ...overrides,
        };
    }

    it('creates DataHub from MetricsStore with runs', () => {
        const store = makeMetricsStore();
        const hub = DataHubImpl.loadFromStore(store, 'test-repo');

        expect(hub).toBeDefined();
        expect(hub.raw.runs).toHaveLength(2);
        expect(hub.provider).toBe('github');
        expect(hub.repo).toBe('test-repo');
    });

    it('converts MetricsRun to PipelineRun correctly', () => {
        const store = makeMetricsStore();
        const hub = DataHubImpl.loadFromStore(store, 'test-repo');

        const run = hub.raw.runs[0];

        expect(run).toBeDefined();
        expect(run?.id).toBe(0);
        expect(run?.run_number).toBe(0);
        expect(run?.head_branch).toBe('main');
        expect(run?.status).toBe('completed');
        expect(run?.conclusion).toBe('success');
        expect(run?.created_at).toBe('2026-01-01T10:00:00Z');
    });

    it('sets conclusion to failure when failed > passed', () => {
        const store = makeMetricsStore({
            runs: [
                {
                    timestamp: '2026-01-01T10:00:00Z',
                    project: 'main',
                    total: 100,
                    passed: 50,
                    failed: 50,
                    skipped: 0,
                    duration: 5000,
                    tests: [],
                },
            ],
        });
        const hub = DataHubImpl.loadFromStore(store, 'test-repo');

        expect(hub.raw.runs[0]?.conclusion).toBe('failure');
    });

    it('converts last CoverageSnapshot to RawCoverage', () => {
        const store = makeMetricsStore({
            coverageHistory: [
                { timestamp: '2026-01-01', project: 'main', totalIssues: 100, mappedIssues: 80, coveragePct: 80 },
                { timestamp: '2026-01-02', project: 'main', totalIssues: 100, mappedIssues: 85, coveragePct: 85 },
            ],
        });
        const hub = DataHubImpl.loadFromStore(store, 'test-repo');

        expect(hub.raw.coverage).toBeDefined();
        expect(hub.raw.coverage?.total).toBe(100);
        expect(hub.raw.coverage?.covered).toBe(85);
        expect(hub.raw.coverage?.percentage).toBe(85);
    });

    it('sets coverage to undefined when no history', () => {
        const store = makeMetricsStore({ coverageHistory: [] });
        const hub = DataHubImpl.loadFromStore(store, 'test-repo');

        expect(hub.raw.coverage).toBeUndefined();
    });

    it('uses "unknown" when project is empty', () => {
        const store = makeMetricsStore({
            runs: [
                {
                    timestamp: '2026-01-01T10:00:00Z',
                    project: '',
                    total: 100,
                    passed: 100,
                    failed: 0,
                    skipped: 0,
                    duration: 5000,
                    tests: [],
                },
            ],
        });
        const hub = DataHubImpl.loadFromStore(store, 'test-repo');

        expect(hub.raw.runs[0]?.head_branch).toBe('unknown');
    });

    it('computes metrics from converted data', () => {
        const store = makeMetricsStore();
        const hub = DataHubImpl.loadFromStore(store, 'test-repo');

        expect(hub.computed.passRate).toBeDefined();
        expect(typeof hub.computed.passRate).toBe('number');
    });

    it('accepts optional persistence', () => {
        const store = makeMetricsStore();
        const mockPersistence: DataHubPersistence = {
            saveRun: vi.fn(),
            loadRun: vi.fn(),
            saveCoverageSnapshot: vi.fn(),
            loadCoverageHistory: vi.fn(),
            saveFailureClassification: vi.fn(),
            loadFailureClassifications: vi.fn(),
            saveMetricsStore: vi.fn(),
            loadMetricsStore: vi.fn(),
            saveParseResult: vi.fn(),
            saveQualityMetrics: vi.fn(),
            loadQualityMetricsHistory: vi.fn(),
            flush: vi.fn(),
        };
        const hub = DataHubImpl.loadFromStore(store, 'test-repo', mockPersistence);

        expect(hub.persistence).toBe(mockPersistence);
    });
});
