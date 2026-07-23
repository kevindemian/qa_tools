/**
 * Health score calculation: 0-100 composite of pass rate, flaky rate, coverage,
 * execution rate, and suite speed — aligned with DORA, ISO 25023, and ISTQB standards.
 *
 * DataHub is the SOLE source of truth for all metrics.
 * MetricsStore is NOT used — all data comes from DataHub.computed.*.
 *
 * DORA State of DevOps 2025: Pass Rate Elite threshold ≥95%
 * ISO/IEC 25023:2016: Coverage measures framework
 * ISTQB CTFL: Execution Rate formula: (passed+failed)/total
 * Industry (QASkills.sh, Kualitatem): Flaky Rate target <3%, action threshold >5%
 * ThinkSys / Google SRE: Suite Speed target p95 <1000ms
 * ISO/IEC 25020:2019 Annex D: Normalized measurement function — linear interpolation
 * between target (score=100) and floor (score=0).
 */
import type { DataHub } from '../types/data-hub.js';
import type { HealthScoreResult, HealthScoreGrade, HealthScoreDimensions, HealthScoreProvenance } from '../types.js';
import { summarizeDataQuality } from './data-quality.js';
import { extractErrorMessage, humanizeError } from '../ui/prompt-errors.js';
import { rootLogger } from '../logger.js';
import { calcPipelinePassRate } from '../data-hub/compute/pass-rate.js';
import { calcFlakyFromPipelineRuns } from '../data-hub/compute/flaky-rate.js';
import { calcFlakyPercentage } from '../data-hub/compute/flaky-percentage.js';
import { calcExecutionRate } from '../data-hub/compute/execution-rate.js';
import { calcSuiteSpeedP95 } from '../data-hub/compute/suite-speed.js';
import type { PipelineRun } from '../types/ci-cd.js';

export type GateStatus = 'pass' | 'fail' | 'unknown';

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
    /** If set, overrides coverage from DataHub.computed. Used for layered coverage resolution. */
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
    /** Per-metric availability — false when the underlying metric is missing/non-finite. */
    available: {
        passRate: boolean;
        flaky: boolean;
        coverage: boolean;
        executionRate: boolean;
        suiteSpeed: boolean;
    };
}

/** Per-dimension availability contract for {@link evaluateQualityGate}. */
export interface GateAvailability {
    passRate: boolean;
    flaky: boolean;
    coverage: boolean;
    executionRate: boolean;
    suiteSpeed: boolean;
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
    const clamp = (v: number | undefined, fallback: number) => {
        const n = v ?? fallback;
        return Number.isFinite(n) && n >= 0 ? n : fallback;
    };
    return {
        ...DEFAULTS,
        ...options,
        weights: {
            passRate: clamp(ow?.passRate, w.passRate),
            flakyRate: clamp(ow?.flakyRate, w.flakyRate),
            coverage: clamp(ow?.coverage, w.coverage),
            executionRate: clamp(ow?.executionRate, w.executionRate),
            suiteSpeed: clamp(ow?.suiteSpeed, w.suiteSpeed),
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
    availability?: GateAvailability,
): GateStatus {
    const cfg = pickConfig(config);
    const av = availability ?? {
        passRate: true,
        flaky: true,
        coverage: true,
        executionRate: true,
        suiteSpeed: true,
    };

    // Priority: a present-but-failing dimension is a hard 'fail'; a MISSING
    // dimension (data outage) is 'unknown' — never silently forced to 'fail'
    // (user decision + AGENTS.md §24/§25).
    // A present-but-failing dimension is a hard 'fail'; a MISSING dimension
    // (non-finite value OR explicitly unavailable) is 'unknown' — never silently
    // forced to 'fail' (user decision + AGENTS.md §24/§25).
    const check = (isAvailable: boolean, value: number, ok: boolean): GateStatus => {
        if (!isAvailable || !Number.isFinite(value)) return 'unknown';
        return ok ? 'pass' : 'fail';
    };

    const results: Array<GateStatus> = [
        check(av.passRate, passRate, passRate >= cfg.minPassRateGate),
        check(av.flaky, flakyPct, flakyPct <= cfg.maxFlakyGate),
        check(av.coverage, coverage, coverage >= cfg.minCoverageGate),
        check(av.executionRate, executionRate, executionRate >= cfg.minExecutionRateGate),
        check(av.suiteSpeed, suiteSpeed, suiteSpeed <= cfg.maxSuiteSpeedGate),
    ];

    if (results.some((r) => r === 'fail')) return 'fail';
    if (results.some((r) => r === 'unknown')) return 'unknown';
    return 'pass';
}

/** Compute actual metrics — DataHub.computed is the ONLY source. */
function computeActualMetrics(dataHub: DataHub, branch?: string): ActualMetrics {
    // Branch scope (Gap 3): when a branch is requested, compute the dimensions from the
    // branch-filtered runs/jobs so the score reflects THAT branch, not the whole repo.
    // Coverage has no branch-scoped source in the model, so the repo-wide value is used
    // (same limitation as the rest of the system) — documented, not masked.
    if (branch != null) {
        return computeBranchMetrics(dataHub, branch);
    }

    const c = dataHub.computed;

    const passRate = c.passRate;
    // flakyPercentage is always a number from calcFlakyPercentage (0 when no flaky jobs).
    // Treat 0 as "no flaky data" → passing condition, not failing.
    const flakyPct = _normalizeFlakyPct(c.flakyPercentage ?? 0);
    const coverage = c.coverage;
    const executionRate = c.executionRate ?? 0;
    const suiteSpeed = c.suiteSpeedP95;

    return {
        passRate,
        flakyPct,
        coverage,
        executionRate,
        suiteSpeed,
        available: {
            passRate: Number.isFinite(passRate),
            flaky: flakyPct !== null && Number.isFinite(flakyPct),
            coverage: Number.isFinite(coverage),
            executionRate: Number.isFinite(c.executionRate ?? NaN),
            suiteSpeed: Number.isFinite(suiteSpeed),
        },
    };
}

/**
 * Compute dimensions from branch-filtered runs using the SSOT compute layer.
 * Honest branch scoping: passRate/flaky/executionRate/suiteSpeed are branch-specific;
 * coverage is repo-wide (no branch source exists).
 */
function computeBranchMetrics(dataHub: DataHub, branch: string): ActualMetrics {
    const allRuns = dataHub.getRuns();
    const scopedRuns: PipelineRun[] = allRuns.filter((r) => (r.head_branch ?? r.ref) === branch);
    const jobsMap = dataHub.raw.jobs;

    const passRate = calcPipelinePassRate(scopedRuns, branch);
    const flakyResults = calcFlakyFromPipelineRuns(scopedRuns, jobsMap, branch);
    const flakyPct = _normalizeFlakyPct(calcFlakyPercentage(flakyResults, scopedRuns, jobsMap));
    const coverage = dataHub.computed.coverage;
    const executionRate = calcExecutionRate(scopedRuns);
    const suiteSpeed = calcSuiteSpeedP95(jobsMap, dataHub.raw.timing);

    return {
        passRate,
        flakyPct,
        coverage,
        executionRate,
        suiteSpeed,
        available: {
            passRate: Number.isFinite(passRate),
            flaky: flakyPct !== null && Number.isFinite(flakyPct),
            coverage: Number.isFinite(coverage),
            executionRate: Number.isFinite(executionRate),
            suiteSpeed: Number.isFinite(suiteSpeed),
        },
    };
}

function _normalizeFlakyPct(actualFlakyPct: number | null): number | null {
    if (actualFlakyPct === null) return null;
    if (!Number.isFinite(actualFlakyPct)) return null;
    // 0 means no flaky jobs detected → valid value, not missing data
    return actualFlakyPct;
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
        targetKey: 'flakyThreshold',
        gateKey: 'maxFlakyGate',
    },
    {
        key: 'coverage',
        label: 'Cobertura de testes Jira (steps)',
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

/**
 * Calculate composite health score from DataHub metrics.
 *
 * @param options - Configuration overrides AND DataHub (required). DataHub is the sole source of truth.
 * @returns HealthScoreResult with overall score, grade, dimensions, and provenance.
 */
export function calculateHealthScore(
    options: Partial<HealthScoreConfig> & { dataHub: DataHub; branch?: string },
): HealthScoreResult {
    try {
        return _computeHealthScore(options);
    } catch (err: unknown) {
        const raw = extractErrorMessage(err);
        const known = humanizeError(raw);
        const errorMsg = known ? known.msg : raw;
        rootLogger.error('Health score error — falha ao computar métricas do DataHub: ' + errorMsg);
        throw err;
    }
}

function _computeHealthScore(
    options: Partial<HealthScoreConfig> & { dataHub: DataHub; branch?: string },
): HealthScoreResult {
    const config = pickConfig(options);
    const dataHub = options.dataHub;
    const actual = computeActualMetrics(dataHub, options.branch);
    const dataQuality = summarizeDataQuality(dataHub);

    const { overall, dimensions } = _buildHealthDimensions(actual, config);
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
            actual.available,
        ),
        dimensions,
        provenance: _buildProvenance(options),
        runCount: dataHub.getRuns().length,
        timestamp: new Date().toISOString(),
        dataQuality,
    };
}

function gate(value: number, threshold: number, op: 'gte' | 'lte'): 'pass' | 'fail' {
    const pass = op === 'gte' ? value >= threshold : value <= threshold;
    return pass ? 'pass' : 'fail';
}

function dimGateStatus(available: boolean, value: number, threshold: number, op: 'gte' | 'lte'): GateStatus {
    if (!available) return 'unknown';
    return gate(value, threshold, op);
}

function flakyStatus(flakyPct: number | null, maxFlaky: number): GateStatus {
    if (flakyPct === null) return 'unknown';
    return flakyPct <= maxFlaky ? 'pass' : 'fail';
}

interface DimensionScores {
    passRate: number;
    flakyRate: number;
    coverage: number;
    executionRate: number;
    suiteSpeed: number;
}

function _computeCompositeScore(actual: ActualMetrics, config: HealthScoreConfig, scores: DimensionScores): number {
    let overallWeight = 0;
    let overallNum = 0;

    const addDim = (score: number, weight: number) => {
        overallNum += score * weight;
        overallWeight += weight;
    };

    // Renormalize over AVAILABLE dimensions only — a missing metric must never be
    // silently scored 0 and dragged into the composite (AGENTS.md §25).
    if (actual.available.passRate) addDim(scores.passRate, config.weights.passRate);
    if (actual.flakyPct !== null) addDim(scores.flakyRate, config.weights.flakyRate);
    if (actual.available.coverage) addDim(scores.coverage, config.weights.coverage);
    if (actual.available.executionRate) addDim(scores.executionRate, config.weights.executionRate);
    if (actual.available.suiteSpeed) addDim(scores.suiteSpeed, config.weights.suiteSpeed);

    let overall = overallWeight > 0 ? overallNum / overallWeight : 0;
    if (!Number.isFinite(overall)) overall = 0;

    const dimCheck: number[] = [];
    if (actual.available.passRate) dimCheck.push(scores.passRate);
    if (actual.available.coverage) dimCheck.push(scores.coverage);
    if (actual.available.executionRate) dimCheck.push(scores.executionRate);
    if (actual.available.suiteSpeed) dimCheck.push(scores.suiteSpeed);
    if (actual.flakyPct !== null) dimCheck.push(scores.flakyRate);
    if (dimCheck.some((d) => d < PENALTY_THRESHOLD)) {
        overall = Math.min(overall, PENALTY_CAP);
    }
    return overall;
}

function _buildDimensions(
    actual: ActualMetrics,
    config: HealthScoreConfig,
    scores: DimensionScores,
): HealthScoreDimensions {
    const statusPassRate = dimGateStatus(actual.available.passRate, actual.passRate, config.minPassRateGate, 'gte');
    const statusFlaky = flakyStatus(actual.flakyPct, config.maxFlakyGate);
    const statusCoverage = dimGateStatus(actual.available.coverage, actual.coverage, config.minCoverageGate, 'gte');
    const statusSpeed = dimGateStatus(actual.available.suiteSpeed, actual.suiteSpeed, config.maxSuiteSpeedGate, 'lte');
    const statusExecRate = dimGateStatus(
        actual.available.executionRate,
        actual.executionRate,
        config.minExecutionRateGate,
        'gte',
    );
    return {
        passRate: { score: Math.round(scores.passRate), status: statusPassRate, available: actual.available.passRate },
        flakyRate: { score: Math.round(scores.flakyRate), status: statusFlaky, available: actual.flakyPct !== null },
        coverage: { score: Math.round(scores.coverage), status: statusCoverage, available: actual.available.coverage },
        suiteSpeed: {
            score: Math.round(scores.suiteSpeed),
            status: statusSpeed,
            available: actual.available.suiteSpeed,
        },
        executionRate: {
            score: Math.round(scores.executionRate),
            status: statusExecRate,
            available: actual.available.executionRate,
        },
    };
}

function _buildHealthDimensions(
    actual: ActualMetrics,
    config: HealthScoreConfig,
): { overall: number; dimensions: HealthScoreDimensions } {
    const scores: DimensionScores = {
        passRate: actual.available.passRate ? scorePassRate(actual.passRate, config) : 0,
        flakyRate: actual.flakyPct === null ? 0 : scoreFlakyRate(actual.flakyPct, config),
        coverage: actual.available.coverage ? scoreCoverage(actual.coverage, config) : 0,
        executionRate: actual.available.executionRate ? scoreExecutionRate(actual.executionRate, config) : 0,
        suiteSpeed: actual.available.suiteSpeed ? scoreSuiteSpeed(actual.suiteSpeed, config) : 0,
    };
    const overall = _computeCompositeScore(actual, config, scores);
    const dimensions = _buildDimensions(actual, config, scores);
    return { overall, dimensions };
}
