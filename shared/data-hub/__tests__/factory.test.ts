import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createDataHub } from '../factory.js';
import { getCachedHub, setCachedHub, clearCache } from '../cache.js';
import type { DataHub, DataHubPersistence } from '../../types/data-hub.js';
import type { GitProvider, PipelineRun } from '../../types/ci-cd.js';

/* ── Mocks ─────────────────────────────────────────────────────────────── */

function makeMockProvider(): GitProvider {
    return {
        triggerPipeline: vi.fn().mockResolvedValue(undefined),
        getSchedules: vi.fn().mockResolvedValue([]),
        runSchedule: vi.fn().mockResolvedValue({}),
        createMergeRequest: vi.fn().mockResolvedValue(null),
        updateMergeRequest: vi.fn().mockResolvedValue(null),
        getMergeRequest: vi.fn().mockResolvedValue(null),
        searchMergeRequests: vi.fn().mockResolvedValue([]),
        acceptMergeRequest: vi.fn().mockResolvedValue(null),
        isApproved: vi.fn().mockResolvedValue(false),
        getCICDVariables: vi.fn().mockResolvedValue(null),
        getRecentPipelines: vi.fn().mockResolvedValue([]),
        getBranch: vi.fn().mockResolvedValue(null),
        getPipeline: vi.fn().mockResolvedValue(null),
        getPipelineJobs: vi.fn().mockResolvedValue([]),
        listPipelineArtifacts: vi.fn().mockResolvedValue([]),
        downloadArtifact: vi.fn().mockResolvedValue({ buffer: Buffer.from(''), filename: '' }),
        getJobLogs: vi.fn().mockResolvedValue(null),
        getDiff: vi.fn().mockResolvedValue(''),
        getWorkflowRunTiming: vi.fn().mockResolvedValue(null),
        getFileContents: vi.fn().mockResolvedValue(null),
        listDirectory: vi.fn().mockResolvedValue(null),
        getTestReport: vi.fn().mockResolvedValue(null),
        provider: 'github',
    };
}

function makeHub(repo: string): DataHub {
    return {
        raw: { runs: [] as PipelineRun[], jobs: new Map(), artifacts: new Map(), failureReasons: new Map() },
        computed: {
            passRate: 0,
            avgDuration: 0,
            suiteSpeedP95: 0,
            flakyRate: [],
            coverage: 0,
            pipelineCost: { totalMinutes: 0, estimatedCost: 0 },
            defectTrends: [],
            branchBreakdown: {},
            topFailingJobs: [],
            topFailureReasons: [],
            releaseScore: { score: 0, dimensions: {} as never, grade: 'critical' },
            quarantineStatus: { flakyCount: 0, quarantinedCount: 0 },
            testPassRate: 0,
            testCounts: { passed: 0, failed: 0, skipped: 0, total: 0 },
            framework: 'unknown',
        },
        timestamp: new Date(),
        provider: 'github',
        repo,
        saveRun: vi.fn(),
        saveCoverageSnapshot: vi.fn(),
        saveFailureClassification: vi.fn(),
        flush: vi.fn(),
        loadCoverageHistory: vi.fn().mockReturnValue([]),
        loadFailureClassifications: vi.fn().mockReturnValue([]),
        saveMetricsStore: vi.fn(),
        loadMetricsStore: vi.fn().mockReturnValue({ runs: [] }),
        saveParseResult: vi.fn().mockReturnValue({
            timestamp: new Date().toISOString(),
            project: '',
            total: 0,
            passed: 0,
            failed: 0,
            skipped: 0,
            duration: 0,
            tests: [],
        }),
        saveQualityMetrics: vi.fn(),
        loadQualityMetricsHistory: vi.fn().mockReturnValue([]),
    };
}

function makeMockPersistence(): DataHubPersistence {
    return {
        loadMetricsStore: vi.fn().mockReturnValue({ runs: [] }),
        saveMetricsStore: vi.fn(),
        loadCoverageHistory: vi.fn().mockReturnValue([]),
        saveCoverageSnapshot: vi.fn(),
        loadFailureClassifications: vi.fn().mockReturnValue([]),
        saveFailureClassification: vi.fn(),
        saveRun: vi.fn(),
        saveParseResult: vi.fn().mockReturnValue({
            timestamp: new Date().toISOString(),
            project: '',
            total: 0,
            passed: 0,
            failed: 0,
            skipped: 0,
            duration: 0,
            tests: [],
        }),
        loadQualityMetricsHistory: vi.fn().mockReturnValue([]),
        saveQualityMetrics: vi.fn(),
        flush: vi.fn(),
    };
}

/* ── Tests ─────────────────────────────────────────────────────────────── */

describe('CreateDataHub', () => {
    let mockProvider: GitProvider;

    beforeEach(() => {
        clearCache();
        vi.clearAllMocks();
        mockProvider = makeMockProvider();
    });

    it('returns cached hub on cache hit', async () => {
        expect.hasAssertions();

        const mockHub = makeHub('cached/repo');
        setCachedHub('cached/repo', mockHub);

        const result = await createDataHub(mockProvider, 'cached/repo');

        expect(result.hub).toBe(mockHub);
        expect(result.status).toBe('ok');
    });

    it('delegates to DataHubImpl.create on cache miss', async () => {
        expect.hasAssertions();

        const persistence = makeMockPersistence();
        const result = await createDataHub(mockProvider, 'new/repo', { persistence });

        expect(result.hub).toBeDefined();
        expect(['ok', 'warning']).toContain(result.status);
    });

    it('retries on transient failure', async () => {
        expect.hasAssertions();

        const persistence = makeMockPersistence();
        let callCount = 0;

        vi.doMock('../hub.js', () => ({
            DataHubImpl: {
                create: vi.fn().mockImplementation(() => {
                    callCount++;
                    if (callCount < 3) throw new Error('transient');
                    return { hub: makeHub('retry/repo'), status: 'ok' as const };
                }),
            },
        }));

        const result = await createDataHub(mockProvider, 'retry/repo', {
            persistence,
            maxRetries: 3,
            baseDelay: 1,
        });

        expect(callCount).toBe(3);
        expect(result.hub).toBeDefined();

        vi.doUnmock('../hub.js');
    });

    it('throws after maxRetries exhausted', async () => {
        expect.hasAssertions();

        const persistence = makeMockPersistence();

        vi.doMock('../hub.js', () => ({
            DataHubImpl: {
                create: vi.fn().mockRejectedValue(new Error('permanent')),
            },
        }));

        await expect(
            createDataHub(mockProvider, 'fail/repo', {
                persistence,
                maxRetries: 2,
                baseDelay: 1,
            }),
        ).rejects.toThrow('DataHub creation failed after 2 attempts');

        vi.doUnmock('../hub.js');
    });

    it('creates persistence automatically if not provided', async () => {
        expect.hasAssertions();

        vi.doMock('../persistence.js', () => ({
            createDataHubPersistence: vi.fn().mockReturnValue(makeMockPersistence()),
        }));

        const result = await createDataHub(mockProvider, 'auto/repo');

        expect(result.hub).toBeDefined();

        vi.doUnmock('../persistence.js');
    });

    it('caches hub after successful creation', async () => {
        expect.hasAssertions();

        const persistence = makeMockPersistence();

        await createDataHub(mockProvider, 'cache-me/repo', { persistence });
        const cached = getCachedHub('cache-me/repo');

        expect(cached).toBeDefined();
    });

    it('uses exponential backoff between retries', async () => {
        expect.hasAssertions();

        const persistence = makeMockPersistence();
        const delays: number[] = [];
        const originalSetTimeout = globalThis.setTimeout;

        vi.stubGlobal(
            'setTimeout',
            vi.fn((fn: () => void, ms?: number) => {
                delays.push(ms ?? 0);
                return originalSetTimeout(fn, 0);
            }),
        );

        vi.doMock('../hub.js', () => ({
            DataHubImpl: {
                create: vi
                    .fn()
                    .mockRejectedValueOnce(new Error('fail 1'))
                    .mockRejectedValueOnce(new Error('fail 2'))
                    .mockResolvedValue({ hub: makeHub('backoff/repo'), status: 'ok' }),
            },
        }));

        await createDataHub(mockProvider, 'backoff/repo', {
            persistence,
            maxRetries: 3,
            baseDelay: 100,
        });

        expect(delays).toStrictEqual([100, 200]);

        vi.restoreAllMocks();
        vi.doUnmock('../hub.js');
    });
});
