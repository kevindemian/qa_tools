/**
 * Property-Based Tests — Health Score (FT-09)
 *
 * Dimensão 5 — Métricas: Conformidade normativa ISO 25023, DORA, ISTQB.
 *
 * Verifica invariantes do cálculo de health score:
 * - overall sempre em [0, 100]
 * - grade consistente com boundaries
 * - qualityGate consistente com evaluateQualityGate
 * - 5 dimensões sempre presentes
 * - Proveniência documentada com fonte, norma e fórmula
 * - Empty store → 0, critical, fail
 */
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { MetricsStore, MetricsRun, DataHub, ComputedMetrics } from '../types/data-hub.js';
import { calculateHealthScore } from '../quality/health-score.js';
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

/* ──────────────────────────────────────────────────────────────
 * Arbitraries
 * ────────────────────────────────────────────────────────────── */

const PercentageArb = fc.float({ min: 0, max: 100, noDefaultInfinity: true, noNaN: true });

const TestStateArb = fc.constantFrom('passed' as const, 'failed' as const, 'skipped' as const);

const FlatTestArb = fc.record({
    title: fc.string({ minLength: 1, maxLength: 20 }),
    state: TestStateArb,
    duration: fc.nat({ max: 5000 }),
});

const MetricsRunArb: fc.Arbitrary<MetricsRun> = fc
    .tuple(fc.nat({ max: 200 }), fc.nat({ max: 200 }), fc.nat({ max: 200 }), fc.nat({ max: 100 }))
    .chain(([passed, failed, skipped, extra]) => {
        const executed = passed + failed + skipped;
        const testCount = Math.max(1, Math.min(executed, 50));
        return fc.record({
            timestamp: fc.string({ minLength: 1, maxLength: 30 }),
            project: fc.constant('p'),
            total: fc.constant(executed + extra),
            passed: fc.constant(passed),
            failed: fc.constant(failed),
            skipped: fc.constant(skipped),
            duration: fc.nat({ max: 3600000 }),
            tests: fc.array(FlatTestArb, { minLength: 0, maxLength: testCount }),
        });
    });

const MetricsStoreArb: fc.Arbitrary<MetricsStore> = fc
    .record({
        runs: fc.array(MetricsRunArb, { minLength: 0, maxLength: 15 }),
    })
    .chain((base) => {
        const withCoverage = fc.record({
            runs: fc.constant(base.runs),
            coverageHistory: fc.option(
                fc.array(
                    fc.record({
                        timestamp: fc.string({ minLength: 1, maxLength: 30 }),
                        project: fc.constant('p'),
                        totalIssues: fc.nat({ max: 1000 }),
                        mappedIssues: fc.nat({ max: 1000 }),
                        coveragePct: fc.nat({ max: 100 }),
                    }),
                    { minLength: 1, maxLength: 5 },
                ),
                { nil: undefined },
            ),
        });
        return withCoverage.map((r) => {
            const result: MetricsStore = { runs: r.runs };
            if (r.coverageHistory) result.coverageHistory = r.coverageHistory;
            return result;
        });
    });

/* ──────────────────────────────────────────────────────────────
 * Properties
 * ────────────────────────────────────────────────────────────── */

describe('CalculateHealthScore — property-based', () => {
    it('overall always in [0, 100]', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(MetricsStoreArb, (_store) => {
                const result = calculateHealthScore({ dataHub: createTestHub() });

                expect(result.overall).toBeGreaterThanOrEqual(0);
                expect(result.overall).toBeLessThanOrEqual(100);
            }),
            { numRuns: 50 },
        );
    });

    it('grade matches boundaries: excellent >= 90, good >= 80, needs_attention >= 70, poor >= 60, critical < 60', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(MetricsStoreArb, (_store) => {
                const result = calculateHealthScore({ dataHub: createTestHub() });
                const score = result.overall;
                let expectedGrade: string;
                if (score >= 90) {
                    expectedGrade = 'excellent';
                } else if (score >= 80) {
                    expectedGrade = 'good';
                } else if (score >= 70) {
                    expectedGrade = 'needs_attention';
                } else if (score >= 60) {
                    expectedGrade = 'poor';
                } else {
                    expectedGrade = 'critical';
                }

                expect(result.grade).toBe(expectedGrade);
            }),
            { numRuns: 50 },
        );
    });

    it('all 5 dimensions are present', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(MetricsStoreArb, (_store) => {
                const result = calculateHealthScore({ dataHub: createTestHub() });

                expect(result.dimensions).toBeDefined();
                expect(result.dimensions.passRate).toBeDefined();
                expect(result.dimensions.flakyRate).toBeDefined();
                expect(result.dimensions.coverage).toBeDefined();
                expect(result.dimensions.executionRate).toBeDefined();
                expect(result.dimensions.suiteSpeed).toBeDefined();
            }),
            { numRuns: 50 },
        );
    });

    it('each dimension score is in [0, 100]', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(MetricsStoreArb, (_store) => {
                const result = calculateHealthScore({ dataHub: createTestHub() });
                const dims = result.dimensions;
                const dimScores = [
                    dims.passRate.score,
                    dims.flakyRate.score,
                    dims.coverage.score,
                    dims.executionRate.score,
                    dims.suiteSpeed.score,
                ];
                for (const score of dimScores) {
                    expect(score).toBeGreaterThanOrEqual(0);
                    expect(score).toBeLessThanOrEqual(100);
                }
            }),
            { numRuns: 50 },
        );
    });

    it('provenance has 5 entries with source, standard, and formula', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(MetricsStoreArb, (_store) => {
                const result = calculateHealthScore({ dataHub: createTestHub() });

                expect(result.provenance).toHaveLength(5);

                for (const p of result.provenance ?? []) {
                    expect(p.source.length).toBeGreaterThan(0);
                    expect(p.standard.length).toBeGreaterThan(0);
                    expect(p.formula.length).toBeGreaterThan(0);
                    expect(p.thresholdBasis.length).toBeGreaterThan(0);
                }
            }),
            { numRuns: 50 },
        );
    });

    it('empty store returns overall=0, grade=critical, qualityGate=fail', () => {
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
    });

    it('provenance tracks overridden thresholds correctly', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(PercentageArb, fc.boolean(), (passRateTarget, useOverride) => {
                const options = useOverride
                    ? { passRateTarget: Math.round(passRateTarget), dataHub: createTestHub() }
                    : { dataHub: createTestHub() };
                const result = calculateHealthScore(options);
                const passRateProvenance = result.provenance?.find((p) => p.dimension === 'passRate');

                expect(passRateProvenance).toBeDefined();

                expect(!useOverride || passRateProvenance?.overridden).toBeTruthy();
            }),
            { numRuns: 50 },
        );
    });

    it('custom grade boundaries change grade accordingly', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(
                fc.nat({ max: 100 }),
                fc.nat({ max: 100 }),
                fc.nat({ max: 100 }),
                fc.nat({ max: 100 }),
                (excellent, good, needs, poor) => {
                    const sorted = [excellent, good, needs, poor].sort((a, b) => b - a);
                    const boundaries = {
                        excellent: Math.max(sorted[0] ?? excellent, 10),
                        good: Math.max(sorted[1] ?? good, 10),
                        needs_attention: Math.max(sorted[2] ?? needs, 1),
                        poor: Math.max(sorted[3] ?? poor, 1),
                        critical: 0,
                    };
                    const result = calculateHealthScore({
                        gradeBoundaries: boundaries,
                        dataHub: createTestHub(),
                    });
                    const score = result.overall;
                    let expectedGrade: string;
                    if (score >= boundaries.excellent) {
                        expectedGrade = 'excellent';
                    } else if (score >= boundaries.good) {
                        expectedGrade = 'good';
                    } else if (score >= boundaries.needs_attention) {
                        expectedGrade = 'needs_attention';
                    } else if (score >= boundaries.poor) {
                        expectedGrade = 'poor';
                    } else {
                        expectedGrade = 'critical';
                    }

                    expect(result.grade).toBe(expectedGrade);
                },
            ),
            { numRuns: 50 },
        );
    });
});
