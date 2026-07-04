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

/** Default scoring thresholds aligned with industry standards. */
export const DEFAULT_SCORING_CONFIG: ScoringConfig = {
    passRateTarget: 95,
    passRateFloor: 50,
    flakyThreshold: 5,
    coverageTarget: 80,
    coverageFloor: 30,
    executionRateTarget: 95,
    executionRateFloor: 50,
    suiteSpeedTarget: 1000,
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

/** Default grade boundaries. */
export const DEFAULT_GRADE_BOUNDARIES: GradeBoundaries = {
    excellent: 90,
    good: 80,
    needs_attention: 70,
    poor: 60,
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

/** Default weights for health score dimensions. */
export const DEFAULT_WEIGHTS: DimensionWeights = {
    passRate: 30,
    flakyRate: 20,
    coverage: 25,
    executionRate: 15,
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

/** Default quarantine config. */
export const DEFAULT_QUARANTINE_CONFIG: QuarantineConfig = {
    minRuns: 3,
    quarantineThreshold: 30,
};
