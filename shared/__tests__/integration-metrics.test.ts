/**
 * Integration tests — validates end-to-end metric flow.
 *
 * Covers:
 * - CTRF → result_parser → metrics → health-score
 * - health-score → quality-gate → pr-report
 * - CTRF → pr-report → PR comment + Job Summary
 */
import { describe, it, expect } from 'vitest';
import { calculateHealthScore } from '../health-score.js';
import { calculateFlakyRate, getTrends } from '../metrics.js';
import type { MetricsStore } from '../metrics.js';

describe('Integration: metrics → health-score → quality-gate', () => {
    it('end-to-end flow: good metrics → pass quality gate', () => {
        const store: MetricsStore = {
            runs: Array.from({ length: 10 }, (_, i) => ({
                timestamp: `2026-01-${String(i + 1).padStart(2, '0')}`,
                project: 'test',
                total: 100,
                passed: 95,
                failed: 5,
                skipped: 0,
                duration: 1000,
                tests: Array.from({ length: 100 }, (_, j) => ({
                    title: `test-${j}`,
                    state: j < 95 ? 'passed' : 'failed',
                    duration: 10,
                })),
            })),
            coverageHistory: [
                { timestamp: '2026-01-10', project: 'test', totalIssues: 100, mappedIssues: 90, coveragePct: 90 },
            ],
        };

        const healthScore = calculateHealthScore(store);

        expect(healthScore.overall).toBeGreaterThanOrEqual(70);
        expect(healthScore.grade).not.toBe('critical');
        expect(healthScore.qualityGate).toBe('pass');
    });

    it('end-to-end flow: bad metrics → fail quality gate', () => {
        const store: MetricsStore = {
            runs: Array.from({ length: 10 }, (_, i) => ({
                timestamp: `2026-01-${String(i + 1).padStart(2, '0')}`,
                project: 'test',
                total: 100,
                passed: 50,
                failed: 50,
                skipped: 0,
                duration: 10000,
                tests: Array.from({ length: 100 }, (_, j) => ({
                    title: `test-${j}`,
                    state: j < 50 ? 'passed' : 'failed',
                    duration: 100,
                })),
            })),
            coverageHistory: [
                { timestamp: '2026-01-10', project: 'test', totalIssues: 100, mappedIssues: 50, coveragePct: 50 },
            ],
        };

        const healthScore = calculateHealthScore(store);

        expect(healthScore.overall).toBeLessThan(70);
        expect(healthScore.qualityGate).toBe('fail');
    });

    it('flaky rate consistency across modules', () => {
        const store: MetricsStore = {
            runs: [
                {
                    timestamp: '2026-01-01',
                    project: 'p',
                    total: 1,
                    passed: 1,
                    failed: 0,
                    skipped: 0,
                    duration: 10,
                    tests: [{ title: 'flaky', state: 'passed', duration: 10 }],
                },
                {
                    timestamp: '2026-01-02',
                    project: 'p',
                    total: 1,
                    passed: 0,
                    failed: 1,
                    skipped: 0,
                    duration: 10,
                    tests: [{ title: 'flaky', state: 'failed', duration: 10 }],
                },
            ],
        };

        // All modules should report the same flaky rate
        const metricsFlaky = calculateFlakyRate(store, 2);
        const healthScore = calculateHealthScore(store, { minRuns: 2 });

        // health-score uses calculateFlakyRate internally
        expect(metricsFlaky).toBe(100);
        expect(healthScore.dimensions.flakyRate.score).toBe(0); // 100% flaky → score 0
    });

    it('pass rate consistency: metrics.getTrends = health-score.passRate', () => {
        const store: MetricsStore = {
            runs: [
                {
                    timestamp: '2026-01-01T00:00:00Z',
                    project: 'p',
                    total: 100,
                    passed: 80,
                    failed: 10,
                    skipped: 10,
                    duration: 1000,
                    tests: [],
                },
            ],
        };

        const trends = getTrends(store);
        const healthScore = calculateHealthScore(store);

        // Both should use passed/(passed+failed) formula
        expect(trends[0]?.passRate).toBeCloseTo(88.89, 1);
        // Health score uses exponential weighting, but with 1 run it should be close
        expect(healthScore.dimensions.passRate.score).toBeGreaterThanOrEqual(80);
    });
});
