/** Lightweight Markdown parser, renderer, and HTML converter.
 * @module Facade that composes lexer, ANSI renderer, HTML builder, and navigation types.
 * Supported syntax: headings (#), bold (**), italic (*), strikethrough (~~),
 * inline code (`), code blocks (```), links [text](url), images ![alt](url),
 * unordered lists (-), ordered lists (1.), horizontal rules (---), tables (|...|),
 * blockquotes (>).
 *
 * Terminal output uses ANSI styles via the palette module.
 * HTML output generates a complete self-contained page with navigation sidebar
 * and responsive CSS for documentation rendering. */

import { box, type BoxBorder } from './box';
import { sanitizeHtml } from './escape';
import { buildHtmlPage } from './html-factory';
import { lexMarkdown, getTestTokens } from './markdown-lexer';
import { renderTokens } from './markdown-renderer';
import { renderTokensToHtml, HTML_DOC_CSS, NAV_CSS } from './markdown-html';
import type { NavConfig } from './markdown-nav';

// Re-export public types and test support
export { __setLexer } from './markdown-lexer';
export type { NavLink, NavConfig } from './markdown-nav';

// ─── Public API ─────────────────────────────────────────────────────────────────

/** Render Markdown to an ANSI-styled terminal string.
 * @param availWidth - Available character width (defaults to terminal width - padding). */
export function md(markdown: string, availWidth?: number): string {
    const tokens = getTestTokens() ?? lexMarkdown(markdown);
    const lines = renderTokens(tokens, availWidth);
    while (lines.length > 0 && lines[lines.length - 1] === '') {
        lines.pop();
    }
    return lines.join('\n');
}

/** Render Markdown inside a styled terminal box with optional title and border. */
export function mdBox(markdown: string, options?: { title?: string; border?: BoxBorder; color?: string }): string {
    const termWidth = process.stdout.columns || 80;
    const availWidth = Math.max(termWidth - 12, 40);
    const content = md(markdown, availWidth);
    const lines = content.split('\n');
    const border: BoxBorder = options?.border || 'round';
    return box(lines, {
        ...(options?.title ? { title: options.title } : {}),
        border,
        padding: 1,
    });
}

/** Render Markdown to a complete self-contained HTML page with optional navigation sidebar.
 * Includes responsive CSS and uses `en` as the document language. */
export function mdToHtml(markdown: string, title?: string, nav?: NavConfig): string {
    const tokens = getTestTokens() ?? lexMarkdown(markdown);
    const body = renderTokensToHtml(tokens);
    const docTitle = title ? sanitizeHtml(title) : 'Document';
    const hasNav = !!(nav?.prev || nav?.next);
    let allCss = HTML_DOC_CSS;
    if (hasNav) allCss += '\n' + NAV_CSS;
    let navHtml = '';
    if (nav) {
        const parts: string[] = [];
        if (nav.prev) {
            parts.push(
                '<a class="nav-prev" href="' +
                    sanitizeHtml(nav.prev.file) +
                    '">← ' +
                    sanitizeHtml(nav.prev.label) +
                    '</a>',
            );
        }
        parts.push('<a class="nav-index" href="index.html">Índice</a>');
        if (nav.next) {
            parts.push(
                '<a class="nav-next" href="' +
                    sanitizeHtml(nav.next.file) +
                    '">' +
                    sanitizeHtml(nav.next.label) +
                    ' →</a>',
            );
        }
        navHtml = '<div class="nav-bar">' + parts.join('') + '</div>';
    }
    const bodyContent = navHtml + body;
    return buildHtmlPage({ title: docTitle, styles: allCss, bodyContent });
}
