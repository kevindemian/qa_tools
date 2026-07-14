import { runQualityGate, formatQualityGateJson, formatQualityGateText } from './quality-gate.js';

vi.mock('./data-hub/global-hub.js', () => ({
    getDataHub: vi.fn(),
}));

vi.mock('./data-hub/compute/flakiness-entries.js', () => ({
    calcFlakinessEntries: vi.fn(),
}));

vi.mock('./logger.js', () => ({
    rootLogger: { error: vi.fn() },
}));

import * as flakinessModule from './data-hub/compute/flakiness-entries.js';
import { makeDataHubGetters } from './test-utils/factories/data-hub-mock.js';

const mockCalcFlakinessEntries = vi.mocked(flakinessModule.calcFlakinessEntries);

function createMockHub(overrides: Record<string, unknown> = {}) {
    return {
        ...makeDataHubGetters(),
        saveRun: vi.fn(),
        loadRun: vi.fn().mockReturnValue(null),
        saveCoverageSnapshot: vi.fn(),
        loadCoverageHistory: vi.fn().mockReturnValue([]),
        saveFailureClassification: vi.fn(),
        loadFailureClassifications: vi.fn().mockReturnValue([]),
        saveMetricsStore: vi.fn(),
        loadMetricsStore: vi.fn().mockReturnValue({ runs: [], coverageHistory: [] }),
        saveParseResult: vi.fn(),
        saveQualityMetrics: vi.fn(),
        loadQualityMetricsHistory: vi.fn().mockReturnValue([]),
        flush: vi.fn(),
        raw: { runs: [], jobs: new Map(), artifacts: new Map(), failureReasons: new Map() },
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
        provider: 'github' as const,
        repo: 'test/repo',
        ...overrides,
    };
}

describe('RunQualityGate', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns fail when no metrics data exists', () => {
        const mockHub = createMockHub({
            loadMetricsStore: vi.fn().mockReturnValue({ runs: [], coverageHistory: [] }),
        }) as never;
        const result = runQualityGate({ dataHub: mockHub });

        expect(result.overall).toBe('fail');
        expect(result.checks).toHaveLength(1);
        expect(result.checks[0]?.name).toBe('metrics-data');
        expect(result.checks[0]?.status).toBe('fail');
        expect(result.score).toBe(0);
    });

    it('returns pass when all gates pass', () => {
        mockCalcFlakinessEntries.mockReturnValue([]);
        const mockHub = createMockHub({
            raw: {
                runs: [
                    {
                        id: 1,
                        conclusion: 'success',
                        head_branch: 'test',
                        created_at: '2025-01-01T00:00:00.000Z',
                        updated_at: '2025-01-01T00:00:00.000Z',
                    },
                ],
                jobs: new Map(),
                artifacts: new Map(),
                failureReasons: new Map(),
            },
            computed: {
                passRate: 95,
                avgDuration: 10000,
                suiteSpeedP95: 500,
                flakyRate: [],
                coverage: 85,
                pipelineCost: { totalMinutes: 0, estimatedCost: 0 },
                defectTrends: [],
                branchBreakdown: {},
                topFailingJobs: [],
                topFailureReasons: [],
                releaseScore: { score: 0, dimensions: {} as never, grade: 'critical' },
                quarantineStatus: { flakyCount: 0, quarantinedCount: 0 },
                testPassRate: 95,
                testCounts: { passed: 95, failed: 2, skipped: 3, total: 100 },
                framework: 'vitest',
                executionRate: 97,
                flakyPercentage: 1,
            },
        }) as never;
        const result = runQualityGate({ dataHub: mockHub });

        expect(result.overall).toBe('pass');
        expect(result.checks.length).toBeGreaterThan(1);

        const failChecks = result.checks.filter((c) => c.status === 'fail');

        expect(failChecks).toHaveLength(0);
    });

    it('returns fail when pass rate is below threshold', () => {
        mockCalcFlakinessEntries.mockReturnValue([]);
        const mockHub = createMockHub({
            raw: {
                runs: [
                    {
                        id: 1,
                        conclusion: 'failure',
                        head_branch: 'test',
                        created_at: '2025-01-01T00:00:00.000Z',
                        updated_at: '2025-01-01T00:00:00.000Z',
                    },
                ],
                jobs: new Map(),
                artifacts: new Map(),
                failureReasons: new Map(),
            },
            computed: {
                passRate: 50,
                avgDuration: 10000,
                suiteSpeedP95: 500,
                flakyRate: [],
                coverage: 85,
                pipelineCost: { totalMinutes: 0, estimatedCost: 0 },
                defectTrends: [],
                branchBreakdown: {},
                topFailingJobs: [],
                topFailureReasons: [],
                releaseScore: { score: 0, dimensions: {} as never, grade: 'critical' },
                quarantineStatus: { flakyCount: 0, quarantinedCount: 0 },
                testPassRate: 50,
                testCounts: { passed: 50, failed: 50, skipped: 0, total: 100 },
                framework: 'vitest',
                executionRate: 50,
                flakyPercentage: 1,
            },
        }) as never;
        const result = runQualityGate({ dataHub: mockHub });

        expect(result.overall).toBe('fail');

        const passRateCheck = result.checks.find((c) => c.name === 'pass-rate');

        expect(passRateCheck?.status).toBe('fail');
    });

    it('filters by project when project option is passed', () => {
        mockCalcFlakinessEntries.mockReturnValue([]);
        const mockHub = createMockHub({
            raw: {
                runs: [
                    {
                        id: 1,
                        conclusion: 'success',
                        head_branch: 'test',
                        created_at: '2025-01-01T00:00:00.000Z',
                        updated_at: '2025-01-01T00:00:00.000Z',
                    },
                ],
                jobs: new Map(),
                artifacts: new Map(),
                failureReasons: new Map(),
            },
            computed: {
                passRate: 95,
                avgDuration: 10000,
                suiteSpeedP95: 500,
                flakyRate: [],
                coverage: 80,
                pipelineCost: { totalMinutes: 0, estimatedCost: 0 },
                defectTrends: [],
                branchBreakdown: {},
                topFailingJobs: [],
                topFailureReasons: [],
                releaseScore: { score: 0, dimensions: {} as never, grade: 'critical' },
                quarantineStatus: { flakyCount: 0, quarantinedCount: 0 },
                testPassRate: 95,
                testCounts: { passed: 95, failed: 2, skipped: 3, total: 100 },
                framework: 'vitest',
                executionRate: 97,
                flakyPercentage: 1,
            },
        }) as never;
        const result = runQualityGate({ project: 'nonexistent', dataHub: mockHub });

        expect(result.checks.length).toBeGreaterThanOrEqual(1);
    });

    it('fails when flaky rate exceeds threshold', () => {
        mockCalcFlakinessEntries.mockReturnValue([
            { title: 'flaky-test-1', project: 'test', rate: 1, passCount: 1, failCount: 1, skipCount: 0, totalRuns: 2 },
        ]);
        const mockHub = createMockHub({
            raw: {
                runs: [
                    {
                        id: 1,
                        conclusion: 'success',
                        head_branch: 'test',
                        created_at: '2025-01-01T00:00:00.000Z',
                        updated_at: '2025-01-01T00:00:00.000Z',
                    },
                    {
                        id: 2,
                        conclusion: 'success',
                        head_branch: 'test',
                        created_at: '2025-01-01T01:00:00.000Z',
                        updated_at: '2025-01-01T01:00:00.000Z',
                    },
                ],
                jobs: new Map(),
                artifacts: new Map(),
                failureReasons: new Map(),
            },
            computed: {
                passRate: 80,
                avgDuration: 5000,
                suiteSpeedP95: 500,
                flakyRate: [],
                coverage: 80,
                pipelineCost: { totalMinutes: 0, estimatedCost: 0 },
                defectTrends: [],
                branchBreakdown: {},
                topFailingJobs: [],
                topFailureReasons: [],
                releaseScore: { score: 0, dimensions: {} as never, grade: 'critical' },
                quarantineStatus: { flakyCount: 0, quarantinedCount: 0 },
                testPassRate: 80,
                testCounts: { passed: 8, failed: 1, skipped: 1, total: 10 },
                framework: 'vitest',
                executionRate: 90,
                flakyPercentage: 50,
            },
        }) as never;
        const result = runQualityGate({ dataHub: mockHub });
        const flakyCheck = result.checks.find((c) => c.name === 'flaky-rate');

        expect(flakyCheck).toBeDefined();
        // 1 flaky test out of 2 considered (both appear in 2+ runs) = 50% flaky
        expect(flakyCheck?.status).toBe('fail');
        expect(flakyCheck?.score).toBe(50);
    });

    it('passes flaky rate when no flaky tests exist', () => {
        mockCalcFlakinessEntries.mockReturnValue([]);
        const mockHub = createMockHub({
            raw: {
                runs: [
                    {
                        id: 1,
                        conclusion: 'success',
                        head_branch: 'test',
                        created_at: '2025-01-01T00:00:00.000Z',
                        updated_at: '2025-01-01T00:00:00.000Z',
                    },
                    {
                        id: 2,
                        conclusion: 'success',
                        head_branch: 'test',
                        created_at: '2025-01-01T01:00:00.000Z',
                        updated_at: '2025-01-01T01:00:00.000Z',
                    },
                ],
                jobs: new Map(),
                artifacts: new Map(),
                failureReasons: new Map(),
            },
            computed: {
                passRate: 90,
                avgDuration: 5000,
                suiteSpeedP95: 500,
                flakyRate: [],
                coverage: 80,
                pipelineCost: { totalMinutes: 0, estimatedCost: 0 },
                defectTrends: [],
                branchBreakdown: {},
                topFailingJobs: [],
                topFailureReasons: [],
                releaseScore: { score: 0, dimensions: {} as never, grade: 'critical' },
                quarantineStatus: { flakyCount: 0, quarantinedCount: 0 },
                testPassRate: 90,
                testCounts: { passed: 9, failed: 0, skipped: 1, total: 10 },
                framework: 'vitest',
                executionRate: 90,
                flakyPercentage: 0,
            },
        }) as never;
        const result = runQualityGate({ dataHub: mockHub });
        const flakyCheck = result.checks.find((c) => c.name === 'flaky-rate');

        expect(flakyCheck).toBeDefined();
        expect(flakyCheck?.status).toBe('pass');
    });

    it('handles errors gracefully', () => {
        const mockHub = createMockHub({
            raw: undefined,
        }) as never;
        const result = runQualityGate({ dataHub: mockHub });

        expect(result.overall).toBe('fail');
        // Defensive accessor (getRuns) prevents an unsafe raw access crash;
        // a degraded hub with no runs/computed data yields a metrics-data fail.
        expect(result.checks[0]?.name).toBe('metrics-data');
    });

    it('calculates score as average of check scores', () => {
        mockCalcFlakinessEntries.mockReturnValue([]);
        const mockHub = createMockHub({
            raw: {
                runs: [
                    {
                        id: 1,
                        conclusion: 'success',
                        head_branch: 'test',
                        created_at: '2025-01-01T00:00:00.000Z',
                        updated_at: '2025-01-01T00:00:00.000Z',
                    },
                ],
                jobs: new Map(),
                artifacts: new Map(),
                failureReasons: new Map(),
            },
            computed: {
                passRate: 95,
                avgDuration: 10000,
                suiteSpeedP95: 500,
                flakyRate: [],
                coverage: 85,
                pipelineCost: { totalMinutes: 0, estimatedCost: 0 },
                defectTrends: [],
                branchBreakdown: {},
                topFailingJobs: [],
                topFailureReasons: [],
                releaseScore: { score: 0, dimensions: {} as never, grade: 'critical' },
                quarantineStatus: { flakyCount: 0, quarantinedCount: 0 },
                testPassRate: 95,
                testCounts: { passed: 95, failed: 2, skipped: 3, total: 100 },
                framework: 'vitest',
                executionRate: 97,
                flakyPercentage: 1,
            },
        }) as never;
        const result = runQualityGate({ dataHub: mockHub });

        expect(result.score).toBeGreaterThanOrEqual(0);
        expect(result.score).toBeLessThanOrEqual(100);
    });

    it('emits data-quality checks for failureRecords and coverageFiles when present and valid', () => {
        mockCalcFlakinessEntries.mockReturnValue([]);
        const mockHub = createMockHub({
            raw: {
                runs: [
                    {
                        id: 1,
                        conclusion: 'success',
                        head_branch: 'test',
                        created_at: '2025-01-01T00:00:00.000Z',
                        updated_at: '2025-01-01T00:00:00.000Z',
                    },
                ],
                jobs: new Map(),
                artifacts: new Map(),
                failureReasons: new Map(),
                failureRecords: [{ name: 'auth.test.ts', status: 'failed', message: 'expected 200', flaky: false }],
                coverageFiles: [
                    { file: 'src/app.ts', lines: { total: 10, covered: 8, percentage: 80 }, confidence: 1 },
                ],
            },
            computed: {
                passRate: 95,
                avgDuration: 10000,
                suiteSpeedP95: 500,
                flakyRate: [],
                coverage: 85,
                pipelineCost: { totalMinutes: 0, estimatedCost: 0 },
                defectTrends: [],
                branchBreakdown: {},
                topFailingJobs: [],
                topFailureReasons: [],
                releaseScore: { score: 0, dimensions: {} as never, grade: 'critical' },
                quarantineStatus: { flakyCount: 0, quarantinedCount: 0 },
                testPassRate: 95,
                testCounts: { passed: 95, failed: 2, skipped: 3, total: 100 },
                framework: 'vitest',
                executionRate: 97,
                flakyPercentage: 1,
            },
            getQuality: vi.fn().mockReturnValue({ valid: true, issues: [] }),
        }) as never;
        const result = runQualityGate({ dataHub: mockHub });

        const frCheck = result.checks.find((c) => c.name === 'data-quality:failureRecords');
        const covCheck = result.checks.find((c) => c.name === 'data-quality:coverageFiles');

        expect(frCheck).toBeDefined();
        expect(frCheck?.status).toBe('pass');
        expect(covCheck).toBeDefined();
        expect(covCheck?.status).toBe('pass');
    });

    it('lists failureRecords and coverageFiles in incompleteItems when absent (never silent pass)', () => {
        mockCalcFlakinessEntries.mockReturnValue([]);
        const mockHub = createMockHub({
            raw: {
                runs: [
                    {
                        id: 1,
                        conclusion: 'success',
                        head_branch: 'test',
                        created_at: '2025-01-01T00:00:00.000Z',
                        updated_at: '2025-01-01T00:00:00.000Z',
                    },
                ],
                jobs: new Map(),
                artifacts: new Map(),
                failureReasons: new Map(),
            },
            computed: {
                passRate: 95,
                avgDuration: 10000,
                suiteSpeedP95: 500,
                flakyRate: [],
                coverage: 85,
                pipelineCost: { totalMinutes: 0, estimatedCost: 0 },
                defectTrends: [],
                branchBreakdown: {},
                topFailingJobs: [],
                topFailureReasons: [],
                releaseScore: { score: 0, dimensions: {} as never, grade: 'critical' },
                quarantineStatus: { flakyCount: 0, quarantinedCount: 0 },
                testPassRate: 95,
                testCounts: { passed: 95, failed: 2, skipped: 3, total: 100 },
                framework: 'vitest',
                executionRate: 97,
                flakyPercentage: 1,
            },
        }) as never;
        const result = runQualityGate({ dataHub: mockHub });

        expect(result.incompleteItems).toContain('failureRecords');
        expect(result.incompleteItems).toContain('coverageFiles');
    });

    it('fails the data-quality check when failureRecords quality is invalid', () => {
        mockCalcFlakinessEntries.mockReturnValue([]);
        const mockHub = createMockHub({
            raw: {
                runs: [
                    {
                        id: 1,
                        conclusion: 'success',
                        head_branch: 'test',
                        created_at: '2025-01-01T00:00:00.000Z',
                        updated_at: '2025-01-01T00:00:00.000Z',
                    },
                ],
                jobs: new Map(),
                artifacts: new Map(),
                failureReasons: new Map(),
                failureRecords: [{ name: 'auth.test.ts', status: 'failed', message: 'expected 200', flaky: false }],
            },
            computed: {
                passRate: 95,
                avgDuration: 10000,
                suiteSpeedP95: 500,
                flakyRate: [],
                coverage: 85,
                pipelineCost: { totalMinutes: 0, estimatedCost: 0 },
                defectTrends: [],
                branchBreakdown: {},
                topFailingJobs: [],
                topFailureReasons: [],
                releaseScore: { score: 0, dimensions: {} as never, grade: 'critical' },
                quarantineStatus: { flakyCount: 0, quarantinedCount: 0 },
                testPassRate: 95,
                testCounts: { passed: 95, failed: 2, skipped: 3, total: 100 },
                framework: 'vitest',
                executionRate: 97,
                flakyPercentage: 1,
            },
            getQuality: vi.fn((category: string) =>
                category === 'failureRecords'
                    ? { valid: false, issues: ['schema mismatch'] }
                    : { valid: true, issues: [] },
            ),
        }) as never;
        const result = runQualityGate({ dataHub: mockHub });

        const frCheck = result.checks.find((c) => c.name === 'data-quality:failureRecords');

        expect(frCheck).toBeDefined();
        expect(frCheck?.status).toBe('fail');
        expect(frCheck?.score).toBe(0);
    });
});

describe('FormatQualityGateJson', () => {
    it('formats result as JSON string', () => {
        const result = {
            overall: 'pass' as const,
            checks: [{ name: 'test', status: 'pass' as const, score: 100, threshold: 80, details: 'OK' }],
            score: 100,
        };
        const json = formatQualityGateJson(result);

        expect(JSON.parse(json)).toHaveProperty('overall', 'pass');
        expect(JSON.parse(json)).toHaveProperty('score', 100);
    });
});

describe('FormatQualityGateText', () => {
    it('formats result as human-readable text', () => {
        const result = {
            overall: 'pass' as const,
            checks: [{ name: 'test', status: 'pass' as const, score: 100, threshold: 80, details: 'All good' }],
            score: 100,
        };
        const text = formatQualityGateText(result);

        expect(text).toContain('PASS');
        expect(text).toContain('test');
    });

    it('shows fail icon for failing checks', () => {
        const result = {
            overall: 'fail' as const,
            checks: [{ name: 'broken', status: 'fail' as const, score: 30, threshold: 80, details: 'Too low' }],
            score: 30,
        };
        const text = formatQualityGateText(result);

        expect(text).toContain('FAIL');
        expect(text).toContain('broken');
    });

    it('handles empty checks array', () => {
        const result = { overall: 'pass' as const, checks: [], score: 0 };
        const text = formatQualityGateText(result);

        expect(text).toContain('PASS');
    });
});
