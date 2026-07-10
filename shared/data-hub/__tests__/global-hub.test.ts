import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { DataHub } from '../../types/data-hub.js';
import { getDataHub, setDataHub, ensureDataHub } from '../global-hub.js';

function makeMockHub(overrides: Partial<DataHub> = {}): DataHub {
    return {
        raw: { runs: [], jobs: new Map(), artifacts: new Map(), failureReasons: new Map() },
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
        ...overrides,
    };
}

describe('GlobalHub', () => {
    beforeEach(() => {
        setDataHub(undefined);
    });

    it('getDataHub throws when not initialized', () => {
        expect(() => getDataHub()).toThrow('DataHub not initialized');
    });

    it('setDataHub stores hub', () => {
        const mockHub = makeMockHub();
        setDataHub(mockHub);

        expect(getDataHub()).toBe(mockHub);
    });

    it('setDataHub(undefined) clears hub', () => {
        const mockHub = makeMockHub();
        setDataHub(mockHub);
        setDataHub(undefined);

        expect(() => getDataHub()).toThrow('DataHub not initialized');
    });

    it('ensureDataHub calls fetchFn when no hub exists', async () => {
        expect.hasAssertions();

        const mockHub = makeMockHub();
        const fetchFn = vi.fn().mockResolvedValue(mockHub);
        const result = await ensureDataHub(fetchFn);

        expect(fetchFn).toHaveBeenCalledTimes(1);
        expect(result).toBe(mockHub);
    });

    it('ensureDataHub returns cached hub without calling fetchFn', async () => {
        expect.hasAssertions();

        const mockHub = makeMockHub({ timestamp: new Date() });
        setDataHub(mockHub);
        const fetchFn = vi.fn();
        const result = await ensureDataHub(fetchFn);

        expect(fetchFn).not.toHaveBeenCalled();
        expect(result).toBe(mockHub);
    });

    it('ensureDataHub throws when fetchFn fails', async () => {
        expect.hasAssertions();

        const fetchFn = vi.fn().mockRejectedValue(new Error('network error'));

        await expect(ensureDataHub(fetchFn)).rejects.toThrow('network error');
    });

    it('ensureDataHub stores hub when fetchFn succeeds', async () => {
        expect.hasAssertions();

        const mockHub = makeMockHub();
        const fetchFn = vi.fn().mockResolvedValue(mockHub);
        await ensureDataHub(fetchFn);

        expect(getDataHub()).toBe(mockHub);
    });
});

describe('EnsureDataHub with freshness check', () => {
    beforeEach(() => {
        setDataHub(undefined);
    });

    it('re-fetches when data changed', async () => {
        expect.hasAssertions();

        const oldTimestamp = new Date(Date.now() - 10 * 60 * 1000);
        const hubV1 = makeMockHub({ timestamp: oldTimestamp });
        const hubV2 = makeMockHub({ timestamp: new Date() });
        setDataHub(hubV1);
        const fetchFn = vi.fn().mockResolvedValue(hubV2);
        const hasDataChanged = vi.fn().mockReturnValue(true);
        const result = await ensureDataHub(fetchFn, {
            hasDataChanged,
            cachedHub: hubV1,
            maxStalenessMs: 5 * 60 * 1000,
        });

        expect(hasDataChanged).toHaveBeenCalledWith(hubV1, hubV2.raw);
        expect(fetchFn).toHaveBeenCalledTimes(1);
        expect(result).toBe(hubV2);
    });

    it('does not re-fetch when data unchanged', async () => {
        expect.hasAssertions();

        const oldTimestamp = new Date(Date.now() - 10 * 60 * 1000);
        const hubV1 = makeMockHub({ timestamp: oldTimestamp });
        setDataHub(hubV1);
        const hubV2 = makeMockHub({ timestamp: new Date() });
        const fetchFn = vi.fn().mockResolvedValue(hubV2);
        const hasDataChanged = vi.fn().mockReturnValue(false);
        const result = await ensureDataHub(fetchFn, {
            hasDataChanged,
            cachedHub: hubV1,
            maxStalenessMs: 5 * 60 * 1000,
        });

        expect(fetchFn).toHaveBeenCalledTimes(1);
        expect(result).toBe(hubV1);
    });

    it('returns stale indicator when data too old', async () => {
        expect.hasAssertions();

        const oldTimestamp = new Date(Date.now() - 10 * 60 * 1000);
        const hubV1 = makeMockHub({ timestamp: oldTimestamp });
        setDataHub(hubV1);
        const hubV2 = makeMockHub({ timestamp: new Date() });
        const fetchFn = vi.fn().mockResolvedValue(hubV2);
        const hasDataChanged = vi.fn().mockReturnValue(true);
        const result = await ensureDataHub(fetchFn, {
            hasDataChanged,
            cachedHub: hubV1,
            maxStalenessMs: 5 * 60 * 1000,
        });

        expect(fetchFn).toHaveBeenCalledTimes(1);
        expect(result).toBe(hubV2);
    });
});
