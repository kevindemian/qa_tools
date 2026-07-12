/**
 * Integration tests for DataHub.
 *
 * Tests the complete flow: providers → hub → compute → metrics.
 *
 * D5 Obrigatório:
 * - D5.4: Agregação correta ao combinar resultados de múltiplas funções
 * - D5.7: Guards zero/NaN preservados ao propagar resultados
 * - D5.8: Clamp consistente ao agregar métricas
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DataHubImpl } from '../../hub.js';
import { makeDataHubPersistenceMock } from '../../../test-utils/factories/data-hub-mock.js';
import { getCachedHub, setCachedHub, clearCache } from '../../cache.js';
import type { DataProvider, RawData } from '../../../types/data-hub.js';
import type { PipelineRun, PipelineJob } from '../../../types/ci-cd.js';

/* ── Helpers ────────────────────────────────────────────────────────────── */

let nextId = 1;

function makeRun(overrides?: Partial<PipelineRun>): PipelineRun {
    return {
        id: nextId++,
        conclusion: 'success',
        run_started_at: '2026-01-01T10:00:00Z',
        updated_at: '2026-01-01T10:10:00Z',
        head_branch: 'main',
        ...overrides,
    };
}

function makeJob(overrides?: Partial<PipelineJob>): PipelineJob {
    return {
        id: nextId++,
        name: 'test-job',
        stage: 'test',
        status: 'success',
        duration: 10,
        ...overrides,
    };
}

function makeProvider(rawData: RawData): DataProvider {
    return {
        name: 'test-provider',
        source: 'github' as const,
        fetchRawData: vi.fn().mockResolvedValue(rawData),
    };
}

/* ── Mock Persistence ──────────────────────────────────────────────────── */

const mockPersistence = makeDataHubPersistenceMock();

/* ── Tests ──────────────────────────────────────────────────────────────── */

describe('Integration: DataHub', () => {
    beforeEach(() => {
        clearCache();
        nextId = 1;
    });

    it('d5.4: aggregates metrics from multiple compute functions', async () => {
        expect.hasAssertions();

        const runs = [
            makeRun({ id: 1, conclusion: 'success', head_branch: 'main' }),
            makeRun({ id: 2, conclusion: 'success', head_branch: 'main' }),
            makeRun({ id: 3, conclusion: 'failure', head_branch: 'feature-x' }),
        ];
        const jobs = new Map<number, PipelineJob[]>([
            [1, [makeJob({ id: 10, name: 'lint', status: 'success', duration: 5 })]],
            [2, [makeJob({ id: 20, name: 'lint', status: 'success', duration: 5 })]],
            [3, [makeJob({ id: 30, name: 'lint', status: 'failure', duration: 5 })]],
        ]);

        const rawData: RawData = {
            runs,
            jobs,
            artifacts: new Map(),
            failureReasons: new Map(),
        };

        const provider = makeProvider(rawData);
        const { hub } = await DataHubImpl.create([provider], { repo: 'test/repo' }, mockPersistence);

        expect(hub.computed.passRate).toBeCloseTo(66.67, 1);
        expect(hub.computed.branchBreakdown).toHaveProperty('main');
        expect(hub.computed.branchBreakdown).toHaveProperty('feature-x');
        expect(hub.computed.topFailingJobs.length).toBeGreaterThanOrEqual(0);
    });

    it('d5.7: preserves zero/NaN guards in metrics', async () => {
        expect.hasAssertions();

        const rawData: RawData = {
            runs: [],
            jobs: new Map(),
            artifacts: new Map(),
            failureReasons: new Map(),
        };

        const provider = makeProvider(rawData);
        const { hub } = await DataHubImpl.create([provider], { repo: 'test/repo' }, mockPersistence);

        expect(hub.computed.passRate).toBe(0);
        expect(hub.computed.avgDuration).toBe(0);
        expect(hub.computed.suiteSpeedP95).toBe(0);
        expect(hub.computed.coverage).toBe(0);
        expect(hub.computed.pipelineCost.totalMinutes).toBe(0);
        expect(hub.computed.pipelineCost.estimatedCost).toBe(0);
        expect(Number.isNaN(hub.computed.passRate)).toBeFalsy();
        expect(Number.isNaN(hub.computed.avgDuration)).toBeFalsy();
    });

    it('d5.8: clamps metrics consistently', async () => {
        expect.hasAssertions();

        const runs = Array.from({ length: 100 }, (_, i) =>
            makeRun({
                id: i + 1,
                conclusion: i < 95 ? 'success' : 'failure',
                run_started_at: `2026-01-01T${String(i % 24).padStart(2, '0')}:00:00Z`,
                updated_at: `2026-01-01T${String(i % 24).padStart(2, '0')}:10:00Z`,
            }),
        );

        const rawData: RawData = {
            runs,
            jobs: new Map(),
            artifacts: new Map(),
            failureReasons: new Map(),
        };

        const provider = makeProvider(rawData);
        const { hub } = await DataHubImpl.create([provider], { repo: 'test/repo' }, mockPersistence);

        expect(hub.computed.passRate).toBeGreaterThanOrEqual(0);
        expect(hub.computed.passRate).toBeLessThanOrEqual(100);
        expect(hub.computed.pipelineCost.totalMinutes).toBeGreaterThanOrEqual(0);
    });

    it('hub exposes raw and computed layers correctly', async () => {
        expect.hasAssertions();

        const runs = [makeRun({ id: 1, conclusion: 'success' })];
        const rawData: RawData = {
            runs,
            jobs: new Map(),
            artifacts: new Map(),
            failureReasons: new Map(),
        };

        const provider = makeProvider(rawData);
        const { hub } = await DataHubImpl.create([provider], { repo: 'test/repo' }, mockPersistence);

        expect(hub.raw.runs).toStrictEqual(runs);
        expect(hub.computed.passRate).toBeGreaterThanOrEqual(0);
        expect(hub.computed.passRate).toBeLessThanOrEqual(100);
    });

    it('caches DataHub in session cache', async () => {
        expect.hasAssertions();

        const runs = [makeRun({ id: 1, conclusion: 'success' })];
        const rawData: RawData = {
            runs,
            jobs: new Map(),
            artifacts: new Map(),
            failureReasons: new Map(),
        };

        const provider = makeProvider(rawData);
        const { hub } = await DataHubImpl.create([provider], { repo: 'test/repo' }, mockPersistence);

        setCachedHub('test/repo', hub);
        const cached = getCachedHub('test/repo');

        expect(cached).toBe(hub);
    });

    it('countUniqueJobs uses actual job names from raw.jobs, not empty Set', async () => {
        expect.hasAssertions();

        const runs = [
            makeRun({ id: 1, conclusion: 'success' }),
            makeRun({ id: 2, conclusion: 'success' }),
            makeRun({ id: 3, conclusion: 'failure' }),
        ];

        const jobs = new Map<number, PipelineJob[]>([
            [1, [makeJob({ id: 10, name: 'lint', status: 'success', duration: 5 })]],
            [
                2,
                [
                    makeJob({ id: 20, name: 'lint', status: 'success', duration: 5 }),
                    makeJob({ id: 21, name: 'unit-test', status: 'success', duration: 30 }),
                ],
            ],
            [
                3,
                [
                    makeJob({ id: 30, name: 'lint', status: 'failure', duration: 5 }),
                    makeJob({ id: 31, name: 'unit-test', status: 'success', duration: 30 }),
                ],
            ],
        ]);

        const rawData: RawData = {
            runs,
            jobs,
            artifacts: new Map(),
            failureReasons: new Map(),
        };

        const provider = makeProvider(rawData);
        const { hub } = await DataHubImpl.create([provider], { repo: 'test/repo' }, mockPersistence);

        expect(hub.computed.flakyRate).toHaveLength(1);

        const firstFlaky = hub.computed.flakyRate[0];

        expect(firstFlaky).toBeDefined();
        expect(firstFlaky?.title).toBe('lint');

        const flakyPct = hub.computed.releaseScore.dimensions.flakyRate;

        expect(flakyPct.score).toBeGreaterThanOrEqual(0);
        expect(flakyPct.score).toBeLessThanOrEqual(100);
        expect(hub.computed.releaseScore.score).toBeGreaterThanOrEqual(0);
        expect(hub.computed.releaseScore.score).toBeLessThanOrEqual(100);
    });
});
