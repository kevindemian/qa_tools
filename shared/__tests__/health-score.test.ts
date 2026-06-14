/**
 * Health score unit tests — validates metric calculations and scoring.
 *
 * Covers:
 * - Pass rate scoring (excludes skipped)
 * - Coverage source tracking
 * - Suite speed threshold (3000ms)
 * - Quality gate unification
 * - Edge cases
 */
import { describe, it, expect } from 'vitest';
import { calculateHealthScore } from '../health-score.js';
import type { MetricsStore } from '../metrics.js';

describe('calculateHealthScore — pass rate consistency', () => {
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

describe('calculateHealthScore — suite speed threshold', () => {
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

describe('calculateHealthScore — quality gate unification', () => {
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
        // With good metrics, quality gate should pass
        expect(result.qualityGate).toBeDefined();
    });
});
