/**
 * Health score calculation: 0-100 composite of pass rate, flaky rate, coverage,
 * execution rate, and suite speed — aligned with DORA, ISO 25023, and ISTQB standards.
 *
 * DORA State of DevOps 2025: Pass Rate Elite threshold ≥95%
 * ISO/IEC 25023:2016: Coverage measures framework
 * ISTQB CTFL: Execution Rate formula: (passed+failed)/total
 * Industry (QASkills.sh, Kualitatem): Flaky Rate target <3%, action threshold >5%
 * ThinkSys / Google SRE: Suite Speed target p95 <1000ms
 * ISO/IEC 25020:2019 Annex D: Normalized measurement function — linear interpolation
 * between target (score=100) and floor (score=0).
 */
import type { MetricsStore, MetricsRun } from './metrics.js';
import type { HealthScoreResult, HealthScoreGrade, HealthScoreDimensions, HealthScoreProvenance } from './types.js';

export interface HealthScoreConfig {
    weights: { passRate: number; flakyRate: number; coverage: number; executionRate: number; suiteSpeed: number };
    passRateTarget: number;
    flakyThreshold: number;
    coverageTarget: number;
    executionRateTarget: number;
    suiteSpeedTarget: number;
    minRuns: number;
    windowSize: number;
    minCoverageGate: number;
    minPassRateGate: number;
    minExecutionRateGate: number;
    maxFlakyGate: number;
    maxSuiteSpeedGate: number;
    /** Floor below which coverage score is 0. Default 30. */
    coverageFloor: number;
    /** If set, overrides coverage from MetricsStore. Used for layered coverage resolution. */
    coverageOverride?: number;
    /** Override grade boundaries: { excellent: 90, good: 80, needs_attention: 70, poor: 60 } */
    gradeBoundaries?: Record<HealthScoreGrade, number>;
}

interface ActualMetrics {
    passRate: number;
    flakyPct: number | null;
    coverage: number;
    executionRate: number;
    suiteSpeed: number;
}

const DEFAULTS: HealthScoreConfig = {
    weights: { passRate: 30, flakyRate: 20, coverage: 25, executionRate: 15, suiteSpeed: 10 },
    passRateTarget: 95,
    flakyThreshold: 3,
    coverageTarget: 80,
    executionRateTarget: 95,
    suiteSpeedTarget: 1000,
    minRuns: 10,
    windowSize: 20,
    minCoverageGate: 70,
    coverageFloor: 30,
    minPassRateGate: 80,
    minExecutionRateGate: 80,
    maxFlakyGate: 5,
    maxSuiteSpeedGate: 3000,
};

const DEFAULT_GRADE_BOUNDARIES: Record<HealthScoreGrade, number> = {
    excellent: 90,
    good: 80,
    needs_attention: 70,
    poor: 60,
    critical: 0,
};

/** Floor below which pass rate / execution rate score is 0. */
const SCORE_FLOOR = 50;
/** If any dimension score is below this threshold, overall score is capped. */
const PENALTY_THRESHOLD = 40;
/** Maximum overall score when penalty threshold is triggered. */
const PENALTY_CAP = 60;

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
            executionRate: ow?.executionRate ?? w.executionRate,
            suiteSpeed: ow?.suiteSpeed ?? w.suiteSpeed,
        },
    };
}

export function evaluateQualityGate(
    passRate: number,
    flakyPct: number,
    coverage: number,
    executionRate: number,
    suiteSpeed: number,
    config?: Partial<HealthScoreConfig>,
): 'pass' | 'fail' {
    const cfg = pickConfig(config);
    if (passRate < cfg.minPassRateGate) return 'fail';
    if (flakyPct > cfg.maxFlakyGate) return 'fail';
    if (coverage < cfg.minCoverageGate) return 'fail';
    if (executionRate < cfg.minExecutionRateGate) return 'fail';
    if (suiteSpeed > cfg.maxSuiteSpeedGate) return 'fail';
    return 'pass';
}

function _computeFlakyRate(runs: MetricsRun[], config: HealthScoreConfig): number | null {
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
    return totalConsidered > 0 ? (flakyCount / totalConsidered) * 100 : null;
}

function _computeExpWeighted(runs: MetricsRun[], n: number, getValue: (run: MetricsRun) => number): number {
    let weightedSum = 0;
    let weightTotal = 0;
    for (let i = 0; i < n; i++) {
        const run = runs[i];
        if (!run) continue;
        const value = getValue(run);
        const weight = Math.exp((i - n + 1) / Math.max(n / 2, 1));
        weightedSum += value * weight;
        weightTotal += weight;
    }
    return weightTotal > 0 ? weightedSum / weightTotal : 0;
}

function _computeSuiteSpeed(runs: MetricsRun[]): number {
    const allDurations: number[] = [];
    for (const run of runs) {
        for (const t of run.tests) {
            allDurations.push(t.duration);
        }
    }
    if (allDurations.length === 0) return 0;
    allDurations.sort((a, b) => a - b);
    const idx = Math.max(0, Math.ceil(allDurations.length * 0.95) - 1);
    return allDurations[idx] ?? 0;
}

function computeActualMetrics(store: MetricsStore, config: HealthScoreConfig): ActualMetrics {
    const runs = store.runs.slice(-config.windowSize);
    const n = runs.length;

    const actualPassRate = _computeExpWeighted(runs, n, (run) => {
        const executed = run.passed + run.failed;
        return executed > 0 ? (run.passed / executed) * 100 : 0;
    });
    const actualFlakyPct = _computeFlakyRate(runs, config);

    const actualExecutionRate = _computeExpWeighted(runs, n, (run) =>
        run.total > 0 ? ((run.passed + run.failed) / run.total) * 100 : 0,
    );

    const actualCoverage =
        config.coverageOverride !== undefined
            ? config.coverageOverride
            : store.coverageHistory && store.coverageHistory.length > 0
              ? (store.coverageHistory[store.coverageHistory.length - 1]?.coveragePct ?? 0)
              : 0;

    const actualSuiteSpeed = _computeSuiteSpeed(runs);

    return {
        passRate: actualPassRate,
        flakyPct: actualFlakyPct,
        coverage: actualCoverage,
        executionRate: actualExecutionRate,
        suiteSpeed: actualSuiteSpeed,
    };
}

function scorePassRate(actual: number, config: HealthScoreConfig): number {
    if (actual >= config.passRateTarget) return 100;
    if (actual <= SCORE_FLOOR) return 0;
    return ((actual - SCORE_FLOOR) / (config.passRateTarget - SCORE_FLOOR)) * 100;
}

function scoreFlakyRate(actual: number, config: HealthScoreConfig): number {
    if (config.maxFlakyGate === config.flakyThreshold) {
        return actual <= config.flakyThreshold ? 100 : 0;
    }
    if (actual <= config.flakyThreshold) return 100;
    if (actual >= config.maxFlakyGate) return 0;
    return 100 - ((actual - config.flakyThreshold) / (config.maxFlakyGate - config.flakyThreshold)) * 100;
}

function scoreCoverage(actual: number, config: HealthScoreConfig): number {
    if (actual >= config.coverageTarget) return 100;
    if (actual <= config.coverageFloor) return 0;
    return ((actual - config.coverageFloor) / (config.coverageTarget - config.coverageFloor)) * 100;
}

function scoreExecutionRate(actual: number, config: HealthScoreConfig): number {
    if (actual >= config.executionRateTarget) return 100;
    if (actual <= SCORE_FLOOR) return 0;
    return ((actual - SCORE_FLOOR) / (config.executionRateTarget - SCORE_FLOOR)) * 100;
}

function scoreSuiteSpeed(actual: number, config: HealthScoreConfig): number {
    if (config.maxSuiteSpeedGate === config.suiteSpeedTarget) {
        return actual <= config.suiteSpeedTarget ? 100 : 0;
    }
    if (actual <= config.suiteSpeedTarget) return 100;
    if (actual >= config.maxSuiteSpeedGate) return 0;
    return 100 - ((actual - config.suiteSpeedTarget) / (config.maxSuiteSpeedGate - config.suiteSpeedTarget)) * 100;
}

function computeGrade(score: number, boundaries?: Record<HealthScoreGrade, number>): HealthScoreGrade {
    const b = boundaries ?? DEFAULT_GRADE_BOUNDARIES;
    if (score >= b.excellent) return 'excellent';
    if (score >= b.good) return 'good';
    if (score >= b.needs_attention) return 'needs_attention';
    if (score >= b.poor) return 'poor';
    return 'critical';
}

const PROVENANCE_DIMENSIONS: Array<{
    key: keyof HealthScoreConfig['weights'];
    label: string;
    source: string;
    standard: string;
    formula: string;
    thresholdBasis: string;
    targetKey?: keyof HealthScoreConfig;
    gateKey?: keyof HealthScoreConfig;
}> = [
    {
        key: 'passRate',
        label: 'Pass Rate',
        source: 'DORA State of DevOps 2025',
        standard: 'DORA',
        formula: 'passed/(passed+failed)×100',
        thresholdBasis: 'Elite: Change Failure Rate <5% → passRate ≥95%',
        targetKey: 'passRateTarget',
    },
    {
        key: 'flakyRate',
        label: 'Flaky Rate',
        source: 'QASkills.sh / Kualitatem',
        standard: 'Industry Best Practice',
        formula: '(tests with both pass and fail outcomes) / (total tests with ≥minRuns appearances)×100',
        thresholdBasis: 'Action threshold >5%, target <3%',
    },
    {
        key: 'coverage',
        label: 'Coverage',
        source: 'ISO/IEC 25023:2016',
        standard: 'ISO/IEC 25023:2016',
        formula: 'mappedIssues/totalIssues×100',
        thresholdBasis: 'Target ≥80%, floor 30%',
        targetKey: 'coverageTarget',
    },
    {
        key: 'executionRate',
        label: 'Execution Rate',
        source: 'ISTQB CTFL',
        standard: 'ISTQB CTFL',
        formula: '(passed+failed)/total×100',
        thresholdBasis: 'Target ≥95%, floor 50%',
        targetKey: 'executionRateTarget',
    },
    {
        key: 'suiteSpeed',
        label: 'Suite Speed',
        source: 'ThinkSys / Google SRE',
        standard: 'Google SRE Best Practice',
        formula: 'p95 individual test duration (ms)',
        thresholdBasis: 'Target ≤1000ms, max 3000ms',
        targetKey: 'suiteSpeedTarget',
    },
];

function _isOverridden(options: Partial<HealthScoreConfig> | undefined, key: keyof HealthScoreConfig): boolean {
    if (!options) return false;
    return key in options;
}

function _buildProvenance(options?: Partial<HealthScoreConfig>): HealthScoreProvenance {
    return PROVENANCE_DIMENSIONS.map((dim) => {
        const overridden = dim.targetKey ? _isOverridden(options, dim.targetKey) : false;
        return {
            dimension: dim.key,
            source: dim.source,
            standard: dim.standard,
            formula: dim.formula,
            thresholdBasis: dim.thresholdBasis,
            configurable: dim.targetKey !== undefined,
            ...(overridden ? { overridden: true } : {}),
        };
    });
}

export function calculateHealthScore(
    metricsStore: MetricsStore,
    options?: Partial<HealthScoreConfig>,
): HealthScoreResult {
    const config = pickConfig(options);
    const actual = computeActualMetrics(metricsStore, config);
    const runsEmpty = metricsStore.runs.length === 0;

    const scPassRate = runsEmpty ? 0 : scorePassRate(actual.passRate, config);
    const scFlakyRate = runsEmpty || actual.flakyPct === null ? 0 : scoreFlakyRate(actual.flakyPct, config);
    const scCoverage = scoreCoverage(actual.coverage, config);
    const scExecutionRate = runsEmpty ? 0 : scoreExecutionRate(actual.executionRate, config);
    const scSuiteSpeed = runsEmpty ? 0 : scoreSuiteSpeed(actual.suiteSpeed, config);

    let overallWeight = 0;
    let overallNum = 0;

    const addDim = (score: number, weight: number) => {
        overallNum += score * weight;
        overallWeight += weight;
    };

    addDim(scPassRate, config.weights.passRate);
    if (actual.flakyPct !== null) addDim(scFlakyRate, config.weights.flakyRate);
    addDim(scCoverage, config.weights.coverage);
    addDim(scExecutionRate, config.weights.executionRate);
    addDim(scSuiteSpeed, config.weights.suiteSpeed);

    const effectiveTotal = overallWeight > 0 ? overallWeight : 100;
    let overall = effectiveTotal > 0 ? overallNum / effectiveTotal : 0;

    const dimCheck = [scPassRate, scCoverage, scExecutionRate, scSuiteSpeed];
    if (actual.flakyPct !== null) dimCheck.push(scFlakyRate);
    if (dimCheck.some((d) => d < PENALTY_THRESHOLD)) {
        overall = Math.min(overall, PENALTY_CAP);
    }

    const statusPassRate: 'pass' | 'fail' = actual.passRate >= config.minPassRateGate ? 'pass' : 'fail';
    const statusFlaky: 'pass' | 'fail' =
        actual.flakyPct !== null && actual.flakyPct <= config.maxFlakyGate ? 'pass' : 'fail';
    const statusCoverage: 'pass' | 'fail' = actual.coverage >= config.minCoverageGate ? 'pass' : 'fail';
    const statusSpeed: 'pass' | 'fail' = actual.suiteSpeed <= config.maxSuiteSpeedGate ? 'pass' : 'fail';
    const statusExecRate: 'pass' | 'fail' = actual.executionRate >= config.minExecutionRateGate ? 'pass' : 'fail';

    const dims: HealthScoreDimensions = {
        passRate: { score: Math.round(scPassRate), status: statusPassRate },
        flakyRate: { score: Math.round(scFlakyRate), status: statusFlaky },
        coverage: { score: Math.round(scCoverage), status: statusCoverage },
        suiteSpeed: { score: Math.round(scSuiteSpeed), status: statusSpeed },
        executionRate: { score: Math.round(scExecutionRate), status: statusExecRate },
    };

    return {
        overall: Math.round(overall),
        grade: computeGrade(Math.round(overall), config.gradeBoundaries),
        qualityGate: evaluateQualityGate(
            actual.passRate,
            actual.flakyPct ?? 0,
            actual.coverage,
            actual.executionRate,
            actual.suiteSpeed,
            config,
        ),
        dimensions: dims,
        provenance: _buildProvenance(options),
        runCount: metricsStore.runs.length,
        timestamp: new Date().toISOString(),
    };
}
