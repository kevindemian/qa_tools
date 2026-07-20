/**
 * Data availability as a first-class, typed value.
 *
 * Root-cause invariant (AGENTS.md §24/§25): missing or partial data must NEVER be
 * silently coerced to a concrete number (0 / 100) or to an empty aggregate. Every
 * metric therefore carries an explicit `available` flag so that:
 *   - aggregates renormalize over available dimensions (never dividing by a
 *     fabricated constant);
 *   - renderers can show "N/A" / "sem dados" instead of a misleading 0 / 100;
 *   - a data outage is distinguishable from a genuinely measured zero.
 *
 * @module availability
 */

/** A value that may be unavailable (missing, partial, or errored upstream). */
export type Available<T> = { available: true; value: T } | { available: false; reason?: string };

/** Narrowing guard for {@link Available}. */
export function isAvailable<T>(a: Available<T>): a is { available: true; value: T } {
    return a.available === true;
}

/** Construct an available value. */
export function available<T>(value: T): Available<T> {
    return { available: true, value };
}

/** Construct an unavailable value with an optional reason. */
export function unavailable<T>(reason?: string): Available<T> {
    return reason === undefined ? { available: false } : { available: false, reason };
}

/**
 * Canonical quality dimension — replaces a bare `number` score.
 * `score` is `null` when the metric could not be computed (data outage, etc.);
 * `available` is `false` in that case and `status` is `'unknown'`.
 */
export interface QualityDimension {
    /** 0–100 when available; `null` when the metric is missing. */
    score: number | null;
    /** `false` when the underlying metric could not be computed. */
    available: boolean;
    status: 'pass' | 'fail' | 'unknown';
}

/**
 * Format a dimension's score for display. Returns `'N/A'` when the metric is
 * unavailable (or its score is missing/non-finite) — never a fabricated `0`.
 */
export function formatAvailableScore(dim: QualityDimension): string {
    if (!dim.available || dim.score === null || !Number.isFinite(dim.score)) return 'N/A';
    return String(Math.round(dim.score));
}
