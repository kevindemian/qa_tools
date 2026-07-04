/**
 * Data Hub — Compute function configuration types.
 *
 * Defines thresholds, weights, and configuration for compute functions.
 * These are pure value types with no runtime dependencies.
 */

/** Configuration for scoring functions (linear interpolation). */
export interface ScoringConfig {
    /** Pass rate target (0-100). Score=100 at target, score=0 at floor. */
    passRateTarget: number;
    /** Floor for pass rate scoring. Below this, score=0. */
    passRateFloor: number;
    /** Flaky rate threshold (0-100). Score=100 at 0%, score=0 at threshold. */
    flakyThreshold: number;
    /** Coverage target (0-100). Score=100 at target, score=0 at floor. */
    coverageTarget: number;
    /** Floor for coverage scoring. */
    coverageFloor: number;
    /** Execution rate target (0-100). */
    executionRateTarget: number;
    /** Floor for execution rate scoring. */
    executionRateFloor: number;
    /** Suite speed target in milliseconds (P95). */
    suiteSpeedTarget: number;
    /** Suite speed ceiling in ms. Above this, score=0. */
    suiteSpeedCeiling: number;
}

/**
 * Default scoring thresholds with normative references.
 *
 * References:
 * - DORA State of DevOps Report 2025: pass rate, execution rate thresholds
 * - Google Test Engineering: flaky rate <1% (target), <5% (acceptable)
 * - Microsoft Research (2014): 72-80% coverage as optimal range
 * - ISTQB Foundation: coverage >70% for adequate testing
 * - Google SRE Book: P95 latency targets for CI/CD pipelines
 */
export const DEFAULT_SCORING_CONFIG: ScoringConfig = {
    /** DORA: elite performers achieve >95% change success rate */
    passRateTarget: 95,
    /** Below 50%, pipeline is unreliable — no normative basis, empirical */
    passRateFloor: 50,
    /** Google Test Engineering: <5% flaky rate is acceptable threshold */
    flakyThreshold: 5,
    /** Microsoft Research (2014): 80% coverage as optimal target */
    coverageTarget: 80,
    /** ISTQB: <30% coverage indicates inadequate testing */
    coverageFloor: 30,
    /** DORA: elite performers achieve >95% deployment success rate */
    executionRateTarget: 95,
    /** Below 50%, test suite is unreliable — empirical threshold */
    executionRateFloor: 50,
    /** Google SRE: unit tests should complete within 1 second */
    suiteSpeedTarget: 1000,
    /** Google SRE: CI pipeline >3min impacts developer productivity */
    suiteSpeedCeiling: 3000,
};

/** Grade boundaries mapping. */
export interface GradeBoundaries {
    excellent: number;
    good: number;
    needs_attention: number;
    poor: number;
    critical: number;
}

/**
 * Default grade boundaries based on industry standards.
 *
 * References:
 * - DORA State of DevOps Report 2025: elite/high/medium/low performer thresholds
 * - ISO/IEC 25010:2011: quality model grading
 */
export const DEFAULT_GRADE_BOUNDARIES: GradeBoundaries = {
    /** DORA elite performer threshold */
    excellent: 90,
    /** DORA high performer threshold */
    good: 80,
    /** Acceptable quality — needs attention */
    needs_attention: 70,
    /** Below acceptable — poor quality */
    poor: 60,
    /** Critical — immediate action required */
    critical: 0,
};

/** Health score dimension weights. */
export interface DimensionWeights {
    passRate: number;
    flakyRate: number;
    coverage: number;
    executionRate: number;
    suiteSpeed: number;
}

/**
 * Default weights for health score dimensions.
 *
 * References:
 * - DORA State of DevOps Report 2025: pass rate has highest correlation with performance
 * - Google SRE Book: reliability (execution rate) is foundational
 * - Industry consensus: coverage and flaky rate are secondary indicators
 */
export const DEFAULT_WEIGHTS: DimensionWeights = {
    /** DORA: strongest predictor of elite performance */
    passRate: 30,
    /** Google Test Engineering: flaky tests erode confidence */
    flakyRate: 20,
    /** Microsoft Research: coverage correlates with defect density */
    coverage: 25,
    /** DORA: deployment frequency requires reliable test execution */
    executionRate: 15,
    /** Google SRE: speed impacts developer productivity */
    suiteSpeed: 10,
};

/** Pipeline cost configuration. */
export interface PipelineCostConfig {
    /** Cost per minute of CI time in USD. */
    costPerMinute: number;
}

/** Default cost per minute (GitHub Actions Linux runner). */
export const DEFAULT_PIPELINE_COST_CONFIG: PipelineCostConfig = {
    costPerMinute: 0.008,
};

/** Trends configuration. */
export interface TrendsConfig {
    /** Number of recent data points to include. */
    windowSize: number;
}

/** Default trends window. */
export const DEFAULT_TRENDS_CONFIG: TrendsConfig = {
    windowSize: 10,
};

/** Quarantine configuration. */
export interface QuarantineConfig {
    /** Minimum runs to consider a test for quarantine. */
    minRuns: number;
    /** Failure rate threshold to recommend quarantine (0-100). */
    quarantineThreshold: number;
}

/**
 * Default quarantine config.
 *
 * References:
 * - Google Test Engineering: minimum 3 runs to detect flakiness
 * - Industry practice: 30% failure rate as quarantine threshold
 */
export const DEFAULT_QUARANTINE_CONFIG: QuarantineConfig = {
    /** Google Test Engineering: minimum 3 runs to detect flakiness */
    minRuns: 3,
    /** Industry practice: 30% failure rate triggers quarantine review */
    quarantineThreshold: 30,
};
