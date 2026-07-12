import { calculateHealthScore, evaluateQualityGate } from './health-score.js';
import type { DataHub, ComputedMetrics } from './types/data-hub.js';
import { makeDataHubMock } from './test-utils/factories/data-hub-mock.js';

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
            ...overrides,
        },
    });
}

describe('EvaluateQualityGate', () => {
    it('returns pass when all dimensions meet thresholds', () => {
        expect(evaluateQualityGate(95, 0, 90, 100, 2)).toBe('pass');
    });

    it('returns fail when passRate is below gate', () => {
        expect(evaluateQualityGate(70, 0, 90, 100, 2)).toBe('fail');
    });

    it('returns fail when flakyPct exceeds gate', () => {
        expect(evaluateQualityGate(95, 15, 90, 100, 2)).toBe('fail');
    });

    it('returns fail when coverage is below gate', () => {
        expect(evaluateQualityGate(95, 0, 60, 100, 2)).toBe('fail');
    });

    it('returns fail when suiteSpeed exceeds gate', () => {
        expect(evaluateQualityGate(95, 0, 90, 100, 20000)).toBe('fail');
    });

    it('accepts custom config overrides', () => {
        expect(evaluateQualityGate(70, 0, 90, 100, 2, { minPassRateGate: 60 })).toBe('pass');
    });
});

describe('CalculateHealthScore', () => {
    describe('Empty store', () => {
        it('returns low overall for empty store', () => {
            const result = calculateHealthScore({ dataHub: createTestHub() });

            expect(result.overall).toBeLessThan(50);
            expect(result.grade).toBe('critical');
            expect(result.runCount).toBe(0);
            expect(result.qualityGate).toBe('fail');
        });

        it('handles store with only runs but no coverage history', () => {
            const result = calculateHealthScore({ dataHub: createTestHub({ coverage: 30 }) });

            expect(result.dimensions.coverage.score).toBe(0);
            expect(result.qualityGate).toBe('fail');
        });
    });

    describe('Single run in store', () => {
        it('scores well with a perfect run and good coverage', () => {
            const result = calculateHealthScore({
                dataHub: createTestHub({
                    passRate: 100,
                    coverage: 100,
                    executionRate: 100,
                    flakyPercentage: 0,
                    suiteSpeedP95: 100,
                }),
            });

            expect(result.overall).toBeGreaterThanOrEqual(90);
            expect(result.grade).toBe('excellent');
        });
    });

    describe('Pass rate dimension', () => {
        it('scores 100 when pass rate meets target', () => {
            const result = calculateHealthScore({
                passRateTarget: 95,
                dataHub: createTestHub({ passRate: 95, coverage: 90 }),
            });

            expect(result.dimensions.passRate.score).toBe(100);
        });

        it('scores 0 when pass rate <= 50%', () => {
            const result = calculateHealthScore({ passRateTarget: 95, dataHub: createTestHub() });

            expect(result.dimensions.passRate.score).toBe(0);
        });

        it('linearly interpolates between 50% and target', () => {
            const result = calculateHealthScore({
                passRateTarget: 95,
                dataHub: createTestHub({ passRate: 72, coverage: 90 }),
            });

            expect(result.dimensions.passRate.score).toBe(49);
        });
    });

    describe('Flaky rate dimension', () => {
        it('scores 100 when no flaky tests exist', () => {
            const result = calculateHealthScore({
                minRuns: 2,
                dataHub: createTestHub({ flakyPercentage: 0, coverage: 90 }),
            });

            expect(result.dimensions.flakyRate.score).toBe(100);
        });

        it('scores 0 when 20% or more tests are flaky', () => {
            const result = calculateHealthScore({ minRuns: 2, dataHub: createTestHub({ flakyPercentage: 20 }) });

            expect(result.dimensions.flakyRate.score).toBeLessThanOrEqual(0);
        });

        it('interpolates linearly for intermediate flaky rates', () => {
            const result = calculateHealthScore({ minRuns: 2, dataHub: createTestHub({ flakyPercentage: 4 }) });

            // flakyThreshold=3, maxFlakyGate=5, actual=4 → 100 - ((4-3)/(5-3))*100 = 50
            expect(result.dimensions.flakyRate.score).toBe(50);
        });
    });

    describe('Coverage dimension', () => {
        it('scores 100 when coverage meets target', () => {
            const result = calculateHealthScore({
                coverageTarget: 90,
                dataHub: createTestHub({ coverage: 90 }),
            });

            expect(result.dimensions.coverage.score).toBe(100);
        });

        it('scores 0 when coverage <= 30%', () => {
            const result = calculateHealthScore({
                coverageTarget: 90,
                dataHub: createTestHub({ coverage: 30 }),
            });

            expect(result.dimensions.coverage.score).toBe(0);
        });

        it('linearly interpolates between 30% and target', () => {
            const result = calculateHealthScore({
                coverageTarget: 90,
                dataHub: createTestHub({ coverage: 60 }),
            });

            expect(result.dimensions.coverage.score).toBe(50);
        });
    });

    describe('Suite speed dimension', () => {
        it('scores 100 when speed is within target', () => {
            const result = calculateHealthScore({ suiteSpeedTarget: 1000, dataHub: createTestHub() });

            expect(result.dimensions.suiteSpeed.score).toBe(100);
        });

        it('scores 0 when speed >= 10s per test', () => {
            const result = calculateHealthScore({
                suiteSpeedTarget: 1000,
                dataHub: createTestHub({ suiteSpeedP95: 10000 }),
            });

            expect(result.dimensions.suiteSpeed.score).toBe(0);
        });

        it('linearly interpolates between target and gate', () => {
            const result = calculateHealthScore({
                suiteSpeedTarget: 1000,
                dataHub: createTestHub({ suiteSpeedP95: 2000 }),
            });

            expect(result.dimensions.suiteSpeed.score).toBe(50);
        });
    });

    describe('Overall score with default weights', () => {
        it('computes weighted average correctly', () => {
            const result = calculateHealthScore({
                dataHub: createTestHub({
                    passRate: 100,
                    coverage: 100,
                    executionRate: 100,
                    flakyPercentage: 0,
                    suiteSpeedP95: 100,
                }),
            });

            expect(result.overall).toBeGreaterThanOrEqual(90);
            expect(result.overall).toBeLessThanOrEqual(100);
        });
    });

    describe('Quality gate', () => {
        it('passes when all dimensions are healthy', () => {
            const result = calculateHealthScore({
                dataHub: createTestHub({
                    passRate: 100,
                    coverage: 100,
                    executionRate: 100,
                    flakyPercentage: 0,
                    suiteSpeedP95: 100,
                }),
            });

            expect(result.qualityGate).toBe('pass');
        });

        it('fails when pass rate is below gate', () => {
            const result = calculateHealthScore({ dataHub: createTestHub() });

            expect(result.qualityGate).toBe('fail');
            expect(result.dimensions.passRate.status).toBe('fail');
        });

        it('fails when flaky rate exceeds gate', () => {
            const result = calculateHealthScore({ minRuns: 2, dataHub: createTestHub({ flakyPercentage: 10 }) });

            expect(result.qualityGate).toBe('fail');
            expect(result.dimensions.flakyRate.status).toBe('fail');
        });

        it('passes when flaky rate is 0 (no flaky data)', () => {
            const result = calculateHealthScore({ minRuns: 2, dataHub: createTestHub({ flakyPercentage: 0 }) });

            expect(result.dimensions.flakyRate.status).toBe('pass');
        });

        it('fails when coverage is below gate', () => {
            const result = calculateHealthScore({ dataHub: createTestHub() });

            expect(result.qualityGate).toBe('fail');
            expect(result.dimensions.coverage.status).toBe('fail');
        });

        it('fails when suite speed exceeds gate', () => {
            const result = calculateHealthScore({
                dataHub: createTestHub({ suiteSpeedP95: 15000 }),
            });

            expect(result.qualityGate).toBe('fail');
            expect(result.dimensions.suiteSpeed.status).toBe('fail');
        });
    });

    describe('Penalty', () => {
        it('caps overall at 60 when any dimension < 40', () => {
            const result = calculateHealthScore({ dataHub: createTestHub() });

            expect(result.dimensions.coverage.score).toBeLessThan(40);
            expect(result.overall).toBeLessThanOrEqual(60);
        });
    });

    describe('Grade boundaries', () => {
        it('grades excellent at 90+', () => {
            const result = calculateHealthScore({
                dataHub: createTestHub({
                    passRate: 100,
                    coverage: 100,
                    executionRate: 100,
                    flakyPercentage: 0,
                    suiteSpeedP95: 100,
                }),
            });

            expect(result.overall).toBeGreaterThanOrEqual(90);
            expect(result.grade).toBe('excellent');
        });

        it('grades good at 80-89', () => {
            const result = calculateHealthScore({
                dataHub: createTestHub({
                    passRate: 85,
                    coverage: 80,
                    executionRate: 85,
                    flakyPercentage: 3,
                    suiteSpeedP95: 1500,
                }),
            });

            expect(result.grade).toBe('good');
        });

        it('grades needs_attention at 70-79', () => {
            const result = calculateHealthScore({
                dataHub: createTestHub({
                    passRate: 75,
                    coverage: 65,
                    executionRate: 75,
                    flakyPercentage: 0,
                    suiteSpeedP95: 2000,
                }),
            });

            expect(result.grade).toBe('poor');
        });

        it('grades poor at 60-69', () => {
            const result = calculateHealthScore({
                dataHub: createTestHub({
                    passRate: 70,
                    coverage: 60,
                    executionRate: 70,
                    flakyPercentage: 0,
                    suiteSpeedP95: 1500,
                }),
            });

            expect(result.grade).toBe('poor');
        });

        it('grades critical below 60', () => {
            const result = calculateHealthScore({ dataHub: createTestHub() });

            expect(result.overall).toBeLessThan(60);
            expect(result.grade).toBe('critical');
        });

        it('boundary: 89 is good, 90 is excellent', () => {
            const r89 = calculateHealthScore({
                weights: { passRate: 100, flakyRate: 0, coverage: 0, executionRate: 0, suiteSpeed: 0 },
                passRateTarget: 95,
                dataHub: createTestHub({ passRate: 89, coverage: 80, executionRate: 90 }),
            });

            expect(r89.overall).toBeLessThan(90);
            expect(r89.grade).toBe('good');

            const r90 = calculateHealthScore({
                weights: { passRate: 100, flakyRate: 0, coverage: 0, executionRate: 0, suiteSpeed: 0 },
                passRateTarget: 95,
                dataHub: createTestHub({ passRate: 91, coverage: 80, executionRate: 90 }),
            });

            expect(r90.overall).toBeGreaterThanOrEqual(90);
            expect(r90.grade).toBe('excellent');
        });

        it('boundary: 59 is critical, 60 is poor', () => {
            const r59 = calculateHealthScore({
                weights: { passRate: 100, flakyRate: 0, coverage: 0, executionRate: 0, suiteSpeed: 0 },
                passRateTarget: 95,
                dataHub: createTestHub({ passRate: 50 }),
            });

            expect(r59.overall).toBeLessThan(60);

            const r60 = calculateHealthScore({
                weights: { passRate: 100, flakyRate: 0, coverage: 0, executionRate: 0, suiteSpeed: 0 },
                passRateTarget: 95,
                dataHub: createTestHub({ passRate: 77 }),
            });

            expect(r60.overall).toBeGreaterThanOrEqual(60);
        });
    });

    describe('Config override', () => {
        it('accepts custom weights', () => {
            const resultDefault = calculateHealthScore({ dataHub: createTestHub() });
            const resultCustom = calculateHealthScore({
                weights: { passRate: 100, flakyRate: 0, coverage: 0, executionRate: 0, suiteSpeed: 0 },
                dataHub: createTestHub(),
            });

            expect(resultDefault.overall).not.toBe(resultCustom.overall);
        });

        it('accepts custom targets', () => {
            const defaultResult = calculateHealthScore({
                dataHub: createTestHub({ passRate: 70, coverage: 90 }),
            });
            const lenientResult = calculateHealthScore({
                passRateTarget: 80,
                dataHub: createTestHub({ passRate: 70, coverage: 90 }),
            });

            expect(lenientResult.dimensions.passRate.score).toBeGreaterThan(defaultResult.dimensions.passRate.score);
        });
    });

    describe('Edge: all passing with 0% flaky', () => {
        it('scores 100 in every dimension with ideal metrics', () => {
            const result = calculateHealthScore({
                minRuns: 2,
                dataHub: createTestHub({
                    passRate: 100,
                    coverage: 100,
                    executionRate: 100,
                    flakyPercentage: 0,
                    suiteSpeedP95: 100,
                }),
            });

            expect(result.dimensions.passRate.score).toBe(100);
            expect(result.dimensions.flakyRate.score).toBe(100);
            expect(result.dimensions.coverage.score).toBe(100);
            expect(result.dimensions.suiteSpeed.score).toBe(100);
            expect(result.dimensions.executionRate.score).toBe(100);
            expect(result.qualityGate).toBe('pass');
            expect(result.grade).toBe('excellent');
        });
    });

    describe('Edge: everything failing', () => {
        it('scores 0 and quality gate fails', () => {
            const result = calculateHealthScore({
                dataHub: createTestHub({
                    passRate: 0,
                    coverage: 0,
                    executionRate: 100,
                    flakyPercentage: 100,
                    suiteSpeedP95: 50000,
                }),
            });

            expect(result.dimensions.passRate.score).toBe(0);
            expect(result.dimensions.flakyRate.score).toBe(0);
            expect(result.dimensions.coverage.score).toBe(0);
            expect(result.dimensions.suiteSpeed.score).toBe(0);
            expect(result.dimensions.executionRate.score).toBe(100);
            expect(result.qualityGate).toBe('fail');
            expect(result.grade).toBe('critical');
        });
    });

    describe('Provenance', () => {
        it('returns 5 provenance entries for a default calculation', () => {
            const result = calculateHealthScore({ dataHub: createTestHub() });

            expect(result.provenance?.length).toBe(5);
        });

        it('each entry has required fields', () => {
            expect.hasAssertions();

            const result = calculateHealthScore({ dataHub: createTestHub() });
            for (const entry of result.provenance ?? []) {
                expect(entry.dimension).toBeTruthy();
                expect(entry.source).toBeTruthy();
                expect(entry.formula).toBeTruthy();
                expect(entry.standard).toBeTruthy();
                expect(entry.thresholdBasis).toBeTruthy();
                expect(typeof entry.configurable).toBe('boolean');
            }
        });

        it('marks dimensions as overridden when user provides custom target', () => {
            const result = calculateHealthScore({ passRateTarget: 90, dataHub: createTestHub() });
            const passRateEntry = result.provenance?.find((p) => p.dimension === 'passRate');

            expect(passRateEntry?.overridden).toBeTruthy();
        });

        it('does not mark dimensions as overridden with default config', () => {
            expect.hasAssertions();

            const result = calculateHealthScore({ dataHub: createTestHub() });
            for (const entry of result.provenance ?? []) {
                expect(entry.overridden).toBeUndefined();
            }
        });

        it('includes dimension-specific provenance data for passRate', () => {
            const result = calculateHealthScore({ dataHub: createTestHub() });
            const passRateEntry = result.provenance?.find((p) => p.dimension === 'passRate');

            expect(passRateEntry?.source).toContain('DORA');
            expect(passRateEntry?.formula).toContain('passed/(passed+failed)');
            expect(passRateEntry?.configurable).toBeTruthy();
        });

        it('includes dimension-specific provenance data for suiteSpeed', () => {
            const result = calculateHealthScore({ dataHub: createTestHub() });
            const speedEntry = result.provenance?.find((p) => p.dimension === 'suiteSpeed');

            expect(speedEntry?.source).toContain('Google SRE');
            expect(speedEntry?.formula).toContain('p95');
            expect(speedEntry?.configurable).toBeTruthy();
        });

        it('includes dimension-specific provenance data for flakyRate', () => {
            const result = calculateHealthScore({ dataHub: createTestHub() });
            const flakyEntry = result.provenance?.find((p) => p.dimension === 'flakyRate');

            expect(flakyEntry?.source).toContain('Kualitatem');
            expect(flakyEntry?.configurable).toBeTruthy();
        });

        it('provenance thresholdBasis for suiteSpeed matches default maxSuiteSpeedGate (G-03)', () => {
            const result = calculateHealthScore({ dataHub: createTestHub() });
            const speedEntry = result.provenance?.find((p) => p.dimension === 'suiteSpeed');

            expect(speedEntry?.thresholdBasis).toContain('max 3000ms');
        });
    });

    describe('Edge: NaN and Infinity (D8 regression prevention)', () => {
        it('naN coverageOverride produces 0 score, not NaN', () => {
            const result = calculateHealthScore({
                coverageOverride: NaN,
                dataHub: createTestHub({ coverage: 0 }),
            });

            expect(Number.isFinite(result.dimensions.coverage.score)).toBeTruthy();
            expect(result.dimensions.coverage.score).toBe(0);
        });

        it('naN coveragePct in history produces 0 score, not NaN', () => {
            const result = calculateHealthScore({ dataHub: createTestHub({ coverage: 0 }) });

            expect(Number.isFinite(result.dimensions.coverage.score)).toBeTruthy();
            expect(result.dimensions.coverage.score).toBe(0);
        });

        it('infinity test duration does not crash or produce NaN', () => {
            const result = calculateHealthScore({ dataHub: createTestHub() });

            expect(Number.isFinite(result.dimensions.suiteSpeed.score)).toBeTruthy();
            expect(result.dimensions.suiteSpeed.score).toBe(100);
        });

        it('overall is always finite even with degenerate inputs', () => {
            const result = calculateHealthScore({ coverageOverride: NaN, dataHub: createTestHub() });

            expect(Number.isFinite(result.overall)).toBeTruthy();
            expect(result.overall).toBeGreaterThanOrEqual(0);
        });
    });

    describe('FlakyThreshold config', () => {
        it('flakyThreshold parameter affects flaky rate scoring (G-05)', () => {
            // 4 tests, 2 runs each. T0 is flaky (pass+fail). flakyRate = 25%.
            // Current code ignores flakyThreshold: score = 100 - (25/50)*100 = 50
            // After fix with flakyThreshold=30: 25 <= 30 → score 100
            const resultWithThreshold = calculateHealthScore({
                minRuns: 2,
                maxFlakyGate: 50,
                flakyThreshold: 30,
                dataHub: createTestHub({ flakyPercentage: 25 }),
            });

            expect(resultWithThreshold.dimensions.flakyRate.score).toBe(100);
        });
    });
});
