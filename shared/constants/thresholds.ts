/**
 * Centralized thresholds — Single Source of Truth for all quality gates,
 * health scores, coverage checks, and renderer decisions.
 *
 * NEVER hardcode threshold values in individual modules. Always import from here.
 *
 * @module shared/constants/thresholds
 */

/* ── Pass Rate ─────────────────────────────────────────────────────────── */
/** Minimum pass rate for quality gate (percentage). */
export const MIN_PASS_RATE = 80;
/** Critical pass rate — below this, pipeline is critically degraded. */
export const PASS_RATE_CRITICAL = 70;

/* ── Coverage ──────────────────────────────────────────────────────────── */
/** Minimum coverage for quality gate (percentage). */
export const MIN_COVERAGE = 70;
/** Coverage target for health score calculation (percentage). */
export const COVERAGE_TARGET = 80;
/** Coverage floor — below this, pass rate score is 0 (percentage). */
export const COVERAGE_FLOOR = 30;
/** Coverage gate default for coverage-gap report (percentage). */
export const COVERAGE_GATE_DEFAULT = 50;

/* ── Flakiness ─────────────────────────────────────────────────────────── */
/** Maximum flaky test percentage allowed by quality gate. */
export const MAX_FLAKY_PCT = 30;
/** Maximum flaky rate for health score gate. */
export const MAX_FLAKY_GATE = 5;
/** Flaky threshold for health score calculation (percentage). */
export const FLAKY_THRESHOLD = 3;

/* ── Health Score ──────────────────────────────────────────────────────── */
/** Minimum health score for quality gate. */
export const MIN_HEALTH_SCORE = 70;
/** Minimum pass rate gate for health score. */
export const MIN_PASS_RATE_GATE = 80;
/** Minimum execution rate gate for health score. */
export const MIN_EXECUTION_RATE_GATE = 80;

/* ── Grade Boundaries ──────────────────────────────────────────────────── */
export const GRADE_EXCELLENT = 90;
export const GRADE_GOOD = 80;
export const GRADE_NEEDS_ATTENTION = 70;
export const GRADE_POOR = 60;

/* ── Score Thresholds ──────────────────────────────────────────────────── */
/** Quality gate threshold for release score, cross-squad benchmark, etc. */
export const SCORE_QUALITY_GATE = 80;
/** Critical score threshold — below this, deployment is blocked. */
export const SCORE_CRITICAL = 50;

/* ── Pipeline / Suite Speed ────────────────────────────────────────────── */
/** Maximum suite speed (seconds per test) for quality gate. */
export const MAX_SUITE_SPEED = 8;
/** Maximum suite speed gate for health score (ms). */
export const MAX_SUITE_SPEED_GATE = 3000;

/* ── Execution Rate ────────────────────────────────────────────────────── */
/** Execution rate target for health score calculation (percentage). */
export const EXECUTION_RATE_TARGET = 95;

/* ── Health Score Display Thresholds ───────────────────────────────────── */
/** Health score >= this → green. */
export const HEALTH_SCORE_GOOD = 80;
/** Health score >= this → yellow. */
export const HEALTH_SCORE_WARN = 50;

/* ── Report Display Constants ──────────────────────────────────────────── */
/** Maximum characters for error message display in test tables. */
export const MAX_ERROR_DISPLAY_LENGTH = 120;
/** Maximum characters for error message in diff comparison. */
export const MAX_DIFF_ERROR_LENGTH = 100;
