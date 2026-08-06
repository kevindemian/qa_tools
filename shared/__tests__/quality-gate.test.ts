import { runQualityGate } from '../quality/quality-gate.js';

vi.mock('../data-hub/global-hub.js', () => ({
    getDataHub: vi.fn(),
}));

vi.mock('../logger.js', () => ({
    rootLogger: { error: vi.fn() },
}));

import { makeDataHubGetters, makeDataHubMock } from '../test-utils/factories/data-hub-mock.js';

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

    it('fails explicitly with an "error" check when the gate computation throws (safety path)', () => {
        const mockHub = createMockHub({
            getRuns: vi.fn().mockImplementation(() => {
                throw new Error('metrics backend unavailable');
            }),
        }) as never;
        const result = runQualityGate({ dataHub: mockHub });

        expect(result.overall).toBe('fail');
        expect(result.score).toBe(0);
        expect(result.checks.map((c) => c.name)).toContain('error');

        const errorCheck = result.checks.find((c) => c.name === 'error');

        expect(errorCheck?.status).toBe('fail');
    });

    it('returns pass when all gates pass', () => {
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
        expect(result.checks.length).toBeGreaterThanOrEqual(1);

        const failChecks = result.checks.filter((c) => c.status === 'fail');

        expect(failChecks).toHaveLength(0);
    });

    it('returns fail when pass rate is below threshold', () => {
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

        const healthCheck = result.checks.find((c) => c.name === 'health-score');

        expect(healthCheck?.status).toBe('fail');
    });

    it('filters by project when project option is passed', () => {
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

    it('aGGRESIVE: branch scope uses the branch OWN metrics, not repo aggregate (Bug 16)', () => {
        const mockHub = createMockHub({
            raw: {
                runs: [
                    {
                        id: 1,
                        conclusion: 'success',
                        head_branch: 'feature/x',
                        created_at: '2025-01-01T00:00:00.000Z',
                        updated_at: '2025-01-01T00:00:00.000Z',
                    },
                    {
                        id: 2,
                        conclusion: 'success',
                        head_branch: 'feature/x',
                        created_at: '2025-01-01T00:00:00.000Z',
                        updated_at: '2025-01-01T00:00:00.000Z',
                    },
                    {
                        id: 3,
                        conclusion: 'failure',
                        head_branch: 'main',
                        created_at: '2025-01-01T00:00:00.000Z',
                        updated_at: '2025-01-01T00:00:00.000Z',
                    },
                ],
                jobs: new Map(),
                artifacts: new Map(),
                failureReasons: new Map(),
            },
            computed: {
                passRate: 66,
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
                testPassRate: 66,
                testCounts: { passed: 2, failed: 1, skipped: 0, total: 3 },
                framework: 'vitest',
                executionRate: 66,
                flakyPercentage: 0,
            },
        }) as never;

        const repoGate = runQualityGate({ dataHub: mockHub });
        const branchGate = runQualityGate({ project: 'feature/x', dataHub: mockHub });

        const repoHealth = repoGate.checks.find((c) => c.name === 'health-score');
        const branchHealth = branchGate.checks.find((c) => c.name === 'health-score');

        // 'feature/x' pass rate = 100% (2/2 success), repo = 66.7% → branch health
        // must be higher AND scoped to the branch (never the repo aggregate).
        expect(branchHealth).toBeDefined();
        expect(repoHealth).toBeDefined();
        expect(branchHealth?.score).toBeGreaterThan(repoHealth?.score ?? 0);
        expect(branchHealth?.score).toBeGreaterThan(0);
        expect(branchHealth?.score).toBeLessThanOrEqual(100);
        expect(repoHealth?.score).toBeLessThan(100);
        // The branch gate must NOT equal the repo gate (proves real scoping, not aggregate reuse).
        expect(branchGate.overall).not.toBe(repoGate.overall);
    });

    it('fails when flaky rate exceeds threshold', () => {
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
        const healthCheck = result.checks.find((c) => c.name === 'health-score');

        expect(healthCheck).toBeDefined();
        // 1 flaky test out of 2 considered (both appear in 2+ runs) = 50% flaky >
        // MAX_FLAKY_GATE (5%) → the strict health gate fails.
        expect(healthCheck?.status).toBe('fail');
    });

    it('passes flaky rate when no flaky tests exist', () => {
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
        const healthCheck = result.checks.find((c) => c.name === 'health-score');

        expect(healthCheck).toBeDefined();
        expect(healthCheck?.status).toBe('pass');
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

    it('emits only health-score + data-quality checks (D1: no per-dimension gate checks)', () => {
        const mockHub = makeDataHubMock({
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
                securityFindings: [{ id: 1 }],
                failureRecords: [{ name: 'auth.test.ts', status: 'failed' }],
                deployments: [{ id: 1 }],
                releases: [{ id: 1 }],
                doraMetrics: { deployFrequency: 1, leadTime: 1, changeFailureRate: 0, mtbf: 1 },
                pmIssues: [{ id: 1 }],
                coverageFiles: [{ path: 'src/a.ts' }],
                performanceMetrics: { p95: 100 },
            } as never,
            computed: {
                passRate: 95,
                coverage: 85,
                executionRate: 95,
                suiteSpeedP95: 500,
                flakyPercentage: 1,
                testPassRate: 95,
                testCounts: { passed: 95, failed: 2, skipped: 3, total: 100 },
            },
        });
        const result = runQualityGate({ dataHub: mockHub });

        const names = result.checks.map((c) => c.name);
        const dataQualityNames = names.filter((n) => n.startsWith('data-quality:'));

        expect(names).toContain('health-score');
        expect(dataQualityNames).toStrictEqual(
            expect.arrayContaining([
                'data-quality:securityFindings',
                'data-quality:failureRecords',
                'data-quality:deployments',
                'data-quality:releases',
                'data-quality:doraMetrics',
                'data-quality:pmIssues',
                'data-quality:coverageFiles',
                'data-quality:performanceMetrics',
            ]),
        );
        expect(
            names.filter((n) => n === 'pass-rate' || n === 'flaky-rate' || n === 'coverage' || n === 'suite-speed'),
        ).toHaveLength(0);
        expect(result.incompleteItems ?? []).toHaveLength(0);
    });

    it('reports N/A for unavailable dimensions in health-score details (D1 breakdown)', () => {
        const mockHub = makeDataHubMock({
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
                coverage: 85,
                executionRate: 95,
                suiteSpeedP95: 500,
                flakyPercentage: 1,
                testPassRate: 95,
                testCounts: { passed: 95, failed: 2, skipped: 3, total: 100 },
                dataAvailability: {
                    passRate: false,
                    flaky: true,
                    coverage: true,
                    executionRate: true,
                    suiteSpeed: true,
                },
            },
        });
        const result = runQualityGate({ dataHub: mockHub });
        const healthCheck = result.checks.find((c) => c.name === 'health-score');

        expect(healthCheck?.details).toContain('Pass Rate: N/A (UNKNOWN)');
        expect(healthCheck?.details).toContain('Flaky Rate:');
        expect(healthCheck?.details).toContain('Coverage:');
        expect(healthCheck?.details).toContain('Suite Speed:');
        expect(healthCheck?.details).toContain('Execution Rate:');
    });

    it('passes a valid low-confidence category with score 100 and confidence in details (F1)', () => {
        const mockHub = makeDataHubMock({
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
                coverageFiles: [{ path: 'src/a.ts' }],
            } as never,
            computed: {
                passRate: 95,
                coverage: 85,
                executionRate: 95,
                suiteSpeedP95: 500,
                flakyPercentage: 1,
                testPassRate: 95,
                testCounts: { passed: 95, failed: 2, skipped: 3, total: 100 },
            },
            quality: { coverageFiles: { valid: true, issues: [] } },
            provenance: new Map([['coverageFiles', { confidence: 0.54, source: 'manual', timestamp: '2026-01-01' }]]),
        });
        const result = runQualityGate({ dataHub: mockHub });
        const categoryCheck = result.checks.find((c) => c.name === 'data-quality:coverageFiles');

        expect(categoryCheck).toBeDefined();
        expect(categoryCheck?.status).toBe('pass');
        expect(categoryCheck?.score).toBe(100);
        expect(categoryCheck?.threshold).toBe(100);
        expect(categoryCheck?.details).toContain('confidence 54%');
    });
});
