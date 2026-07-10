/**
 * Quality gate — health score threshold validation via calculateHealthScore.
 *
 * NOTE: runQualityGate, formatQualityGateJson, formatQualityGateText are tested
 * in shared/quality-gate.test.ts (co-located with source).
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

describe('Quality gate thresholds via health score', () => {
    it('quality gate passes with good metrics', () => {
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

    it('quality gate fails with low pass rate', () => {
        const result = calculateHealthScore({ dataHub: createTestHub() });

        expect(result.qualityGate).toBe('fail');
    });

    it('quality gate fails with low coverage', () => {
        const result = calculateHealthScore({ dataHub: createTestHub() });

        expect(result.qualityGate).toBe('fail');
    });

    it('quality gate fails with slow suite', () => {
        const result = calculateHealthScore({
            dataHub: createTestHub({ suiteSpeedP95: 5000 }),
        });

        expect(result.qualityGate).toBe('fail');
    });
});
