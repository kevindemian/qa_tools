/**
 * System tests — CI Data Hub
 *
 * Tests the complete data flow: GitProvider → createCiDataHub → consumers.
 * Validates that CiDataHub data propagates correctly through the entire
 * consumer chain: health-score, quality-gate, pipeline-cost, traceability-matrix.
 *
 * Uses mocked GitProvider to simulate CI API responses.
 */
import { describe, expect, it, vi } from 'vitest';
import type { GitProvider, PipelineRun, PipelineJob } from '../../types/ci-cd.js';
import { createFlatTests } from '../../test-utils/factories/flat-test-factory.js';
import { ciDataHubToDataHub } from '../../data-hub/adapter.js';

vi.mock('../../logger.js', () => ({
    rootLogger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn(), child: vi.fn().mockReturnThis() },
}));

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
        getJobLogs: vi.fn(),
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

/* ── System Tests ──────────────────────────────────────────────────────── */

describe('System: CI Data Hub — Full Pipeline Flow', () => {
    describe('Hub creation from provider data', () => {
        it('creates hub with metrics derived from provider data', async () => {
            expect.hasAssertions();

            const { createCiDataHub } = await import('../../ci-data.js');
            const runs = [
                makeRun(1, { conclusion: 'success' }),
                makeRun(2, { conclusion: 'success' }),
                makeRun(3, { conclusion: 'failure' }),
            ];
            const jobsMap = new Map<number, PipelineJob[]>([
                [1, [makeJob(10), makeJob(11, { name: 'lint', status: 'success' })]],
                [2, [makeJob(20), makeJob(21, { name: 'lint', status: 'success' })]],
                [3, [makeJob(30, { status: 'failure' }), makeJob(31, { name: 'lint', status: 'success' })]],
            ]);

            const provider = createMockProvider(runs, jobsMap);
            const hub = await createCiDataHub(provider, 'owner/repo');

            expect(hub.passRate).toBeCloseTo(66.67, 0);
            expect(hub.recentRunsCount).toBe(3);
            expect(hub.provider).toBe('github');
            expect(hub.jobs.size).toBe(3);
            expect(hub.topFailingJobs.length).toBeGreaterThan(0);
        });

        it('handles provider returning empty runs', async () => {
            expect.hasAssertions();

            const { createCiDataHub } = await import('../../ci-data.js');
            const provider = createMockProvider([], new Map());
            const ciHub = await createCiDataHub(provider, 'owner/repo');
            const hub = ciDataHubToDataHub(ciHub);

            expect(hub.raw.runs).toHaveLength(0);
            expect(hub.computed.passRate).toBe(0);
            expect(hub.computed.avgDuration).toBe(0);
        });
    });

    describe('Hub data → health-score consumer', () => {
        it('health score uses DataHub passRate instead of MetricsStore when provided', async () => {
            expect.hasAssertions();

            const { createCiDataHub } = await import('../../ci-data.js');
            const { calculateHealthScore } = await import('../../health-score.js');
            const runs = [makeRun(1, { conclusion: 'success' }), makeRun(2, { conclusion: 'failure' })];
            const provider = createMockProvider(runs, new Map());
            const ciHub = await createCiDataHub(provider, 'owner/repo');
            const hub = ciDataHubToDataHub(ciHub);

            const store = {
                runs: [
                    {
                        timestamp: '2026-07-01T10:00:00Z',
                        project: 'test',
                        total: 10,
                        passed: 9,
                        failed: 1,
                        skipped: 0,
                        duration: 5000,
                        tests: createFlatTests(10, { failFirst: true }),
                    },
                ],
            };

            const withHub = calculateHealthScore(store, { dataHub: hub });
            const withoutHub = calculateHealthScore(store, {});

            // DataHub passRate (50%) must override MetricsStore passRate (90%)
            expect(withHub.dimensions.passRate.score).not.toBe(withoutHub.dimensions.passRate.score);
        });
    });

    describe('Hub data → pipeline-cost consumer', () => {
        it('pipeline cost uses ciData.runs for real cost calculation', async () => {
            expect.hasAssertions();

            const { createCiDataHub } = await import('../../ci-data.js');
            const { calculatePipelineCost } = await import('../../pipeline-cost.js');
            const runs = [
                makeRun(1, {
                    run_started_at: '2026-07-01T10:00:00Z',
                    updated_at: '2026-07-01T10:05:00Z',
                }),
                makeRun(2, {
                    run_started_at: '2026-07-01T11:00:00Z',
                    updated_at: '2026-07-01T11:10:00Z',
                }),
            ];
            const provider = createMockProvider(runs, new Map());
            const ciHub = await createCiDataHub(provider, 'owner/repo');
            const hub = ciDataHubToDataHub(ciHub);

            const result = calculatePipelineCost(null, 0.01, hub);

            expect(result.runCount).toBe(2);
            expect(result.totalDurationSec).toBe(900);
            expect(result.totalCost).toBeGreaterThan(0);
        });
    });

    describe('Hub data → traceability-matrix consumer', () => {
        it('traceability matrix uses ciData.flakyTests for flakiness', async () => {
            expect.hasAssertions();

            const { createCiDataHub } = await import('../../ci-data.js');
            const { buildTraceabilityMatrix } = await import('../../traceability-matrix.js');
            const runs = [makeRun(1)];
            const jobsMap = new Map<number, PipelineJob[]>([
                [1, [makeJob(10, { status: 'failure' }), makeJob(11, { status: 'success' })]],
            ]);

            const provider = createMockProvider(runs, jobsMap);
            const ciHub = await createCiDataHub(provider, 'owner/repo');
            const hub = ciDataHubToDataHub(ciHub);

            const metricsStore = {
                runs: [
                    {
                        timestamp: '2026-07-01T10:00:00Z',
                        project: 'test',
                        total: 2,
                        passed: 1,
                        failed: 1,
                        skipped: 0,
                        duration: 1000,
                        tests: [
                            { title: 'TC-001', state: 'passed' as const, duration: 500 },
                            { title: 'TC-002', state: 'failed' as const, duration: 500 },
                        ],
                    },
                ],
            };

            const coverageResult = {
                items: [{ epic: 'EPIC-1', hasTest: true, linkedTestKeys: ['TC-001', 'TC-002'], issueKey: 'STORY-1' }],
                totals: { total: 1, covered: 1 },
                byEpic: { 'EPIC-1': { total: 1, covered: 1, rawPct: 100 } },
            };

            const result = buildTraceabilityMatrix(metricsStore, coverageResult, hub);

            expect(result.nodes.length).toBeGreaterThan(0);
        });
    });

    describe('Fallback: hub empty → consumers use MetricsStore', () => {
        it('empty DataHub produces same health score as no hub (clean degradation)', async () => {
            expect.hasAssertions();

            const { createCiDataHub } = await import('../../ci-data.js');
            const { calculateHealthScore } = await import('../../health-score.js');

            const provider = createMockProvider([], new Map());
            const ciHub = await createCiDataHub(provider, 'owner/repo');
            const hub = ciDataHubToDataHub(ciHub);

            const store = {
                runs: [
                    {
                        timestamp: '2026-07-01T10:00:00Z',
                        project: 'test',
                        total: 10,
                        passed: 9,
                        failed: 1,
                        skipped: 0,
                        duration: 5000,
                        tests: createFlatTests(10, { failFirst: true }),
                    },
                ],
            };

            const withEmptyHub = calculateHealthScore(store, { dataHub: hub });
            const withoutHub = calculateHealthScore(store, {});

            // Empty DataHub must not change the result — clean degradation
            expect(withEmptyHub.overall).toBe(withoutHub.overall);
            expect(withEmptyHub.grade).toBe(withoutHub.grade);
            expect(withEmptyHub.dimensions.passRate.score).toBe(withoutHub.dimensions.passRate.score);
        });
    });

    describe('Error resilience: provider failures', () => {
        it('hub handles provider API errors gracefully', async () => {
            expect.hasAssertions();

            const { createCiDataHub } = await import('../../ci-data.js');
            const provider = {
                getRecentPipelines: vi.fn().mockRejectedValue(new Error('API rate limit')),
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
                getJobLogs: vi.fn(),
                provider: 'github' as const,
            } as GitProvider;

            const hub = await createCiDataHub(provider, 'owner/repo');

            expect(hub.runs).toHaveLength(0);
            expect(hub.passRate).toBe(0);
        });

        it('hub handles partial job fetch failures', async () => {
            expect.hasAssertions();

            const { createCiDataHub } = await import('../../ci-data.js');
            const runs = [makeRun(1), makeRun(2)];
            let callCount = 0;
            const provider = createMockProvider(runs, new Map());
            provider.getPipelineJobs = vi.fn().mockImplementation(() => {
                callCount++;
                if (callCount === 1) {
                    return Promise.resolve([makeJob(10)]);
                }
                return Promise.reject(new Error('Job fetch failed'));
            });

            const hub = await createCiDataHub(provider, 'owner/repo');

            expect(hub.runs).toHaveLength(2);
            expect(hub.jobs.size).toBe(1);
        });
    });
});
