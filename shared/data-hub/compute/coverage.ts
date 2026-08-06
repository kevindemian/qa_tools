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
 * Reject a non-finite (NaN/±Infinity) numeric field explicitly.
 *
 * A non-finite value means the measurement is missing/invalid — it must never be
 * silently coerced to a number (AGENTS.md §25: zero silencing). Only a finite
 * value, including a measured 0, is a real data point.
 *
 * @throws {TypeError} when `value` is not finite.
 */
function guardFinite(value: number, field: string): number {
    if (!Number.isFinite(value)) {
        throw new TypeError(
            `calcCoverageFromRaw: campo '${field}' não é finito (${String(value)}) — medição ausente (§25)`,
        );
    }
    return value;
}

/**
 * Convert raw coverage data to normalized format.
 * Clamps percentage to [0, 100].
 * Validates inputs with Number.isFinite guards (Rule 24 — NaN must never pass silently).
 *
 * @param raw - Raw coverage from Istanbul/CTRF.
 * @returns Normalized CoverageResult.
 * @throws {TypeError} when any required numeric field (percentage/covered/total)
 *   or any per-file numeric field is non-finite — explicit failure instead of a
 *   silent default (AGENTS.md §25).
 */
export function calcCoverageFromRaw(raw: RawCoverage): CoverageResult {
    const percentage = Math.min(100, Math.max(0, guardFinite(raw.percentage, 'percentage')));
    const covered = guardFinite(raw.covered, 'covered');
    const statements = guardFinite(raw.total, 'total');
    const result: CoverageResult = {
        total: percentage,
        covered,
        statements,
    };
    if (raw.files !== undefined) {
        result.files = Object.fromEntries(
            Object.entries(raw.files).map(([file, data]) => [
                file,
                {
                    total: guardFinite(data.total, `files.${file}.total`),
                    covered: guardFinite(data.covered, `files.${file}.covered`),
                    percentage: Math.min(100, Math.max(0, guardFinite(data.percentage, `files.${file}.percentage`))),
                },
            ]),
        );
    }
    return result;
}
