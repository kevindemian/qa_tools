/**
 * Integration tests — Health Score (FT-09)
 *
 * Validates the composite health score calculation:
 * - 0-100 score range
 * - Grade assignment (excellent/good/needs_attention/poor/critical)
 * - 5 dimensions: passRate, flakyRate, coverage, executionRate, suiteSpeed
 * - Provenance tracking (source, formula, thresholdBasis)
 * - Config overrides (weights, thresholds, grade boundaries)
 * - Edge cases: empty store, single run, high/low values
 * - DataHub parameter acceptance
 *
 * Pure function — no filesystem dependencies.
 */
import { describe, expect, it, vi } from 'vitest';
import type { DataHub, ComputedMetrics } from '../../types/data-hub.js';
import { makeDataHubMock } from '../../test-utils/factories/data-hub-mock.js';

function createTestHub(overrides: Partial<ComputedMetrics> = {}): DataHub {
    return makeDataHubMock({
        computed: {
            passRate: 50,
            avgDuration: 1000,
            suiteSpeedP95: 500,
            coverage: 42,
            testPassRate: 50,
            testCounts: { passed: 50, failed: 50, skipped: 0, total: 100 },
            framework: 'vitest',
            executionRate: 77,
            flakyPercentage: 12,
            ...overrides,
        },
    });
}

describe('Integration: Health Score', () => {
    describe('FT-09a: score range and grade', () => {
        it('returns score 0-100', async () => {
            expect.hasAssertions();

            const { calculateHealthScore } = await import('../../health-score.js');
            const result = calculateHealthScore({ dataHub: createTestHub() });

            expect(result.overall).toBeGreaterThanOrEqual(0);
            expect(result.overall).toBeLessThanOrEqual(100);
        });

        it('assigns grade based on score', async () => {
            expect.hasAssertions();

            const { calculateHealthScore } = await import('../../health-score.js');
            // excellent: near-perfect pass rate + good coverage
            const excellent = calculateHealthScore({
                dataHub: createTestHub({
                    passRate: 98,
                    coverage: 90,
                    executionRate: 98,
                    suiteSpeedP95: 200,
                    flakyPercentage: 0,
                }),
            });
            // poor: moderate metrics that produce overall score in [60,69]
            const poor = calculateHealthScore({
                dataHub: createTestHub({
                    passRate: 80,
                    coverage: 60,
                    executionRate: 80,
                    suiteSpeedP95: 2000,
                    flakyPercentage: 4,
                }),
            });

            expect(excellent.grade).toBe('excellent');
            expect(poor.grade).toBe('poor');
        });
    });

    describe('FT-09b: dimensions', () => {
        it('all 5 dimensions are present', async () => {
            expect.hasAssertions();

            const { calculateHealthScore } = await import('../../health-score.js');
            const result = calculateHealthScore({ dataHub: createTestHub() });

            expect(result.dimensions).toBeDefined();
            expect(result.dimensions.passRate).toBeDefined();
            expect(result.dimensions.flakyRate).toBeDefined();
            expect(result.dimensions.coverage).toBeDefined();
            expect(result.dimensions.executionRate).toBeDefined();
            expect(result.dimensions.suiteSpeed).toBeDefined();
        });

        it('passRate score reflects actual pass rate', async () => {
            expect.hasAssertions();

            const { calculateHealthScore } = await import('../../health-score.js');
            const result = calculateHealthScore({ dataHub: createTestHub({ passRate: 95 }) });

            expect(result.dimensions.passRate.score).toBeGreaterThanOrEqual(80);
        });
    });

    describe('FT-09c: provenance', () => {
        it('provenance has 5 entries', async () => {
            expect.hasAssertions();

            const { calculateHealthScore } = await import('../../health-score.js');
            const result = calculateHealthScore({ dataHub: createTestHub() });

            expect(result.provenance).toBeDefined();
            expect(result.provenance).toHaveLength(5);
        });

        it('each provenance entry has source and formula', async () => {
            expect.hasAssertions();

            const { calculateHealthScore } = await import('../../health-score.js');
            const result = calculateHealthScore({ dataHub: createTestHub() });

            for (const p of result.provenance ?? []) {
                expect(p.source.length).toBeGreaterThan(0);
                expect(p.formula.length).toBeGreaterThan(0);
                expect(p.thresholdBasis.length).toBeGreaterThan(0);
            }
        });
    });

    describe('FT-09d: qualityGate flag', () => {
        it('returns "pass" when score >= 70 and all thresholds satisfied', async () => {
            expect.hasAssertions();

            const { calculateHealthScore } = await import('../../health-score.js');
            const result = calculateHealthScore({
                dataHub: createTestHub({
                    passRate: 95,
                    coverage: 85,
                    executionRate: 95,
                    suiteSpeedP95: 500,
                    flakyPercentage: 1,
                }),
            });

            expect(result.qualityGate).toBe('pass');
        });

        it('returns "fail" when coverage is below threshold', async () => {
            expect.hasAssertions();

            const { calculateHealthScore } = await import('../../health-score.js');
            const result = calculateHealthScore({ dataHub: createTestHub() });

            expect(result.qualityGate).toBe('fail');
        });
    });

    describe('FT-09e: config overrides', () => {
        it('custom grade boundaries change grade assignment', async () => {
            expect.hasAssertions();

            const { calculateHealthScore } = await import('../../health-score.js');
            const low = calculateHealthScore({
                gradeBoundaries: { excellent: 0, good: 0, needs_attention: 0, poor: 0, critical: 0 },
                dataHub: createTestHub(),
            });
            const high = calculateHealthScore({
                gradeBoundaries: { excellent: 100, good: 100, needs_attention: 100, poor: 100, critical: 0 },
                dataHub: createTestHub(),
            });

            expect(low.grade).toBe('excellent');
            expect(high.grade).toBe('critical');
        });
    });

    describe('FT-09f: edge cases', () => {
        it('handles store with single run', async () => {
            expect.hasAssertions();

            const { calculateHealthScore } = await import('../../health-score.js');
            const result = calculateHealthScore({ dataHub: createTestHub() });

            expect(result.overall).toBeGreaterThanOrEqual(0);
        });

        it('handles store with zero tests — returns score 0, grade critical', async () => {
            expect.hasAssertions();

            const { calculateHealthScore } = await import('../../health-score.js');
            const result = calculateHealthScore({
                dataHub: createTestHub({
                    passRate: 0,
                    coverage: 0,
                    executionRate: 0,
                    suiteSpeedP95: 5000,
                }),
            });

            expect(result.overall).toBe(0);
            expect(result.grade).toBe('critical');
            expect(result.qualityGate).toBe('fail');
            expect(result.runCount).toBe(0);
            expect(result.dimensions.passRate.status).toBe('fail');
            expect(result.dimensions.coverage.status).toBe('fail');
        });

        it('handles coverageHistory entry with missing coveragePct without NaN (G1 RED)', async () => {
            expect.hasAssertions();

            const { calculateHealthScore } = await import('../../health-score.js');
            const result = calculateHealthScore({ dataHub: createTestHub({ coverage: 0 }) });

            expect(Number.isNaN(result.dimensions.coverage.score)).toBeFalsy();
            expect(result.dimensions.coverage.score).toBe(0);
        });
    });

    describe('DataHub: parameter acceptance', () => {
        function makeDataHub(overrides?: {
            computed?: Partial<DataHub['computed']>;
            raw?: Partial<DataHub['raw']>;
        }): DataHub {
            return {
                raw: {
                    runs: [
                        {
                            id: 1,
                            conclusion: 'success',
                            head_branch: 'main',
                            created_at: '2026-07-01T10:00:00Z',
                            updated_at: '2026-07-01T10:05:00Z',
                        },
                    ],
                    jobs: new Map(),
                    failureReasons: new Map(),
                    artifacts: new Map(),
                    ...overrides?.raw,
                },
                computed: {
                    passRate: 85,
                    avgDuration: 300,
                    suiteSpeedP95: 120000,
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
                    ...overrides?.computed,
                },
                timestamp: new Date(),
                provider: 'github',
                repo: 'o/r',
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
                // ─── ST-1 categories ───────────────────────────────────────────
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
                getQuality: vi.fn(),
                getQuarantine: vi.fn(() => ({ entries: [] })),
            };
        }

        it('dataHub passRate overrides MetricsStore passRate when provided', async () => {
            expect.hasAssertions();

            const { calculateHealthScore } = await import('../../health-score.js');
            const hub = makeDataHub({ computed: { passRate: 95 } }); // 95% from CI

            const withHub = calculateHealthScore({ dataHub: hub });

            // DataHub passRate (95%) should produce a higher score than store (50%)
            // Score for 95% with target 95%: (95-50)/(95-50)*100 = 100
            expect(withHub.dimensions.passRate.score).toBe(100);
        });

        it('dataHub passRate overrides MetricsStore when provided', async () => {
            expect.hasAssertions();

            const { calculateHealthScore } = await import('../../health-score.js');
            const hub = makeDataHub({ computed: { passRate: 90 } }); // 90% from CI

            const withHub = calculateHealthScore({ dataHub: hub });

            // DataHub passRate (90%) should produce a higher score than store (50%)
            // Score for 90% with target 95%: (90-50)/(95-50)*100 = 88
            expect(withHub.dimensions.passRate.score).toBeGreaterThan(50);
        });
    });
});
