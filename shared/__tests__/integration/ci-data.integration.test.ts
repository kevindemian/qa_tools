/**
 * Integration tests for CI Data Hub — repositório central de métricas do CI/CD.
 *
 * Tests the full flow: DataProvider → DataHubImpl → consumers.
 */
import { describe, it, expect, vi } from 'vitest';
import type { PipelineRun, PipelineJob } from '../../types/ci-cd.js';
import type { DataProvider, RawData } from '../../types/data-hub.js';
import { DataHubImpl } from '../../data-hub/hub.js';

/* ── Mock DataProvider ──────────────────────────────────────────────────── */

function createMockDataProvider(rawData: RawData): DataProvider {
    return {
        name: 'mock-github',
        source: 'github',
        fetchRawData: vi.fn().mockResolvedValue(rawData),
    };
}

/* ── Fixtures ──────────────────────────────────────────────────────────── */

function makeRun(id: number, overrides?: Partial<PipelineRun>): PipelineRun {
    return {
        id,
        conclusion: 'success',
        head_branch: 'main',
        created_at: '2026-07-01T10:00:00Z',
        updated_at: '2026-07-01T10:05:00Z',
        run_started_at: '2026-07-01T10:00:00Z',
        ...overrides,
    };
}

function makeJob(id: number, overrides?: Partial<PipelineJob>): PipelineJob {
    return {
        id,
        name: 'test',
        stage: 'test',
        status: 'success',
        duration: 120,
        ...overrides,
    };
}

/* ── Tests ─────────────────────────────────────────────────────────────── */

describe('Integration: CI Data Hub', () => {
    describe('DataHubImpl.create Flow', () => {
        it('creates hub with complete pipeline data', async () => {
            expect.hasAssertions();

            const runs = [
                makeRun(1, { conclusion: 'success' }),
                makeRun(2, { conclusion: 'failure' }),
                makeRun(3, { conclusion: 'success' }),
            ];

            const jobsMap = new Map<number, PipelineJob[]>([
                [1, [makeJob(10), makeJob(11, { name: 'lint', status: 'success' })]],
                [2, [makeJob(20, { status: 'failure' }), makeJob(21, { name: 'lint', status: 'success' })]],
                [3, [makeJob(30), makeJob(31, { name: 'lint', status: 'success' })]],
            ]);

            const rawData: RawData = { runs, jobs: jobsMap, failureReasons: new Map(), artifacts: new Map() };
            const provider = createMockDataProvider(rawData);
            const hub = await DataHubImpl.create([provider], { repo: 'owner/repo' });

            expect(hub.computed.passRate).toBeCloseTo(66.67, 0);
            expect(hub.computed.topFailingJobs.length).toBeGreaterThan(0);
            expect(hub.raw.jobs.size).toBe(3);
        });

        it('handles empty runs gracefully', async () => {
            expect.hasAssertions();

            const rawData: RawData = { runs: [], jobs: new Map(), failureReasons: new Map(), artifacts: new Map() };
            const provider = createMockDataProvider(rawData);
            const hub = await DataHubImpl.create([provider], { repo: 'owner/repo' });

            expect(hub.raw.runs).toHaveLength(0);
            expect(hub.computed.passRate).toBe(0);
            expect(hub.computed.avgDuration).toBe(0);
            expect(hub.computed.suiteSpeedP95).toBe(0);
            expect(hub.computed.topFailingJobs).toHaveLength(0);
        });

        it('computes suiteSpeedP95 correctly', async () => {
            expect.hasAssertions();

            const runs = [makeRun(1)];
            const jobsMap = new Map<number, PipelineJob[]>([
                [1, [makeJob(10, { duration: 10 }), makeJob(11, { duration: 20 }), makeJob(12, { duration: 30 })]],
            ]);

            const rawData: RawData = { runs, jobs: jobsMap, failureReasons: new Map(), artifacts: new Map() };
            const provider = createMockDataProvider(rawData);
            const hub = await DataHubImpl.create([provider], { repo: 'owner/repo' });

            // P95 of [10000, 20000, 30000] ms = 30000 ms
            expect(hub.computed.suiteSpeedP95).toBe(30000);
        });
    });

    describe('Metrics Flow To Consumers', () => {
        it('health score uses DataHub passRate instead of MetricsStore', async () => {
            expect.hasAssertions();

            const { calculateHealthScore } = await import('../../health-score.js');

            const runs = [
                makeRun(1, { conclusion: 'success' }),
                makeRun(2, { conclusion: 'success' }),
                makeRun(3, { conclusion: 'failure' }),
            ];
            const rawData: RawData = { runs, jobs: new Map(), failureReasons: new Map(), artifacts: new Map() };
            const provider = createMockDataProvider(rawData);
            const hub = await DataHubImpl.create([provider], { repo: 'owner/repo' });

            // Hub passRate = 66.67% — store has 10% (10 passed, 90 failed)
            const store = {
                runs: [
                    {
                        timestamp: '2026-01-01',
                        passed: 10,
                        failed: 90,
                        skipped: 0,
                        total: 100,
                        duration: 60,
                        tests: [],
                        project: 'test',
                    },
                ],
                failureClassifications: [],
            } as import('../../metrics.js').MetricsStore;
            const withCi = calculateHealthScore(store, { dataHub: hub });
            const withoutCi = calculateHealthScore(store);

            // dataHub passRate (66.67%) should produce different result than store (10%)
            expect(withCi.dimensions.passRate.score).not.toBe(withoutCi.dimensions.passRate.score);
        });

        it('quality gate uses DataHub when forwarded', async () => {
            expect.hasAssertions();

            const { runQualityGate } = await import('../../quality-gate.js');
            const metrics = await import('../../metrics.js');

            const runs = [
                makeRun(1, { conclusion: 'success' }),
                makeRun(2, { conclusion: 'success' }),
                makeRun(3, { conclusion: 'success' }),
            ];
            const rawData: RawData = { runs, jobs: new Map(), failureReasons: new Map(), artifacts: new Map() };
            const provider = createMockDataProvider(rawData);
            const hub = await DataHubImpl.create([provider], { repo: 'owner/repo' });

            // Mock store with low pass rate — dataHub overrides to 100%
            vi.spyOn(metrics, 'loadMetrics').mockReturnValue({
                runs: [{ passed: 10, failed: 90, total: 100, tests: [], project: 'test' }],
                failureClassifications: [],
            } as never);
            const withCi = runQualityGate({ dataHub: hub });
            const withoutCi = runQualityGate();

            expect(withCi.score).not.toBe(withoutCi.score);
        });
    });

    describe('Fallback Behavior', () => {
        it('returns empty data when provider throws', async () => {
            expect.hasAssertions();

            const provider: DataProvider = {
                name: 'mock-failing',
                source: 'github',
                fetchRawData: vi.fn().mockRejectedValue(new Error('Network error')),
            };

            const hub = await DataHubImpl.create([provider], { repo: 'owner/repo' });

            expect(hub.raw.runs).toHaveLength(0);
            expect(hub.computed.passRate).toBe(0);
        });
    });
});
