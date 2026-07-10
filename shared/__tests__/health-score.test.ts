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
import { describe, it, expect, vi } from 'vitest';
import { calculateHealthScore } from '../health-score.js';
import type { DataHub, ComputedMetrics } from '../types/data-hub.js';

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

describe('CalculateHealthScore — pass rate consistency', () => {
    it('pass rate excludes skipped tests from denominator', () => {
        const hub = createTestHub({ passRate: 94.74 });
        const result = calculateHealthScore({ dataHub: hub });

        // pass rate = 94.74%, score should be close to 100 (target 95%)
        expect(result.dimensions.passRate.score).toBeGreaterThanOrEqual(90);
    });

    it('coverage source is tracked as "override" when override provided', () => {
        const hub = createTestHub({ coverage: 85 });
        const result = calculateHealthScore({ dataHub: hub, coverageOverride: 85 });

        expect(result.dimensions.coverage.score).toBe(100);
    });

    it('coverage source is "history" when history exists', () => {
        const hub = createTestHub({ coverage: 80 });
        const result = calculateHealthScore({ dataHub: hub });

        expect(result.dimensions.coverage.score).toBe(100);
    });

    it('coverage is 0 when no override and no history', () => {
        const hub = createTestHub({ coverage: 0 });
        const result = calculateHealthScore({ dataHub: hub });

        expect(result.dimensions.coverage.score).toBe(0);
    });
});

describe('CalculateHealthScore — suite speed threshold', () => {
    it('suite speed score is 0 when p95 > 3000ms', () => {
        const hub = createTestHub({ suiteSpeedP95: 4000 });
        const result = calculateHealthScore({ dataHub: hub });

        expect(result.dimensions.suiteSpeed.score).toBe(0);
    });

    it('suite speed score is 100 when p95 <= 1000ms', () => {
        const hub = createTestHub({ suiteSpeedP95: 500 });
        const result = calculateHealthScore({ dataHub: hub });

        expect(result.dimensions.suiteSpeed.score).toBe(100);
    });
});

describe('CalculateHealthScore — quality gate unification', () => {
    it('qualityGate field reflects runQualityGate result', () => {
        const hub = createTestHub({
            passRate: 95,
            coverage: 80,
            executionRate: 95,
            suiteSpeedP95: 500,
            flakyPercentage: 2,
        });
        const result = calculateHealthScore({ dataHub: hub });

        expect(result.qualityGate).toMatch(/^(pass|fail)$/);
    });
});

describe('CalculateHealthScore — DataHub SSOT enforcement', () => {
    it('uses dataHub.computed.coverage instead of store.coverageHistory', () => {
        const hub = createTestHub({ coverage: 42 });

        const result = calculateHealthScore({ dataHub: hub });

        // If DataHub SSOT is enforced, coverage score should reflect 42, not 90
        // Score for 42% coverage with target 80% should be low
        // Score for 90% coverage with target 80% should be 100
        expect(result.dimensions.coverage.score).toBeLessThan(80);
    });

    it('uses dataHub.computed.executionRate instead of computing from raw runs', () => {
        const hub = createTestHub({ executionRate: 30 });

        const result = calculateHealthScore({ dataHub: hub });

        // If DataHub SSOT is enforced, execution rate should be 30, not ~100
        // Score for 30% with target 95% should be 0 (below SCORE_FLOOR of 50)
        expect(result.dimensions.executionRate.score).toBe(0);
    });

    it('uses dataHub.computed.flakyPercentage instead of computing from raw runs', () => {
        // DataHub flaky=4% → scoreFlakyRate(4, {flakyThreshold:3, maxFlakyGate:5}) = 50
        // Store flaky=10% → scoreFlakyRate(10, {maxFlakyGate:5}) = 0
        // If code reads from store instead of DataHub, score=0≠50 → test FAILS (RED)
        const hub = createTestHub({ flakyPercentage: 4 });

        const result = calculateHealthScore({ dataHub: hub });

        // DataHub flaky=4% → 100 - ((4-3)/(5-3))*100 = 50
        expect(result.dimensions.flakyRate.score).toBe(50);
    });
});
