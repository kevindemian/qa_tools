/**
 * Unit tests for DataHubImpl.
 *
 * Tests the orchestration of providers and compute functions.
 */
import { describe, it, expect, vi } from 'vitest';
import { DataHubImpl } from '../hub.js';
import type { DataProvider, RawData } from '../../types/data-hub.js';
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
