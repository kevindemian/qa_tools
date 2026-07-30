/** Markdown HTML renderer — converts InlineToken AST to HTML fragments.
 * @module Produces complete self-contained HTML with responsive CSS for documentation rendering. */

import { sanitizeHtml } from '../escape.js';
import { tokens } from '../ui/theme-tokens.js';
import type { InlineToken } from './markdown-lexer.js';

// ─── Inline token → HTML ────────────────────────────────────────────────────────

function renderLink(t: InlineToken): string {
    let hrefVal = t.href;
    if (hrefVal && !hrefVal.includes('://') && /\.md(#|$)/.test(hrefVal)) {
        hrefVal = hrefVal.replace(/\.md(?=#|$)/, '.html');
    }
    const hrefAttr = hrefVal ? ' href="' + sanitizeHtml(hrefVal) + '"' : '';
    return '<a' + hrefAttr + '>' + sanitizeHtml(t.text ?? '') + '</a>';
}

function renderInlineToken(t: InlineToken): string {
    switch (t.type) {
        case 'text':
        case 'plain':
            return sanitizeHtml(t.text ?? '');
        case 'strong':
            return '<strong>' + renderInlineToHtml(t.tokens) + '</strong>';
        case 'em':
            return '<em>' + renderInlineToHtml(t.tokens) + '</em>';
        case 'codespan':
            return '<code>' + sanitizeHtml(t.text ?? '') + '</code>';
        case 'link':
            return renderLink(t);
        case 'br':
            return '<br>';
        case 'del':
            return '<del>' + renderInlineToHtml(t.tokens) + '</del>';
        default:
            return '';
    }
}

function renderInlineToHtml(tokens: InlineToken[] | undefined): string {
    if (!tokens) return '';
    return tokens.map(renderInlineToken).join('');
}

// ─── Token list → HTML block string ────────────────────────────────────────────

export function renderTokensToHtml(tokens: InlineToken[]): string {
    const parts: string[] = [];
    for (const token of tokens) {
        if (token.type === 'heading') {
            const tag = 'h' + Math.min(token.depth || 1, 6);
            parts.push('<' + tag + '>' + renderInlineToHtml(token.tokens) + '</' + tag + '>');
        } else if (token.type === 'paragraph') {
            const text = renderInlineToHtml(token.tokens);
            if (text.trim()) parts.push('<p>' + text + '</p>');
        } else if (token.type === 'code') {
            parts.push('<pre><code>' + sanitizeHtml(token.text ?? '') + '</code></pre>');
        } else if (token.type === 'list') {
            const items = (token.items as Array<{ tokens: InlineToken[] }>).map(
                (item) => '<li>' + renderInlineToHtml(item.tokens) + '</li>',
            );
            parts.push('<ul>' + items.join('') + '</ul>');
        } else if (token.type === 'table') {
            const head = (token.header as Array<{ tokens: InlineToken[] }>).map(
                (h) => '<th>' + renderInlineToHtml(h.tokens) + '</th>',
            );
            const rows = (token.rows as Array<Array<{ tokens: InlineToken[] }>>).map((r) => {
                const cells = r.map((c) => '<td>' + renderInlineToHtml(c.tokens) + '</td>');
                return '<tr>' + cells.join('') + '</tr>';
            });
            parts.push(
                '<table><thead><tr>' + head.join('') + '</tr></thead><tbody>' + rows.join('') + '</tbody></table>',
            );
        } else if (token.type === 'hr') {
            parts.push('<hr>');
        } else if (token.type === 'blockquote') {
            parts.push('<blockquote>' + renderInlineToHtml(token.tokens) + '</blockquote>');
        }
    }
    return parts.join('\n');
}

export const HTML_DOC_CSS = `
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 800px; margin: 2rem auto; padding: 0 1rem; line-height: 1.6; color: var(--color-text-primary, ${tokens.color.text.primary.light}); background: var(--color-surface-page, ${tokens.color.surface.page.light}); }
h1, h2, h3, h4, h5, h6 { color: var(--color-text-primary, ${tokens.color.text.primary.light}); margin-top: 1.5em; margin-bottom: 0.5em; }
code { background: var(--color-code-bg, ${tokens.color.code.bg.light}); padding: 0.1em 0.3em; border-radius: 3px; font-size: 0.9em; }
pre { background: var(--color-code-bg, ${tokens.color.code.bg.dark}); color: var(--color-code-text, ${tokens.color.code.text.dark}); padding: 1em; border-radius: 6px; overflow-x: auto; }
pre code { background: none; padding: 0; color: inherit; }
blockquote { border-left: 4px solid var(--color-border-default, ${tokens.color.border.default.light}); margin: 0; padding: 0 1em; color: var(--color-text-secondary, ${tokens.color.text.secondary.light}); }
table { border-collapse: collapse; width: 100%; margin: 1em 0; }
th, td { border: 1px solid var(--color-border-subtle, ${tokens.color.border.subtle.light}); padding: 0.5em; text-align: left; }
th { background: var(--color-surface-elevated, ${tokens.color.surface.elevated.light}); font-weight: 600; }
a { color: var(--color-info, ${tokens.color.semantic.info.light}); }
hr { border: none; border-top: 1px solid var(--color-border-subtle, ${tokens.color.border.subtle.light}); margin: 2em 0; }
ul { padding-left: 1.5em; }
`.trim();

export const NAV_CSS = `
.nav-bar { display: flex; gap: 1rem; padding: 0.75rem 0; border-bottom: 1px solid var(--color-border-subtle, ${tokens.color.border.subtle.light}); margin-bottom: 1.5rem; font-size: 0.9rem; }
.nav-bar a { text-decoration: none; color: var(--color-info, ${tokens.color.semantic.info.light}); }
.nav-bar .nav-prev { margin-right: auto; }
.nav-bar .nav-next { margin-left: auto; }
.nav-bar .nav-index { margin: 0 auto; }
`.trim();
