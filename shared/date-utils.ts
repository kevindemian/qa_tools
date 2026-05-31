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
