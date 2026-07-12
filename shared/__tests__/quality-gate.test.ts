/**
 * Quality gate — health score threshold validation via calculateHealthScore.
 *
 * NOTE: runQualityGate, formatQualityGateJson, formatQualityGateText are tested
 * in shared/quality-gate.test.ts (co-located with source).
 */
import { describe, it, expect } from 'vitest';
import { calculateHealthScore } from '../health-score.js';
import type { DataHub, ComputedMetrics } from '../types/data-hub.js';
import { makeDataHubMock } from '../test-utils/factories/data-hub-mock.js';

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
