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
 *
 * @param raw - Raw coverage from Istanbul/CTRF.
 * @returns Normalized CoverageResult.
 */
export function calcCoverageFromRaw(raw: RawCoverage): CoverageResult {
    const percentage = Math.min(100, Math.max(0, raw.percentage));
    const result: CoverageResult = {
        total: percentage,
        covered: raw.covered,
        statements: raw.total,
    };
    if (raw.files !== undefined) {
        result.files = raw.files;
    }
    return result;
}
