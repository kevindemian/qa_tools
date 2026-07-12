/**
 * ST-3 integration tests — `DataHubImpl.create` applies the quality gate at the
 * ingest boundary so the served model (hub.raw / hub.computed) is NaN-free,
 * deduped and provenance-checked, and `getQuality` exposes the per-category
 * quality report. End-to-end: provider raw -> merge -> gate -> compute -> hub.
 */
import { describe, it, expect, vi } from 'vitest';
import type { DataProvider, RawData, FailureRecord } from '../../types/data-hub.js';
import type { PipelineRun } from '../../types/ci-cd.js';
import { DataHubImpl } from '../hub.js';
import { makeDataHubPersistenceMock } from '../../test-utils/factories/data-hub-mock.js';

function providerReturning(raw: RawData): DataProvider {
    return {
        name: 'mock',
        source: 'github',
        fetchRawData: vi.fn().mockResolvedValue(raw),
    };
}

function rawWithRun(extra: Partial<RawData>): RawData {
    const run: PipelineRun = {
        id: 1,
        run_number: 1,
        head_branch: 'main',
        status: 'completed',
        conclusion: 'success',
        created_at: '2024-01-01T00:00:00Z',
        event: 'push',
    };

    return {
        runs: [run],
        jobs: new Map(),
        artifacts: new Map(),
        failureReasons: new Map(),
        ...extra,
    };
}

describe('DataHubImpl.create: ingest gate', () => {
    it('gates provider raw before compute — no NaN, dedup, quality tagged', async () => {
        expect.hasAssertions();

        const recs = [
            { name: 'a', status: 'failed', confidence: NaN, source: 'junit' },
            { name: 'a', status: 'failed', confidence: 1, source: 'junit' },
            { name: 'b', status: 'weird', confidence: 1, source: 'junit' },
        ] as unknown as FailureRecord[];

        const provider = providerReturning(rawWithRun({ failureRecords: recs }));

        const persistence = makeDataHubPersistenceMock();

        const result = await DataHubImpl.create([provider], { repo: 'r' }, persistence);

        const hub = result.hub;

        expect(hub.raw.failureRecords).toHaveLength(2);

        expect((hub.raw.failureRecords ?? []).every((r) => Number.isFinite(r.confidence))).toBeTruthy();

        const a = hub.raw.failureRecords?.find((r) => r.name === 'a');

        expect(a?.confidence).toBeCloseTo(0.9, 5);

        expect(hub.getQuality('failureRecords')?.valid).toBeFalsy();

        const issues = hub.getQuality('failureRecords')?.issues.join(' ') ?? '';

        expect(issues).toContain('schema invalid');

        expect(issues).toContain('confidence normalized');

        expect(hub.computed).toBeDefined();

        expect(hub.getQuality('securityFindings')?.valid).toBeTruthy();
    });

    it('reports fully valid quality for clean provider raw', async () => {
        expect.hasAssertions();

        const recs: FailureRecord[] = [
            { name: 'a', status: 'failed', confidence: 1, source: 'junit' },
            { name: 'b', status: 'broken', confidence: 0.8, source: 'ctrf' },
        ];

        const provider = providerReturning(rawWithRun({ failureRecords: recs }));

        const persistence = makeDataHubPersistenceMock();

        const result = await DataHubImpl.create([provider], { repo: 'r' }, persistence);

        const hub = result.hub;

        expect(hub.getQuality('failureRecords')?.valid).toBeTruthy();

        expect(hub.raw.failureRecords).toStrictEqual(recs);
    });

    it('empty hub is gated too (createEmpty path) — all categories valid, empty', () => {
        const persistence = makeDataHubPersistenceMock();

        const hub = DataHubImpl.createEmpty('github', 'r', persistence);

        expect(hub.raw.failureRecords).toStrictEqual([]);

        expect(hub.raw.doraMetrics).toBeUndefined();

        expect(hub.getQuality('failureRecords')?.valid).toBeTruthy();

        expect(hub.getQuality('doraMetrics')?.valid).toBeTruthy();

        expect(hub.getQuality('performanceMetrics')?.valid).toBeTruthy();
    });
});
