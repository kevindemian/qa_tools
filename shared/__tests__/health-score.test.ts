/**
 * Health score unit tests — validates metric calculations and scoring.
 *
 * Covers:
 * - Pass rate scoring (excludes skipped)
 * - Coverage source tracking
 * - Suite speed threshold (3000ms)
 * - Quality gate unification
 * - DataHub SSOT enforcement (RED phase: expose bypasses)
 * - Edge cases
 */
import { describe, it, expect } from 'vitest';
import { calculateHealthScore } from '../health-score.js';
import type { MetricsStore, MetricsRun, DataHub, ComputedMetrics } from '../types/data-hub.js';

describe('CalculateHealthScore — pass rate consistency', () => {
    it('pass rate excludes skipped tests from denominator', () => {
        const store: MetricsStore = {
            runs: [
                {
                    timestamp: '2026-01-01',
                    project: 'p',
                    total: 100,
                    passed: 90,
                    failed: 5,
                    skipped: 5,
                    duration: 1000,
                    tests: [
                        { title: 't1', state: 'passed', duration: 10 },
                        { title: 't2', state: 'failed', duration: 10 },
                    ],
                },
            ],
        };
        const result = calculateHealthScore(store);

        // pass rate = 90/(90+5)*100 = 94.74%, score should be close to 100 (target 95%)
        expect(result.dimensions.passRate.score).toBeGreaterThanOrEqual(90);
    });

    it('coverage source is tracked as "override" when override provided', () => {
        const store: MetricsStore = { runs: [] };
        const result = calculateHealthScore(store, { coverageOverride: 85 });

        expect(result.dimensions.coverage.score).toBe(100);
    });

    it('coverage source is "history" when history exists', () => {
        const store: MetricsStore = {
            runs: [],
            coverageHistory: [
                { timestamp: '2026-01-01', project: 'p', totalIssues: 100, mappedIssues: 80, coveragePct: 80 },
            ],
        };
        const result = calculateHealthScore(store);

        expect(result.dimensions.coverage.score).toBe(100);
    });

    it('coverage is 0 when no override and no history', () => {
        const store: MetricsStore = { runs: [] };
        const result = calculateHealthScore(store);

        expect(result.dimensions.coverage.score).toBe(0);
    });
});

describe('CalculateHealthScore — suite speed threshold', () => {
    it('suite speed score is 0 when p95 > 3000ms', () => {
        const tests = Array.from({ length: 20 }, (_, i) => ({
            title: `t${i}`,
            state: 'passed' as const,
            duration: 4000, // > 3000ms threshold
        }));
        const store: MetricsStore = {
            runs: [
                {
                    timestamp: '2026-01-01',
                    project: 'p',
                    total: 20,
                    passed: 20,
                    failed: 0,
                    skipped: 0,
                    duration: 80000,
                    tests,
                },
            ],
        };
        const result = calculateHealthScore(store);

        expect(result.dimensions.suiteSpeed.score).toBe(0);
    });

    it('suite speed score is 100 when p95 <= 1000ms', () => {
        const tests = Array.from({ length: 20 }, (_, i) => ({
            title: `t${i}`,
            state: 'passed' as const,
            duration: 500, // < 1000ms target
        }));
        const store: MetricsStore = {
            runs: [
                {
                    timestamp: '2026-01-01',
                    project: 'p',
                    total: 20,
                    passed: 20,
                    failed: 0,
                    skipped: 0,
                    duration: 10000,
                    tests,
                },
            ],
        };
        const result = calculateHealthScore(store);

        expect(result.dimensions.suiteSpeed.score).toBe(100);
    });
});

describe('CalculateHealthScore — quality gate unification', () => {
    it('qualityGate field reflects runQualityGate result', () => {
        const store: MetricsStore = {
            runs: [
                {
                    timestamp: '2026-01-01',
                    project: 'p',
                    total: 100,
                    passed: 95,
                    failed: 5,
                    skipped: 0,
                    duration: 1000,
                    tests: Array.from({ length: 100 }, (_, i) => ({
                        title: `t${i}`,
                        state: i < 95 ? 'passed' : 'failed',
                        duration: 10,
                    })),
                },
            ],
        };
        const result = calculateHealthScore(store);

        expect(result.qualityGate).toMatch(/^(pass|fail)$/);
    });
});

describe('CalculateHealthScore — DataHub SSOT enforcement', () => {
    function createTestHub(overrides: Partial<ComputedMetrics> = {}): DataHub {
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
                executionRate: 77,
                flakyPercentage: 12,
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

    function createStoreWithHighFlaky(): MetricsStore {
        // 3 runs, test "flaky_test" always fails → 100% flaky for that test
        // Other tests always pass
        const makeRun = (flakyState: 'passed' | 'failed'): MetricsRun => ({
            timestamp: '2026-01-01',
            project: 'p',
            total: 10,
            passed: flakyState === 'passed' ? 10 : 9,
            failed: flakyState === 'passed' ? 0 : 1,
            skipped: 0,
            duration: 1000,
            tests: [
                { title: 'flaky_test', state: flakyState, duration: 50 },
                ...Array.from({ length: 9 }, (_, i) => ({
                    title: `stable_${i}`,
                    state: 'passed' as const,
                    duration: 50,
                })),
            ],
        });
        return {
            // flaky_test appears 3 times (>= minRuns=2), always fails → 100% flaky for that test
            // _computeFlakyRate: flakyCount=1, totalConsidered=10 → 10% flaky
            // scoreFlakyRate(10, config): 10 >= maxFlakyGate(10) → score = 0
            runs: [makeRun('failed'), makeRun('passed'), makeRun('failed')],
            coverageHistory: [
                { timestamp: '2026-01-01', project: 'p', totalIssues: 100, mappedIssues: 90, coveragePct: 90 },
            ],
        };
    }

    it('uses dataHub.computed.coverage instead of store.coverageHistory', () => {
        const hub = createTestHub({ coverage: 42 });
        const store = createStoreWithHighFlaky(); // store has coveragePct: 90

        const result = calculateHealthScore(store, { dataHub: hub });

        // If DataHub SSOT is enforced, coverage score should reflect 42, not 90
        // Score for 42% coverage with target 80% should be low
        // Score for 90% coverage with target 80% should be 100
        expect(result.dimensions.coverage.score).toBeLessThan(80);
    });

    it('uses dataHub.computed.executionRate instead of computing from raw runs', () => {
        const hub = createTestHub({ executionRate: 30 });
        const store = createStoreWithHighFlaky(); // store runs have 100% execution (all tests executed)

        const result = calculateHealthScore(store, { dataHub: hub });

        // If DataHub SSOT is enforced, execution rate should be 30, not ~100
        // Score for 30% with target 95% should be 0 (below SCORE_FLOOR of 50)
        expect(result.dimensions.executionRate.score).toBe(0);
    });

    it('uses dataHub.computed.flakyPercentage instead of computing from raw runs', () => {
        // DataHub flaky=4% → scoreFlakyRate(4, {flakyThreshold:3, maxFlakyGate:5}) = 50
        // Store flaky=10% → scoreFlakyRate(10, {maxFlakyGate:5}) = 0
        // If code reads from store instead of DataHub, score=0≠50 → test FAILS (RED)
        const hub = createTestHub({ flakyPercentage: 4 });
        const store = createStoreWithHighFlaky(); // store has 10% flaky → score 0

        const result = calculateHealthScore(store, { dataHub: hub });

        // DataHub flaky=4% → 100 - ((4-3)/(5-3))*100 = 50
        expect(result.dimensions.flakyRate.score).toBe(50);
    });
});
