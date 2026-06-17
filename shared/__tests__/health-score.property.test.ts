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
import type { MetricsStore, MetricsRun } from '../metrics.js';
import { calculateHealthScore } from '../health-score.js';

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
        return withCoverage.map((r) => r as MetricsStore);
    });

/* ──────────────────────────────────────────────────────────────
 * Properties
 * ────────────────────────────────────────────────────────────── */

describe('calculateHealthScore — property-based', () => {
    it('overall always in [0, 100]', () => {
        fc.assert(
            fc.property(MetricsStoreArb, (store) => {
                const result = calculateHealthScore(store);
                expect(result.overall).toBeGreaterThanOrEqual(0);
                expect(result.overall).toBeLessThanOrEqual(100);
            }),
            { numRuns: 50 },
        );
    });

    it('grade matches boundaries: excellent >= 90, good >= 80, needs_attention >= 70, poor >= 60, critical < 60', () => {
        fc.assert(
            fc.property(MetricsStoreArb, (store) => {
                const result = calculateHealthScore(store);
                const score = result.overall;
                switch (result.grade) {
                    case 'excellent':
                        expect(score).toBeGreaterThanOrEqual(90);
                        break;
                    case 'good':
                        expect(score).toBeGreaterThanOrEqual(80);
                        break;
                    case 'needs_attention':
                        expect(score).toBeGreaterThanOrEqual(70);
                        break;
                    case 'poor':
                        expect(score).toBeGreaterThanOrEqual(60);
                        break;
                    case 'critical':
                        expect(score).toBeLessThan(60);
                        break;
                }
            }),
            { numRuns: 50 },
        );
    });

    it('all 5 dimensions are present', () => {
        fc.assert(
            fc.property(MetricsStoreArb, (store) => {
                const result = calculateHealthScore(store);
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
        fc.assert(
            fc.property(MetricsStoreArb, (store) => {
                const result = calculateHealthScore(store);
                const dimValues = Object.values(result.dimensions) as Array<{ score: number; status: string }>;
                for (const dim of dimValues) {
                    expect(dim.score).toBeGreaterThanOrEqual(0);
                    expect(dim.score).toBeLessThanOrEqual(100);
                }
            }),
            { numRuns: 50 },
        );
    });

    it('provenance has 5 entries with source, standard, and formula', () => {
        fc.assert(
            fc.property(MetricsStoreArb, (store) => {
                const result = calculateHealthScore(store);
                expect(result.provenance).toHaveLength(5);
                for (const p of result.provenance ?? []) {
                    expect(p.source).toBeTruthy();
                    expect(p.standard).toBeTruthy();
                    expect(p.formula).toBeTruthy();
                    expect(p.thresholdBasis).toBeTruthy();
                }
            }),
            { numRuns: 50 },
        );
    });

    it('empty store returns overall=0, grade=critical, qualityGate=fail', () => {
        const store: MetricsStore = { runs: [] };
        const result = calculateHealthScore(store);
        expect(result.overall).toBe(0);
        expect(result.grade).toBe('critical');
        expect(result.qualityGate).toBe('fail');
        expect(result.runCount).toBe(0);
    });

    it('provenance tracks overridden thresholds correctly', () => {
        fc.assert(
            fc.property(MetricsStoreArb, PercentageArb, fc.boolean(), (store, passRateTarget, useOverride) => {
                const options = useOverride ? { passRateTarget: Math.round(passRateTarget) } : {};
                const result = calculateHealthScore(store, options);
                const passRateProvenance = result.provenance?.find((p) => p.dimension === 'passRate');
                expect(passRateProvenance).toBeDefined();
                if (useOverride) {
                    expect(passRateProvenance?.overridden).toBe(true);
                }
            }),
            { numRuns: 50 },
        );
    });

    it('custom grade boundaries change grade accordingly', () => {
        fc.assert(
            fc.property(
                MetricsStoreArb,
                fc.nat({ max: 100 }),
                fc.nat({ max: 100 }),
                fc.nat({ max: 100 }),
                fc.nat({ max: 100 }),
                (store, excellent, good, needs, poor) => {
                    const sorted = [excellent, good, needs, poor].sort((a, b) => b - a);
                    const boundaries = {
                        excellent: Math.max(sorted[0] as number, 10),
                        good: Math.max(sorted[1] as number, 10),
                        needs_attention: Math.max(sorted[2] as number, 1),
                        poor: Math.max(sorted[3] as number, 1),
                        critical: 0,
                    };
                    const result = calculateHealthScore(store, { gradeBoundaries: boundaries });
                    const score = result.overall;
                    switch (result.grade) {
                        case 'excellent':
                            expect(score).toBeGreaterThanOrEqual(boundaries.excellent);
                            break;
                        case 'good':
                            expect(score).toBeGreaterThanOrEqual(boundaries.good);
                            break;
                        case 'needs_attention':
                            expect(score).toBeGreaterThanOrEqual(boundaries.needs_attention);
                            break;
                        case 'poor':
                            expect(score).toBeGreaterThanOrEqual(boundaries.poor);
                            break;
                        case 'critical':
                            expect(score).toBeLessThan(boundaries.poor);
                            break;
                    }
                },
            ),
            { numRuns: 50 },
        );
    });
});
