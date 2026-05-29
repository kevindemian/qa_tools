/** Health score calculation: 0-100 composite of pass rate, flaky rate, coverage, and suite speed. */
import type { MetricsStore } from './metrics';
import type { HealthScoreResult, HealthScoreGrade, HealthScoreDimensions } from './types';

export interface HealthScoreConfig {
    weights: { passRate: number; flakyRate: number; coverage: number; suiteSpeed: number };
    passRateTarget: number;
    flakyThreshold: number;
    coverageTarget: number;
    suiteSpeedTarget: number;
    minRuns: number;
    windowSize: number;
    minCoverageGate: number;
    minPassRateGate: number;
    maxFlakyGate: number;
    maxSuiteSpeedGate: number;
}

interface ActualMetrics {
    passRate: number;
    flakyPct: number;
    coverage: number;
    suiteSpeed: number;
}

const DEFAULTS: HealthScoreConfig = {
    weights: { passRate: 30, flakyRate: 30, coverage: 25, suiteSpeed: 15 },
    passRateTarget: 95,
    flakyThreshold: 0.3,
    coverageTarget: 90,
    suiteSpeedTarget: 2,
    minRuns: 10,
    windowSize: 20,
    minCoverageGate: 70,
    minPassRateGate: 80,
    maxFlakyGate: 10,
    maxSuiteSpeedGate: 8,
};

function pickConfig(options?: Partial<HealthScoreConfig>): HealthScoreConfig {
    const w = DEFAULTS.weights;
    const ow = options?.weights;
    return {
        ...DEFAULTS,
        ...options,
        weights: {
            passRate: ow?.passRate ?? w.passRate,
            flakyRate: ow?.flakyRate ?? w.flakyRate,
            coverage: ow?.coverage ?? w.coverage,
            suiteSpeed: ow?.suiteSpeed ?? w.suiteSpeed,
        },
    };
}

function computeActualMetrics(store: MetricsStore, config: HealthScoreConfig): ActualMetrics {
    const runs = store.runs.slice(-config.windowSize);
    const n = runs.length;

    let weightedPassSum = 0;
    let weightTotal = 0;
    for (let i = 0; i < n; i++) {
        const run = runs[i]!;
        const passRate = run.total > 0 ? (run.passed / run.total) * 100 : 0;
        const weight = Math.exp((i - n + 1) / Math.max(n / 2, 1));
        weightedPassSum += passRate * weight;
        weightTotal += weight;
    }
    const actualPassRate = weightTotal > 0 ? weightedPassSum / weightTotal : 0;

    const testMap = new Map<string, { pass: number; fail: number }>();
    for (const run of runs) {
        for (const t of run.tests) {
            const entry = testMap.get(t.title) || { pass: 0, fail: 0 };
            if (t.state === 'passed') entry.pass++;
            else if (t.state === 'failed') entry.fail++;
            testMap.set(t.title, entry);
        }
    }
    let flakyCount = 0;
    let totalConsidered = 0;
    for (const [, counts] of testMap) {
        const totalAppearances = counts.pass + counts.fail;
        if (totalAppearances < config.minRuns) continue;
        totalConsidered++;
        if (counts.fail > 0 && counts.pass > 0) flakyCount++;
    }
    const actualFlakyPct = totalConsidered > 0 ? (flakyCount / totalConsidered) * 100 : 0;

    const history = store.coverageHistory;
    const actualCoverage = history && history.length > 0 ? history[history.length - 1]!.coveragePct : 0;

    const speedRuns = runs.filter((r) => r.total > 0);
    let totalDuration = 0;
    let totalTests = 0;
    for (const run of speedRuns) {
        totalDuration += run.duration;
        totalTests += run.total;
    }
    const actualSuiteSpeed = totalTests > 0 ? totalDuration / totalTests / 1000 : 0;

    return {
        passRate: actualPassRate,
        flakyPct: actualFlakyPct,
        coverage: actualCoverage,
        suiteSpeed: actualSuiteSpeed,
    };
}

function scorePassRate(actual: number, config: HealthScoreConfig): number {
    if (actual >= config.passRateTarget) return 100;
    if (actual <= 50) return 0;
    return ((actual - 50) / (config.passRateTarget - 50)) * 100;
}

function scoreFlakyRate(actual: number): number {
    if (actual <= 0) return 100;
    if (actual >= 20) return 0;
    return 100 - (actual / 20) * 100;
}

function scoreCoverage(actual: number, config: HealthScoreConfig): number {
    if (actual >= config.coverageTarget) return 100;
    if (actual <= 30) return 0;
    return ((actual - 30) / (config.coverageTarget - 30)) * 100;
}

function scoreSuiteSpeed(actual: number, config: HealthScoreConfig): number {
    if (actual <= config.suiteSpeedTarget) return 100;
    if (actual >= 10) return 0;
    return 100 - ((actual - config.suiteSpeedTarget) / (10 - config.suiteSpeedTarget)) * 100;
}

function computeGrade(score: number): HealthScoreGrade {
    if (score >= 90) return 'excellent';
    if (score >= 70) return 'good';
    if (score >= 50) return 'needs_attention';
    return 'critical';
}

export function calculateHealthScore(
    metricsStore: MetricsStore,
    options?: Partial<HealthScoreConfig>,
): HealthScoreResult {
    const config = pickConfig(options);
    const actual = computeActualMetrics(metricsStore, config);

    const scPassRate = scorePassRate(actual.passRate, config);
    const scFlakyRate = scoreFlakyRate(actual.flakyPct);
    const scCoverage = scoreCoverage(actual.coverage, config);
    const scSuiteSpeed = scoreSuiteSpeed(actual.suiteSpeed, config);

    const totalWeight =
        config.weights.passRate + config.weights.flakyRate + config.weights.coverage + config.weights.suiteSpeed;
    const effectiveTotal = totalWeight > 0 ? totalWeight : 100;

    let overall =
        (scPassRate * config.weights.passRate +
            scFlakyRate * config.weights.flakyRate +
            scCoverage * config.weights.coverage +
            scSuiteSpeed * config.weights.suiteSpeed) /
        effectiveTotal;

    if ([scPassRate, scFlakyRate, scCoverage, scSuiteSpeed].some((d) => d < 40)) {
        overall = Math.min(overall, 60);
    }

    const statusPassRate: 'pass' | 'fail' = actual.passRate >= config.minPassRateGate ? 'pass' : 'fail';
    const statusFlaky: 'pass' | 'fail' = actual.flakyPct <= config.maxFlakyGate ? 'pass' : 'fail';
    const statusCoverage: 'pass' | 'fail' = actual.coverage >= config.minCoverageGate ? 'pass' : 'fail';
    const statusSpeed: 'pass' | 'fail' = actual.suiteSpeed <= config.maxSuiteSpeedGate ? 'pass' : 'fail';

    const qcFail =
        statusPassRate === 'fail' || statusFlaky === 'fail' || statusCoverage === 'fail' || statusSpeed === 'fail';

    const dims: HealthScoreDimensions = {
        passRate: { score: Math.round(scPassRate), status: statusPassRate },
        flakyRate: { score: Math.round(scFlakyRate), status: statusFlaky },
        coverage: { score: Math.round(scCoverage), status: statusCoverage },
        suiteSpeed: { score: Math.round(scSuiteSpeed), status: statusSpeed },
    };

    return {
        overall: Math.round(overall),
        grade: computeGrade(overall),
        qualityGate: qcFail ? 'fail' : 'pass',
        dimensions: dims,
        runCount: metricsStore.runs.length,
        timestamp: new Date().toISOString(),
    };
}
