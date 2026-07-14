/**
 * Integration tests — ensureDataHub (session-state.ts)
 *
 * Validates:
 * - Lazy-init: first call triggers getOrFetchDataHub
 * - Cache hit: second call returns cached hub without re-fetching
 * - Missing manager returns undefined
 * - Missing project name returns undefined
 * - Error handling returns hub with empty data (resilient design)
 * - Global-hub delegation: setDataHub/ensureDataHub affect global-hub
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DataHub, RawData } from '../../../shared/types/data-hub.js';
import type { GitProvider } from '../../../shared/types/ci-cd.js';
import { DataHubImpl } from '../../../shared/data-hub/hub.js';
import { makeDataHubPersistenceMock, makeDataHubGetters } from '../../../shared/test-utils/factories/data-hub-mock.js';
import { clearCache } from '../../../shared/data-hub/cache.js';
import { getDataHub as getGlobalHub } from '../../../shared/data-hub/global-hub.js';
import {
    ensureDataHub,
    setDataHub,
    _resetForTest,
    setManager,
    setCurrentProjectName,
} from '../../../git_triggers/session-state.js';

/* ── Mock DataHub ─────────────────────────────────────────────────────── */

function makeMockHub(): DataHub {
    const raw: RawData = { runs: [], jobs: new Map(), artifacts: new Map(), failureReasons: new Map() };
    return {
        raw,
        computed: {
            passRate: 50,
            avgDuration: 1000,
            suiteSpeedP95: 500,
            flakyRate: [],
            coverage: 80,
            pipelineCost: { totalMinutes: 0, estimatedCost: 0 },
            defectTrends: [],
            branchBreakdown: {},
            topFailingJobs: [],
            topFailureReasons: [],
            releaseScore: {
                score: 0,
                dimensions: {
                    passRate: { score: 0, status: 'fail' },
                    flakyRate: { score: 0, status: 'fail' },
                    coverage: { score: 0, status: 'fail' },
                    executionRate: { score: 0, status: 'fail' },
                    suiteSpeed: { score: 0, status: 'fail' },
                },
                grade: 'F',
            },
            quarantineStatus: { flakyCount: 0, quarantinedCount: 0 },
            testPassRate: 50,
            testCounts: { passed: 50, failed: 50, skipped: 0, total: 100 },
            framework: 'vitest',
            executionRate: 77,
            flakyPercentage: 12,
        },
        timestamp: new Date(),
        provider: 'github',
        mergeIncremental: vi.fn(),
        repo: 'test/repo',
        saveRun: vi.fn(),
        saveCoverageSnapshot: vi.fn(),
        saveFailureClassification: vi.fn(),
        flush: vi.fn(),
        loadCoverageHistory: vi.fn().mockReturnValue([]),
        loadFailureClassifications: vi.fn().mockReturnValue([]),
        saveMetricsStore: vi.fn(),
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
        // ─── ST-1 categories ───────────────────────────────────────────────
        saveFailureRecords: vi.fn(),
        loadFailureRecords: vi.fn().mockReturnValue([]),
        saveSecurityFindings: vi.fn(),
        loadSecurityFindings: vi.fn().mockReturnValue([]),
        saveDeployments: vi.fn(),
        loadDeployments: vi.fn().mockReturnValue([]),
        saveReleases: vi.fn(),
        loadReleases: vi.fn().mockReturnValue([]),
        saveDoraMetrics: vi.fn(),
        loadDoraMetrics: vi.fn().mockReturnValue(null),
        savePmIssues: vi.fn(),
        loadPmIssues: vi.fn().mockReturnValue([]),
        saveCoverageFiles: vi.fn(),
        loadCoverageFiles: vi.fn().mockReturnValue([]),
        savePerformanceMetrics: vi.fn(),
        loadPerformanceMetrics: vi.fn().mockReturnValue(null),
        savePullRequests: vi.fn(),
        loadPullRequests: vi.fn().mockReturnValue([]),
        getQuality: vi.fn(),
        getQuarantine: vi.fn(() => ({ entries: [] })),
        getBranchPassRate: vi.fn(),
        loadReport: vi.fn(),
        saveReport: vi.fn(),
        put: vi.fn(),
        getBranch: vi.fn(),
        loadMetrics: vi.fn(),
        saveMetrics: vi.fn(),
        ...makeDataHubGetters(),
    };
}

/* ── Mock GitProvider ──────────────────────────────────────────────────── */

function createMockGitProvider(): GitProvider {
    return {
        getRecentPipelines: vi.fn().mockResolvedValue([]),
        getPipelineJobs: vi.fn().mockResolvedValue([]),
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
        getWorkflowRunTiming: vi.fn(),
        getWorkflowUsage: vi.fn(),
        getFileContents: vi.fn(),
        listDirectory: vi.fn(),
        getTestReport: vi.fn(),
        provider: 'github',
    };
}

/* ── Tests ─────────────────────────────────────────────────────────────── */

describe('Integration: ensureDataHub', () => {
    beforeEach(() => {
        _resetForTest();
        clearCache();
        vi.clearAllMocks();
    });

    it('returns cached _dataHub if already set', async () => {
        expect.hasAssertions();

        const mockPersistence = makeDataHubPersistenceMock();
        const { hub } = await DataHubImpl.create([], { repo: 'test' }, mockPersistence);
        setDataHub(hub);

        const result = await ensureDataHub();

        expect(result).toBe(hub);
    });

    it('returns undefined when manager is null', async () => {
        expect.hasAssertions();

        // manager is null after _resetForTest
        setCurrentProjectName('test-project');

        const result = await ensureDataHub();

        expect(result).toBeUndefined();
    });

    it('returns undefined when currentProjectName is empty', async () => {
        expect.hasAssertions();

        // currentProjectName is '' after _resetForTest
        setManager(createMockGitProvider());

        const result = await ensureDataHub();

        expect(result).toBeUndefined();
    });

    it('creates DataHub on first call and caches it', async () => {
        expect.hasAssertions();

        setManager(createMockGitProvider());
        setCurrentProjectName('test-project');

        const result1 = await ensureDataHub();

        expect(result1).toBeDefined();

        // Second call should return cached value
        const result2 = await ensureDataHub();

        expect(result2).toBe(result1);
    });

    it('returns hub with empty data when provider fails gracefully', async () => {
        expect.hasAssertions();

        const mockProvider = createMockGitProvider();
        mockProvider.getRecentPipelines = vi.fn().mockRejectedValue(new Error('Network error')) as never;
        setManager(mockProvider);
        setCurrentProjectName('error-project');

        const result = await ensureDataHub();

        // Provider errors are caught by Promise.allSettled — hub created with empty data
        expect(result).toBeDefined();
        expect(result?.raw.runs).toStrictEqual([]);
    });
});

/* ── Global-hub delegation tests (0.7.9 RED) ─────────────────────────── */

describe('Global-hub delegation', () => {
    beforeEach(() => {
        _resetForTest();
        clearCache();
        vi.clearAllMocks();
    });

    it('setDataHub in session-state affects global-hub', () => {
        expect.hasAssertions();

        const hub = makeMockHub();
        setDataHub(hub);

        expect(getGlobalHub()).toBe(hub);
    });

    it('ensureDataHub delegates to global-hub', async () => {
        expect.hasAssertions();

        setManager(createMockGitProvider());
        setCurrentProjectName('test-project');

        const result = await ensureDataHub();

        expect(result).toBeDefined();
        expect(getGlobalHub()).toBe(result);
    });

    it('global-hub and session-state share same state', async () => {
        expect.hasAssertions();

        const hub = makeMockHub();
        setDataHub(hub);

        expect(getGlobalHub()).toBe(hub);

        // Reading back from session-state should return the same hub
        const { getDataHub } = await import('../../../git_triggers/session-state.js');

        expect(getDataHub()).toBe(hub);
    });
});
