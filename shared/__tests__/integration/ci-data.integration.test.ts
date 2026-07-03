/**
 * Integration tests for CI Data Hub — repositório central de métricas do CI/CD.
 *
 * Tests the full flow: factory → metrics → consumers.
 */
import { describe, it, expect, vi } from 'vitest';
import { createCiDataHub } from '../../ci-data.js';
import type { GitProvider, PipelineRun, PipelineJob } from '../../types/ci-cd.js';

/* ── Mock GitProvider ──────────────────────────────────────────────────── */

function createMockProvider(runs: PipelineRun[], jobsPerRun: Map<number, PipelineJob[]>): GitProvider {
    return {
        getRecentPipelines: vi.fn().mockResolvedValue(runs),
        getPipelineJobs: vi.fn().mockImplementation((id: number) => Promise.resolve(jobsPerRun.get(id) ?? [])),
        listPipelineArtifacts: vi.fn().mockResolvedValue([]),
        downloadArtifact: vi.fn().mockResolvedValue({ buffer: Buffer.from(''), filename: '' }),
        triggerPipeline: vi.fn(),
        getSchedules: vi.fn(),
        runSchedule: vi.fn(),
        createMergeRequest: vi.fn(),
        updateMergeRequest: vi.fn(),
        getMergeRequest: vi.fn(),
        searchMergeRequests: vi.fn(),
        acceptMergeRequest: vi.fn(),
        isApproved: vi.fn(),
        getCICDVariables: vi.fn(),
        getBranch: vi.fn(),
        getPipeline: vi.fn(),
        getDiff: vi.fn(),
        provider: 'github' as const,
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
    describe('CreateCiDataHub Flow', () => {
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

            const provider = createMockProvider(runs, jobsMap);
            const hub = await createCiDataHub(provider, 'owner/repo');

            expect(hub.passRate).toBeCloseTo(66.67, 0);
            expect(hub.topFailingJobs.length).toBeGreaterThan(0);
            expect(hub.branchBreakdown['main']).toBeDefined();
        });

        it('handles empty runs gracefully', async () => {
            expect.hasAssertions();

            const provider = createMockProvider([], new Map());
            const hub = await createCiDataHub(provider, 'owner/repo');

            expect(hub.runs).toHaveLength(0);
            expect(hub.passRate).toBe(0);
            expect(hub.avgDuration).toBe(0);
            expect(hub.suiteSpeedP95).toBe(0);
            expect(hub.topFailingJobs).toHaveLength(0);
        });

        it('computes suiteSpeedP95 correctly', async () => {
            expect.hasAssertions();

            const runs = [makeRun(1)];
            const jobsMap = new Map<number, PipelineJob[]>([
                [1, [makeJob(10, { duration: 10 }), makeJob(11, { duration: 20 }), makeJob(12, { duration: 30 })]],
            ]);

            const provider = createMockProvider(runs, jobsMap);
            const hub = await createCiDataHub(provider, 'owner/repo');

            // P95 of [10000, 20000, 30000] ms = 30000 ms
            expect(hub.suiteSpeedP95).toBe(30000);
        });
    });

    describe('Metrics Flow To Consumers', () => {
        it('hub passRate can be used by health score', async () => {
            expect.hasAssertions();

            const runs = [
                makeRun(1, { conclusion: 'success' }),
                makeRun(2, { conclusion: 'success' }),
                makeRun(3, { conclusion: 'failure' }),
            ];
            const provider = createMockProvider(runs, new Map());
            const hub = await createCiDataHub(provider, 'owner/repo');

            // Hub passRate = 66.67% (2 success / 3 total)
            expect(hub.passRate).toBeCloseTo(66.67, 0);
        });

        it('hub avgDuration can be used by pipeline cost', async () => {
            expect.hasAssertions();

            const runs = [
                makeRun(1, {
                    run_started_at: '2026-07-01T10:00:00Z',
                    updated_at: '2026-07-01T10:05:00Z', // 300s
                }),
            ];
            const provider = createMockProvider(runs, new Map());
            const hub = await createCiDataHub(provider, 'owner/repo');

            expect(hub.avgDuration).toBe(300);
        });

        it('hub branchBreakdown can be used by dashboards', async () => {
            expect.hasAssertions();

            const runs = [
                makeRun(1, { head_branch: 'main', conclusion: 'success' }),
                makeRun(2, { head_branch: 'main', conclusion: 'failure' }),
                makeRun(3, { head_branch: 'feature', conclusion: 'success' }),
            ];
            const provider = createMockProvider(runs, new Map());
            const hub = await createCiDataHub(provider, 'owner/repo');

            expect(hub.branchBreakdown['main']).toStrictEqual({ passRate: 50, count: 2 });
            expect(hub.branchBreakdown['feature']).toStrictEqual({ passRate: 100, count: 1 });
        });

        it('hub topFailureReasons can be used by reports', async () => {
            expect.hasAssertions();

            const runs = [makeRun(1)];
            const provider = createMockProvider(runs, new Map());
            const hub = await createCiDataHub(provider, 'owner/repo');

            expect(hub.topFailureReasons).toBeDefined();
            expect(Array.isArray(hub.topFailureReasons)).toBeTruthy();
        });
    });

    describe('Fallback Behavior', () => {
        it('returns empty data when provider throws', async () => {
            expect.hasAssertions();

            const provider = {
                getRecentPipelines: vi.fn().mockRejectedValue(new Error('Network error')),
                getPipelineJobs: vi.fn(),
                listPipelineArtifacts: vi.fn(),
                downloadArtifact: vi.fn(),
                triggerPipeline: vi.fn(),
                getSchedules: vi.fn(),
                runSchedule: vi.fn(),
                createMergeRequest: vi.fn(),
                updateMergeRequest: vi.fn(),
                getMergeRequest: vi.fn(),
                searchMergeRequests: vi.fn(),
                acceptMergeRequest: vi.fn(),
                isApproved: vi.fn(),
                getCICDVariables: vi.fn(),
                getBranch: vi.fn(),
                getPipeline: vi.fn(),
                getDiff: vi.fn(),
                provider: 'github' as const,
            } as GitProvider;

            const hub = await createCiDataHub(provider, 'owner/repo');

            expect(hub.runs).toHaveLength(0);
            expect(hub.passRate).toBe(0);
        });
    });
});
