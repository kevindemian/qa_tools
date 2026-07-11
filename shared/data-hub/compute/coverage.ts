/**
 * Compute: Coverage.
 *
 * Normalizes raw coverage data from Istanbul/CTRF to a standard format.
 *
 * @reference Istanbul coverage report format
 */
import type { RawCoverage } from '../../types/data-hub.js';

/** Normalized coverage result. */
export interface CoverageResult {
    /** Overall coverage percentage (0-100). */
    total: number;
    /** Number of covered statements/branches. */
    covered: number;
    /** Total statements/branches. */
    statements: number;
    /** Per-file coverage if available. */
    files?: Record<string, { total: number; covered: number; percentage: number }>;
}

/**
 * Convert raw coverage data to normalized format.
 * Clamps percentage to [0, 100].
 * Validates inputs with Number.isFinite guards (Rule 24 — NaN must never pass silently).
 *
 * @param raw - Raw coverage from Istanbul/CTRF.
 * @returns Normalized CoverageResult.
 */
export function calcCoverageFromRaw(raw: RawCoverage): CoverageResult {
    const safePercentage = Number.isFinite(raw.percentage) ? raw.percentage : 0;
    const safeCovered = Number.isFinite(raw.covered) ? raw.covered : 0;
    const safeTotal = Number.isFinite(raw.total) ? raw.total : 0;
    const percentage = Math.min(100, Math.max(0, safePercentage));
    const result: CoverageResult = {
        total: percentage,
        covered: safeCovered,
        statements: safeTotal,
    };
    if (raw.files !== undefined) {
        result.files = raw.files;
    }
    return result;
}
