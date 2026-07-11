import type { DataHub, ComputedMetrics } from '../types/data-hub.js';

/**
 * Reusable DataHub test double. Defaults to a healthy-ish hub; override
 * any ComputedMetrics field via `overrides`. Persistence methods are mocks.
 */
export function createTestHub(overrides: Partial<ComputedMetrics> = {}): DataHub {
    return {
        raw: { runs: [], jobs: new Map(), artifacts: new Map(), failureReasons: new Map() },
        computed: {
            passRate: 50,
            avgDuration: 1000,
            suiteSpeedP95: 500,
            flakyRate: [],
            coverage: 42,
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
            ...overrides,
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
        saveParseResult: () => ({
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
        loadQualityMetricsHistory: () => [],
    };
}
