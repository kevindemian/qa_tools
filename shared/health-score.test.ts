import { calculateHealthScore, evaluateQualityGate } from './health-score.js';
import type { MetricsStore } from './metrics.js';

function makeStore(overrides?: Partial<MetricsStore>): MetricsStore {
    return {
        runs: [],
        coverageHistory: [],
        ...overrides,
    };
}

function run(overrides?: Partial<MetricsStore['runs'][0]>): MetricsStore['runs'][0] {
    return {
        timestamp: '2026-01-01T00:00:00.000Z',
        project: 'test',
        total: 10,
        passed: 10,
        failed: 0,
        skipped: 0,
        duration: 10000,
        tests: [],
        ...overrides,
    };
}

function testT(
    title: string,
    state: 'passed' | 'failed' | 'skipped',
    duration?: number,
): { title: string; state: 'passed' | 'failed' | 'skipped'; duration: number } {
    return { title, state, duration: duration ?? 100 };
}

const PASSING_RUN = run({
    total: 10,
    passed: 10,
    failed: 0,
    skipped: 0,
    duration: 5000,
    tests: [
        testT('T1', 'passed'),
        testT('T2', 'passed'),
        testT('T3', 'passed'),
        testT('T4', 'passed'),
        testT('T5', 'passed'),
        testT('T6', 'passed'),
        testT('T7', 'passed'),
        testT('T8', 'passed'),
        testT('T9', 'passed'),
        testT('T10', 'passed'),
    ],
});

describe('evaluateQualityGate', () => {
    it('returns pass when all dimensions meet thresholds', () => {
        expect(evaluateQualityGate(95, 0, 90, 2)).toBe('pass');
    });

    it('returns fail when passRate is below gate', () => {
        expect(evaluateQualityGate(70, 0, 90, 2)).toBe('fail');
    });

    it('returns fail when flakyPct exceeds gate', () => {
        expect(evaluateQualityGate(95, 15, 90, 2)).toBe('fail');
    });

    it('returns fail when coverage is below gate', () => {
        expect(evaluateQualityGate(95, 0, 60, 2)).toBe('fail');
    });

    it('returns fail when suiteSpeed exceeds gate', () => {
        expect(evaluateQualityGate(95, 0, 90, 10)).toBe('fail');
    });

    it('accepts custom config overrides', () => {
        expect(evaluateQualityGate(70, 0, 90, 2, { minPassRateGate: 60 })).toBe('pass');
    });
});

describe('calculateHealthScore', () => {
    describe('empty store', () => {
        it('returns low overall for empty store', () => {
            const store = makeStore();
            const result = calculateHealthScore(store);
            expect(result.overall).toBeLessThan(50);
            expect(result.grade).toBe('critical');
            expect(result.runCount).toBe(0);
            expect(result.qualityGate).toBe('fail');
        });

        it('handles store with only runs but no coverage history', () => {
            const store = makeStore({ runs: [PASSING_RUN] });
            const result = calculateHealthScore(store);
            expect(result.dimensions.coverage.score).toBe(0);
            expect(result.qualityGate).toBe('fail');
        });
    });

    describe('single run in store', () => {
        it('scores well with a perfect run and good coverage', () => {
            const store = makeStore({
                runs: [PASSING_RUN],
                coverageHistory: [
                    {
                        timestamp: '2026-01-01T00:00:00.000Z',
                        project: 'test',
                        totalIssues: 10,
                        mappedIssues: 10,
                        coveragePct: 100,
                    },
                ],
            });
            const result = calculateHealthScore(store);
            expect(result.overall).toBeGreaterThanOrEqual(90);
            expect(result.grade).toBe('excellent');
        });
    });

    describe('pass rate dimension', () => {
        it('scores 100 when pass rate meets target', () => {
            const store = makeStore({
                runs: [run({ total: 100, passed: 95, failed: 5, duration: 10000 })],
                coverageHistory: [
                    {
                        timestamp: '2026-01-01T00:00:00.000Z',
                        project: 'test',
                        totalIssues: 10,
                        mappedIssues: 9,
                        coveragePct: 90,
                    },
                ],
            });
            const result = calculateHealthScore(store, { passRateTarget: 95 });
            expect(result.dimensions.passRate.score).toBe(100);
        });

        it('scores 0 when pass rate <= 50%', () => {
            const store = makeStore({
                runs: [run({ total: 100, passed: 40, failed: 60, duration: 10000 })],
                coverageHistory: [
                    {
                        timestamp: '2026-01-01T00:00:00.000Z',
                        project: 'test',
                        totalIssues: 10,
                        mappedIssues: 9,
                        coveragePct: 90,
                    },
                ],
            });
            const result = calculateHealthScore(store, { passRateTarget: 95 });
            expect(result.dimensions.passRate.score).toBe(0);
        });

        it('linearly interpolates between 50% and target', () => {
            const store = makeStore({
                runs: [run({ total: 100, passed: 72, failed: 28, duration: 10000 })],
                coverageHistory: [
                    {
                        timestamp: '2026-01-01T00:00:00.000Z',
                        project: 'test',
                        totalIssues: 10,
                        mappedIssues: 9,
                        coveragePct: 90,
                    },
                ],
            });
            const result = calculateHealthScore(store, { passRateTarget: 95 });
            expect(result.dimensions.passRate.score).toBe(49);
        });
    });

    describe('flaky rate dimension', () => {
        it('scores 100 when no flaky tests exist', () => {
            const store = makeStore({
                runs: [
                    run({ tests: [testT('T', 'passed')], total: 1, passed: 1, failed: 0 }),
                    run({ tests: [testT('T', 'passed')], total: 1, passed: 1, failed: 0 }),
                ],
                coverageHistory: [
                    {
                        timestamp: '2026-01-01T00:00:00.000Z',
                        project: 'test',
                        totalIssues: 10,
                        mappedIssues: 9,
                        coveragePct: 90,
                    },
                ],
            });
            const result = calculateHealthScore(store, { minRuns: 2 });
            expect(result.dimensions.flakyRate.score).toBe(100);
        });

        it('scores 0 when 20% or more tests are flaky', () => {
            const store = makeStore({
                runs: [
                    run({
                        tests: [testT('FlakyA', 'passed'), testT('FlakyB', 'passed')],
                        total: 2,
                        passed: 2,
                        failed: 0,
                    }),
                    run({
                        tests: [testT('FlakyA', 'failed'), testT('FlakyB', 'failed')],
                        total: 2,
                        passed: 0,
                        failed: 2,
                    }),
                ],
                coverageHistory: [
                    {
                        timestamp: '2026-01-01T00:00:00.000Z',
                        project: 'test',
                        totalIssues: 10,
                        mappedIssues: 9,
                        coveragePct: 90,
                    },
                ],
            });
            const result = calculateHealthScore(store, { minRuns: 2 });
            expect(result.dimensions.flakyRate.score).toBeLessThanOrEqual(0);
        });

        it('interpolates linearly for intermediate flaky rates', () => {
            const store = makeStore({
                runs: [
                    run({
                        tests: [testT('A', 'passed'), testT('B', 'passed'), testT('C', 'passed'), testT('D', 'passed')],
                        total: 4,
                        passed: 4,
                        failed: 0,
                    }),
                    run({
                        tests: [testT('A', 'passed'), testT('B', 'passed'), testT('C', 'failed'), testT('D', 'failed')],
                        total: 4,
                        passed: 2,
                        failed: 2,
                    }),
                ],
                coverageHistory: [
                    {
                        timestamp: '2026-01-01T00:00:00.000Z',
                        project: 'test',
                        totalIssues: 10,
                        mappedIssues: 9,
                        coveragePct: 90,
                    },
                ],
            });
            const result = calculateHealthScore(store, { minRuns: 2 });
            expect(result.dimensions.flakyRate.score).toBe(0);
        });
    });

    describe('coverage dimension', () => {
        it('scores 100 when coverage meets target', () => {
            const store = makeStore({
                runs: [PASSING_RUN],
                coverageHistory: [
                    {
                        timestamp: '2026-01-01T00:00:00.000Z',
                        project: 'test',
                        totalIssues: 10,
                        mappedIssues: 9,
                        coveragePct: 90,
                    },
                ],
            });
            const result = calculateHealthScore(store, { coverageTarget: 90 });
            expect(result.dimensions.coverage.score).toBe(100);
        });

        it('scores 0 when coverage <= 30%', () => {
            const store = makeStore({
                runs: [PASSING_RUN],
                coverageHistory: [
                    {
                        timestamp: '2026-01-01T00:00:00.000Z',
                        project: 'test',
                        totalIssues: 10,
                        mappedIssues: 2,
                        coveragePct: 20,
                    },
                ],
            });
            const result = calculateHealthScore(store, { coverageTarget: 90 });
            expect(result.dimensions.coverage.score).toBe(0);
        });

        it('linearly interpolates between 30% and target', () => {
            const store = makeStore({
                runs: [PASSING_RUN],
                coverageHistory: [
                    {
                        timestamp: '2026-01-01T00:00:00.000Z',
                        project: 'test',
                        totalIssues: 10,
                        mappedIssues: 6,
                        coveragePct: 60,
                    },
                ],
            });
            const result = calculateHealthScore(store, { coverageTarget: 90 });
            expect(result.dimensions.coverage.score).toBe(50);
        });
    });

    describe('suite speed dimension', () => {
        it('scores 100 when speed is within target', () => {
            const store = makeStore({
                runs: [run({ total: 10, passed: 10, duration: 5000 })],
                coverageHistory: [
                    {
                        timestamp: '2026-01-01T00:00:00.000Z',
                        project: 'test',
                        totalIssues: 10,
                        mappedIssues: 9,
                        coveragePct: 90,
                    },
                ],
            });
            const result = calculateHealthScore(store, { suiteSpeedTarget: 2 });
            expect(result.dimensions.suiteSpeed.score).toBe(100);
        });

        it('scores 0 when speed >= 10s per test', () => {
            const store = makeStore({
                runs: [run({ total: 10, passed: 10, duration: 200000 })],
                coverageHistory: [
                    {
                        timestamp: '2026-01-01T00:00:00.000Z',
                        project: 'test',
                        totalIssues: 10,
                        mappedIssues: 9,
                        coveragePct: 90,
                    },
                ],
            });
            const result = calculateHealthScore(store, { suiteSpeedTarget: 2 });
            expect(result.dimensions.suiteSpeed.score).toBe(0);
        });

        it('linearly interpolates between target and 10s', () => {
            const store = makeStore({
                runs: [run({ total: 10, passed: 10, duration: 60000 })],
                coverageHistory: [
                    {
                        timestamp: '2026-01-01T00:00:00.000Z',
                        project: 'test',
                        totalIssues: 10,
                        mappedIssues: 9,
                        coveragePct: 90,
                    },
                ],
            });
            const result = calculateHealthScore(store, { suiteSpeedTarget: 2 });
            expect(result.dimensions.suiteSpeed.score).toBe(50);
        });
    });

    describe('overall score with default weights', () => {
        it('computes weighted average correctly', () => {
            const store = makeStore({
                runs: [PASSING_RUN],
                coverageHistory: [
                    {
                        timestamp: '2026-01-01T00:00:00.000Z',
                        project: 'test',
                        totalIssues: 10,
                        mappedIssues: 9,
                        coveragePct: 90,
                    },
                ],
            });
            const result = calculateHealthScore(store);
            expect(result.overall).toBeGreaterThanOrEqual(90);
            expect(result.overall).toBeLessThanOrEqual(100);
        });
    });

    describe('quality gate', () => {
        it('passes when all dimensions are healthy', () => {
            const store = makeStore({
                runs: [PASSING_RUN],
                coverageHistory: [
                    {
                        timestamp: '2026-01-01T00:00:00.000Z',
                        project: 'test',
                        totalIssues: 10,
                        mappedIssues: 9,
                        coveragePct: 90,
                    },
                ],
            });
            const result = calculateHealthScore(store);
            expect(result.qualityGate).toBe('pass');
        });

        it('fails when pass rate is below gate', () => {
            const store = makeStore({
                runs: [run({ total: 10, passed: 7, failed: 3, duration: 5000 })],
                coverageHistory: [
                    {
                        timestamp: '2026-01-01T00:00:00.000Z',
                        project: 'test',
                        totalIssues: 10,
                        mappedIssues: 9,
                        coveragePct: 90,
                    },
                ],
            });
            const result = calculateHealthScore(store);
            expect(result.qualityGate).toBe('fail');
            expect(result.dimensions.passRate.status).toBe('fail');
        });

        it('fails when flaky rate exceeds gate', () => {
            const store = makeStore({
                runs: [
                    run({
                        tests: [testT('FlakyA', 'passed'), testT('FlakyB', 'passed')],
                        total: 2,
                        passed: 2,
                        failed: 0,
                    }),
                    run({
                        tests: [testT('FlakyA', 'failed'), testT('FlakyB', 'failed')],
                        total: 2,
                        passed: 0,
                        failed: 2,
                    }),
                ],
                coverageHistory: [
                    {
                        timestamp: '2026-01-01T00:00:00.000Z',
                        project: 'test',
                        totalIssues: 10,
                        mappedIssues: 9,
                        coveragePct: 90,
                    },
                ],
            });
            const result = calculateHealthScore(store, { minRuns: 2 });
            expect(result.qualityGate).toBe('fail');
            expect(result.dimensions.flakyRate.status).toBe('fail');
        });

        it('fails when coverage is below gate', () => {
            const store = makeStore({
                runs: [PASSING_RUN],
                coverageHistory: [
                    {
                        timestamp: '2026-01-01T00:00:00.000Z',
                        project: 'test',
                        totalIssues: 10,
                        mappedIssues: 5,
                        coveragePct: 50,
                    },
                ],
            });
            const result = calculateHealthScore(store);
            expect(result.qualityGate).toBe('fail');
            expect(result.dimensions.coverage.status).toBe('fail');
        });

        it('fails when suite speed exceeds gate', () => {
            const store = makeStore({
                runs: [run({ total: 5, passed: 5, duration: 50000 })],
                coverageHistory: [
                    {
                        timestamp: '2026-01-01T00:00:00.000Z',
                        project: 'test',
                        totalIssues: 10,
                        mappedIssues: 9,
                        coveragePct: 90,
                    },
                ],
            });
            const result = calculateHealthScore(store);
            expect(result.qualityGate).toBe('fail');
            expect(result.dimensions.suiteSpeed.status).toBe('fail');
        });
    });

    describe('penalty', () => {
        it('caps overall at 60 when any dimension < 40', () => {
            const store = makeStore({
                runs: [PASSING_RUN],
                coverageHistory: [
                    {
                        timestamp: '2026-01-01T00:00:00.000Z',
                        project: 'test',
                        totalIssues: 10,
                        mappedIssues: 2,
                        coveragePct: 20,
                    },
                ],
            });
            const result = calculateHealthScore(store);
            expect(result.dimensions.coverage.score).toBeLessThan(40);
            expect(result.overall).toBeLessThanOrEqual(60);
        });
    });

    describe('grade boundaries', () => {
        it('grades excellent at 90+', () => {
            const store = makeStore({
                runs: [PASSING_RUN],
                coverageHistory: [
                    {
                        timestamp: '2026-01-01T00:00:00.000Z',
                        project: 'test',
                        totalIssues: 10,
                        mappedIssues: 10,
                        coveragePct: 100,
                    },
                ],
            });
            const result = calculateHealthScore(store);
            expect(result.overall).toBeGreaterThanOrEqual(90);
            expect(result.grade).toBe('excellent');
        });

        it('grades good at 70-89', () => {
            const store = makeStore({
                runs: [run({ total: 10, passed: 8, failed: 2, duration: 5000 })],
                coverageHistory: [
                    {
                        timestamp: '2026-01-01T00:00:00.000Z',
                        project: 'test',
                        totalIssues: 10,
                        mappedIssues: 7,
                        coveragePct: 70,
                    },
                ],
            });
            const result = calculateHealthScore(store);
            expect(result.grade).toBe('good');
        });

        it('grades needs_attention at 50-69', () => {
            const store = makeStore({
                runs: [run({ total: 10, passed: 5, failed: 5, duration: 5000 })],
                coverageHistory: [
                    {
                        timestamp: '2026-01-01T00:00:00.000Z',
                        project: 'test',
                        totalIssues: 10,
                        mappedIssues: 5,
                        coveragePct: 50,
                    },
                ],
            });
            const result = calculateHealthScore(store);
            expect(result.grade).toBe('needs_attention');
        });

        it('grades critical below 50', () => {
            const store = makeStore();
            const result = calculateHealthScore(store);
            expect(result.overall).toBeLessThan(50);
            expect(result.grade).toBe('critical');
        });

        it('boundary: 89 is good, 90 is excellent', () => {
            const store89 = makeStore({
                runs: [run({ total: 100, passed: 89, failed: 11, duration: 5000 })],
                coverageHistory: [
                    {
                        timestamp: '2026-01-01T00:00:00.000Z',
                        project: 'test',
                        totalIssues: 10,
                        mappedIssues: 9,
                        coveragePct: 90,
                    },
                ],
            });
            const r89 = calculateHealthScore(store89, {
                weights: { passRate: 100, flakyRate: 0, coverage: 0, suiteSpeed: 0 },
                passRateTarget: 95,
            });
            expect(r89.overall).toBeLessThan(90);
            expect(r89.grade).toBe('good');

            const store90 = makeStore({
                runs: [run({ total: 100, passed: 91, failed: 9, duration: 5000 })],
                coverageHistory: [
                    {
                        timestamp: '2026-01-01T00:00:00.000Z',
                        project: 'test',
                        totalIssues: 10,
                        mappedIssues: 9,
                        coveragePct: 90,
                    },
                ],
            });
            const r90 = calculateHealthScore(store90, {
                weights: { passRate: 100, flakyRate: 0, coverage: 0, suiteSpeed: 0 },
                passRateTarget: 95,
            });
            expect(r90.overall).toBeGreaterThanOrEqual(90);
            expect(r90.grade).toBe('excellent');
        });

        it('boundary: 49 is critical, 50 is needs_attention', () => {
            const store49 = makeStore({
                runs: [run({ total: 10, passed: 5, failed: 5, duration: 5000 })],
            });
            const r49 = calculateHealthScore(store49, {
                weights: { passRate: 100, flakyRate: 0, coverage: 0, suiteSpeed: 0 },
                passRateTarget: 95,
            });
            expect(r49.overall).toBeLessThan(50);

            const store50 = makeStore({
                runs: [run({ total: 10, passed: 10, failed: 0, duration: 5000 })],
                coverageHistory: [
                    {
                        timestamp: '2026-01-01T00:00:00.000Z',
                        project: 'test',
                        totalIssues: 10,
                        mappedIssues: 8,
                        coveragePct: 80,
                    },
                ],
            });
            const r50 = calculateHealthScore(store50, {
                weights: { passRate: 0, flakyRate: 0, coverage: 100, suiteSpeed: 0 },
                coverageTarget: 90,
            });
            expect(r50.overall).toBeGreaterThanOrEqual(50);
        });
    });

    describe('config override', () => {
        it('accepts custom weights', () => {
            const store = makeStore({
                runs: [run({ total: 10, passed: 8, failed: 2, duration: 5000 })],
                coverageHistory: [
                    {
                        timestamp: '2026-01-01T00:00:00.000Z',
                        project: 'test',
                        totalIssues: 10,
                        mappedIssues: 9,
                        coveragePct: 90,
                    },
                ],
            });
            const resultDefault = calculateHealthScore(store);
            const resultCustom = calculateHealthScore(store, {
                weights: { passRate: 100, flakyRate: 0, coverage: 0, suiteSpeed: 0 },
            });
            expect(resultDefault.overall).not.toBe(resultCustom.overall);
        });

        it('accepts custom targets', () => {
            const store = makeStore({
                runs: [run({ total: 10, passed: 8, failed: 2, duration: 5000 })],
                coverageHistory: [
                    {
                        timestamp: '2026-01-01T00:00:00.000Z',
                        project: 'test',
                        totalIssues: 10,
                        mappedIssues: 9,
                        coveragePct: 90,
                    },
                ],
            });
            const defaultResult = calculateHealthScore(store);
            const lenientResult = calculateHealthScore(store, { passRateTarget: 80 });
            expect(lenientResult.dimensions.passRate.score).toBeGreaterThan(defaultResult.dimensions.passRate.score);
        });
    });

    describe('edge: all passing with 0% flaky', () => {
        it('scores 100 in every dimension with ideal metrics', () => {
            const runs = Array.from({ length: 20 }, (_, i) =>
                run({
                    timestamp: `2026-01-${i + 1}T00:00:00.000Z`,
                    total: 100,
                    passed: 100,
                    failed: 0,
                    duration: 20000,
                    tests: Array.from({ length: 100 }, (_, j) => testT(`Test${j}`, 'passed')),
                }),
            );
            const store = makeStore({
                runs,
                coverageHistory: [
                    {
                        timestamp: '2026-01-20T00:00:00.000Z',
                        project: 'test',
                        totalIssues: 100,
                        mappedIssues: 95,
                        coveragePct: 95,
                    },
                ],
            });
            const result = calculateHealthScore(store, { minRuns: 2 });
            expect(result.dimensions.passRate.score).toBe(100);
            expect(result.dimensions.flakyRate.score).toBe(100);
            expect(result.dimensions.coverage.score).toBe(100);
            expect(result.dimensions.suiteSpeed.score).toBe(100);
            expect(result.qualityGate).toBe('pass');
            expect(result.grade).toBe('excellent');
        });
    });

    describe('edge: everything failing', () => {
        it('scores 0 and quality gate fails', () => {
            const store = makeStore({
                runs: [
                    run({
                        total: 100,
                        passed: 0,
                        failed: 100,
                        duration: 2000000,
                        tests: Array.from({ length: 100 }, (_, j) => testT(`Test${j}`, 'failed')),
                    }),
                ],
                coverageHistory: [
                    {
                        timestamp: '2026-01-01T00:00:00.000Z',
                        project: 'test',
                        totalIssues: 100,
                        mappedIssues: 5,
                        coveragePct: 5,
                    },
                ],
            });
            const result = calculateHealthScore(store);
            expect(result.dimensions.passRate.score).toBe(0);
            expect(result.dimensions.flakyRate.score).toBe(100);
            expect(result.dimensions.coverage.score).toBe(0);
            expect(result.dimensions.suiteSpeed.score).toBe(0);
            expect(result.qualityGate).toBe('fail');
            expect(result.grade).toBe('critical');
        });
    });
});
