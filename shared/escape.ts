/**
 * HTML escaping utilities.
 *
 * Provides a single canonical `sanitizeHtml()` for escaping HTML special
 * characters, used across all HTML generation modules.
 *
 * @module
 */

/** The five HTML special characters that must be escaped, and their entities.
 * Keyed by a literal union so the lookup in {@link sanitizeHtml} is total (no
 * `undefined` fallback needed): the regex character class is derived from these
 * exact keys, so every matched char is guaranteed to be present in the map. */
const HTML_ESCAPE_MAP = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
} as const;

type HtmlSpecialChar = keyof typeof HTML_ESCAPE_MAP;

/** Escape HTML special characters (`&<>"'`) to their entity equivalents.
 * Use this when embedding untrusted strings in HTML to prevent XSS.
 * @param text - The raw string to escape
 * @returns The escaped string safe for HTML embedding */
export function sanitizeHtml(text: string): string {
    return text.replace(/[&<>"']/g, (ch) => HTML_ESCAPE_MAP[ch as HtmlSpecialChar]);
}
