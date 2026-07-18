/**
 * Data Hub — Compute function configuration types.
 *
 * Defines thresholds, weights, and configuration for compute functions.
 * These are pure value types with no runtime dependencies.
 */

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
