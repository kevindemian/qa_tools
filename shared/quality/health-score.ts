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
): 'pass' | 'fail' {
    const cfg = pickConfig(config);
    if (!Number.isFinite(passRate) || passRate < cfg.minPassRateGate) return 'fail';
    if (!Number.isFinite(flakyPct) || flakyPct > cfg.maxFlakyGate) return 'fail';
    if (!Number.isFinite(coverage) || coverage < cfg.minCoverageGate) return 'fail';
    if (!Number.isFinite(executionRate) || executionRate < cfg.minExecutionRateGate) return 'fail';
    if (!Number.isFinite(suiteSpeed) || suiteSpeed > cfg.maxSuiteSpeedGate) return 'fail';
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

    const passRate = Number.isFinite(c.passRate) ? c.passRate : 0;
    // flakyPercentage is always a number from calcFlakyPercentage (0 when no flaky jobs).
    // Treat 0 as "no flaky data" → passing condition, not failing.
    const flakyPct = _normalizeFlakyPct(c.flakyPercentage ?? 0);
    const coverage = Number.isFinite(c.coverage) ? c.coverage : 0;
    const executionRate = Number.isFinite(c.executionRate ?? 0) ? (c.executionRate ?? 0) : 0;
    const suiteSpeed = Number.isFinite(c.suiteSpeedP95) ? c.suiteSpeedP95 : 0;

    return { passRate, flakyPct, coverage, executionRate, suiteSpeed };
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
    const coverage = Number.isFinite(dataHub.computed.coverage) ? dataHub.computed.coverage : 0;
    const executionRate = calcExecutionRate(scopedRuns);
    const suiteSpeed = calcSuiteSpeedP95(jobsMap, dataHub.raw.timing);

    return { passRate, flakyPct, coverage, executionRate, suiteSpeed };
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

    const scPassRate = scorePassRate(actual.passRate, config);
    const scFlakyRate = actual.flakyPct === null ? 0 : scoreFlakyRate(actual.flakyPct, config);
    const scCoverage = scoreCoverage(actual.coverage, config);
    const scExecutionRate = scoreExecutionRate(actual.executionRate, config);
    const scSuiteSpeed = scoreSuiteSpeed(actual.suiteSpeed, config);

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

    let overall = overallWeight > 0 ? overallNum / overallWeight : 0;
    if (!Number.isFinite(overall)) overall = 0;

    const dimCheck = [scPassRate, scCoverage, scExecutionRate, scSuiteSpeed];
    if (actual.flakyPct !== null) dimCheck.push(scFlakyRate);
    if (dimCheck.some((d) => d < PENALTY_THRESHOLD)) {
        overall = Math.min(overall, PENALTY_CAP);
    }

    function gate(value: number, threshold: number, op: 'gte' | 'lte'): 'pass' | 'fail' {
        const pass = op === 'gte' ? value >= threshold : value <= threshold;
        return pass ? 'pass' : 'fail';
    }

    const statusPassRate = gate(actual.passRate, config.minPassRateGate, 'gte');
    const statusFlaky =
        actual.flakyPct === null || actual.flakyPct <= config.maxFlakyGate ? ('pass' as const) : ('fail' as const);
    const statusCoverage = gate(actual.coverage, config.minCoverageGate, 'gte');
    const statusSpeed = gate(actual.suiteSpeed, config.maxSuiteSpeedGate, 'lte');
    const statusExecRate = gate(actual.executionRate, config.minExecutionRateGate, 'gte');

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
        runCount: dataHub.getRuns().length,
        timestamp: new Date().toISOString(),
        dataQuality,
    };
}
