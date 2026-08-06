/**
 * Date formatting utilities.
 *
 * Single-source-of-truth for all date string formatting across the
 * codebase, eliminating duelling `split('T')` / `slice(0, 10)` patterns.
 *
 * @module
 */

/** Format a date as `YYYY-MM-DD` ISO date string.
 * Uses manual date arithmetic (not `toISOString`) to avoid timezone
 * dependency and to produce a locale-independent result.
 * @param date - Date to format (default: today)
 * @returns Date string in `YYYY-MM-DD` format */
export function formatDateISO(date: Date = new Date()): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/** Resolve the "generated at" ISO instant for report generation.
 *
 * SSOT for generation timestamps. When a caller supplies an explicit seed
 * (deterministic runs, test fixtures), that seed is returned verbatim so the
 * generated artifact is byte-identical across runs (Fase II/III hash proof).
 * Without a seed it falls back to the current clock (production behavior).
 *
 * Rule 25: this is an explicit injection seam, not a silent fallback — the
 * caller chooses determinism by passing a seed; production callers that omit
 * it intentionally get wall-clock time.
 * @param seed - Optional fixed ISO-8601 instant (default: now)
 * @returns ISO-8601 generation timestamp
 */
export function resolveGeneratedAt(seed?: string): string {
    return seed ?? new Date().toISOString();
}
