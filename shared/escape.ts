/**
 * HTML escaping utilities.
 *
 * Provides a single canonical `sanitizeHtml()` for escaping HTML special
 * characters, used across all HTML generation modules.
 *
 * @module
 */

/** Lookup map from a special character to its HTML entity. */
const HTML_ESCAPE_MAP: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
};

/** Escape HTML special characters (`&<>"'`) to their entity equivalents.
 * Use this when embedding untrusted strings in HTML to prevent XSS.
 * @param text - The raw string to escape
 * @returns The escaped string safe for HTML embedding */
export function sanitizeHtml(text: string): string {
    return text.replace(/[&<>"']/g, (ch) => HTML_ESCAPE_MAP[ch] || ch);
}
