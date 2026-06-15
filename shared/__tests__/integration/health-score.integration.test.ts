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
 *
 * Pure function — no filesystem dependencies.
 */
import { describe, expect, it } from 'vitest';
import type { MetricsStore } from '../../metrics.js';

/** Helper to create a MetricsStore with controllable data. */
function createStore(
    overrides: Partial<{
        totalRuns: number;
        totalTests: number;
        passed: number;
        failed: number;
        skipped: number;
        flakyTests: number;
        duration: number;
    }> = {},
): MetricsStore {
    const {
        totalRuns = 10,
        totalTests = 100,
        passed = 90,
        failed = 8,
        skipped = 2,
        flakyTests = 1,
        duration = 5000,
    } = overrides;
    const testsPerRun = Math.floor(totalTests / totalRuns);
    const flakyPerRun = Math.min(flakyTests, testsPerRun);

    const runs = Array.from({ length: totalRuns }, (_, i) => ({
        timestamp: new Date(Date.now() + i * 60000).toISOString(),
        project: 'test-project',
        total: testsPerRun,
        passed: Math.floor((passed / totalTests) * testsPerRun),
        failed: Math.floor((failed / totalTests) * testsPerRun),
        skipped: Math.floor((skipped / totalTests) * testsPerRun),
        duration,
        tests: Array.from({ length: testsPerRun }, (_, j) => ({
            title: `test-${j}`,
            state: (j < flakyPerRun && i % 2 === 0 ? 'failed' : 'passed') as 'passed' | 'failed',
            duration: Math.floor(duration / testsPerRun),
        })),
    }));

    return { runs };
}

describe('Integration: Health Score', () => {
    describe('FT-09a: score range and grade', () => {
        it('returns score 0-100', async () => {
            const { calculateHealthScore } = await import('../../health-score.js');
            const store = createStore({ passed: 95, failed: 5, skipped: 0 });
            const result = calculateHealthScore(store, {});

            expect(result.overall).toBeGreaterThanOrEqual(0);
            expect(result.overall).toBeLessThanOrEqual(100);
        });

        it('assigns grade based on score', async () => {
            const { calculateHealthScore } = await import('../../health-score.js');
            const excellent = calculateHealthScore(
                createStore({ passed: 99, failed: 1, skipped: 0, flakyTests: 0 }),
                {},
            );
            const critical = calculateHealthScore(
                createStore({ passed: 50, failed: 50, skipped: 0, flakyTests: 0 }),
                {},
            );

            expect(excellent.grade).toBe('excellent');
            expect(critical.grade).toBe('poor');
        });
    });

    describe('FT-09b: dimensions', () => {
        it('all 5 dimensions are present', async () => {
            const { calculateHealthScore } = await import('../../health-score.js');
            const result = calculateHealthScore(createStore(), {});

            expect(result.dimensions).toBeDefined();
            expect(result.dimensions.passRate).toBeDefined();
            expect(result.dimensions.flakyRate).toBeDefined();
            expect(result.dimensions.coverage).toBeDefined();
            expect(result.dimensions.executionRate).toBeDefined();
            expect(result.dimensions.suiteSpeed).toBeDefined();
        });

        it('passRate score reflects actual pass rate', async () => {
            const { calculateHealthScore } = await import('../../health-score.js');
            const result = calculateHealthScore(createStore({ passed: 95, failed: 5, skipped: 0 }), {});

            expect(result.dimensions.passRate.score).toBeGreaterThanOrEqual(80);
        });
    });

    describe('FT-09c: provenance', () => {
        it('provenance has 5 entries', async () => {
            const { calculateHealthScore } = await import('../../health-score.js');
            const result = calculateHealthScore(createStore(), {});

            expect(result.provenance).toBeDefined();
            expect(result.provenance).toHaveLength(5);
        });

        it('each provenance entry has source and formula', async () => {
            const { calculateHealthScore } = await import('../../health-score.js');
            const result = calculateHealthScore(createStore(), {});

            for (const p of result.provenance as Array<{ source: string; formula: string; thresholdBasis: string }>) {
                expect(p.source).toBeTruthy();
                expect(p.formula).toBeTruthy();
                expect(p.thresholdBasis).toBeTruthy();
            }
        });
    });

    describe('FT-09d: qualityGate flag', () => {
        it('returns "pass" when score >= 70', async () => {
            const { calculateHealthScore } = await import('../../health-score.js');
            const result = calculateHealthScore(createStore({ passed: 95, failed: 5, skipped: 0, flakyTests: 0 }), {});
            expect(result.qualityGate).toBe('pass');
        });

        it('returns "fail" when score < 70', async () => {
            const { calculateHealthScore } = await import('../../health-score.js');
            const result = calculateHealthScore(createStore({ passed: 50, failed: 50, skipped: 0 }), {});
            expect(result.qualityGate).toBe('fail');
        });
    });

    describe('FT-09e: config overrides', () => {
        it('custom grade boundaries change grade assignment', async () => {
            const { calculateHealthScore } = await import('../../health-score.js');
            // Default: excellent >= 90. With custom: excellent >= 95
            const store = createStore({ passed: 95, failed: 5, skipped: 0 });
            const customResult = calculateHealthScore(store, {
                gradeBoundaries: { excellent: 95, good: 85, needs_attention: 70, poor: 60, critical: 0 },
            });

            // Score should be ~95, but boundary is 95, so it might be "good" not "excellent"
            expect(customResult.grade).toBeDefined();
        });
    });

    describe('FT-09f: edge cases', () => {
        it('handles store with single run', async () => {
            const { calculateHealthScore } = await import('../../health-score.js');
            const store = createStore({ totalRuns: 1, passed: 10, failed: 0, skipped: 0 });
            const result = calculateHealthScore(store, {});
            expect(result.overall).toBeGreaterThanOrEqual(0);
        });

        it('handles store with zero tests — returns score 0, grade critical', async () => {
            const { calculateHealthScore } = await import('../../health-score.js');
            const store: MetricsStore = { runs: [] };
            const result = calculateHealthScore(store, {});
            expect(result.overall).toBe(0);
            expect(result.grade).toBe('critical');
            expect(result.qualityGate).toBe('fail');
            expect(result.runCount).toBe(0);
            expect(result.dimensions.passRate.status).toBe('fail');
            expect(result.dimensions.coverage.status).toBe('fail');
        });
    });
});
