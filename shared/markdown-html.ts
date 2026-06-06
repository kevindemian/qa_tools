/** Markdown HTML renderer — converts InlineToken AST to HTML fragments.
 * @module Produces complete self-contained HTML with responsive CSS for documentation rendering. */

import { sanitizeHtml } from './escape.js';
import type { InlineToken } from './markdown-lexer.js';

// ─── Inline token → HTML ────────────────────────────────────────────────────────

export function renderInlineToHtml(tokens: InlineToken[] | undefined): string {
    if (!tokens) return '';
    let out = '';
    for (const t of tokens) {
        if (t.type === 'text' || t.type === 'plain') {
            out += sanitizeHtml(t.text ?? '');
        } else if (t.type === 'strong') {
            out += '<strong>' + renderInlineToHtml(t.tokens) + '</strong>';
        } else if (t.type === 'em') {
            out += '<em>' + renderInlineToHtml(t.tokens) + '</em>';
        } else if (t.type === 'codespan') {
            out += '<code>' + sanitizeHtml(t.text ?? '') + '</code>';
        } else if (t.type === 'link') {
            let hrefVal = t.href || '';
            if (hrefVal && !hrefVal.includes('://') && /\.md(#|$)/.test(hrefVal)) {
                hrefVal = hrefVal.replace(/\.md(?=#|$)/, '.html');
            }
            const hrefAttr = hrefVal ? ' href="' + sanitizeHtml(hrefVal) + '"' : '';
            out += '<a' + hrefAttr + '>' + sanitizeHtml(t.text || '') + '</a>';
        } else if (t.type === 'br') {
            out += '<br>';
        } else if (t.type === 'del') {
            out += '<del>' + renderInlineToHtml(t.tokens) + '</del>';
        }
    }
    return out;
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
            parts.push('<pre><code>' + sanitizeHtml(token.text || '') + '</code></pre>');
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
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 800px; margin: 2rem auto; padding: 0 1rem; line-height: 1.6; color: #1a1a1a; background: #fafafa; }
h1, h2, h3, h4, h5, h6 { color: #111; margin-top: 1.5em; margin-bottom: 0.5em; }
code { background: #e8e8e8; padding: 0.1em 0.3em; border-radius: 3px; font-size: 0.9em; }
pre { background: #1e1e1e; color: #d4d4d4; padding: 1em; border-radius: 6px; overflow-x: auto; }
pre code { background: none; padding: 0; color: inherit; }
blockquote { border-left: 4px solid #ccc; margin: 0; padding: 0 1em; color: #555; }
table { border-collapse: collapse; width: 100%; margin: 1em 0; }
th, td { border: 1px solid #d0d0d0; padding: 0.5em; text-align: left; }
th { background: #eee; font-weight: 600; }
a { color: #1a73e8; }
hr { border: none; border-top: 1px solid #ddd; margin: 2em 0; }
ul { padding-left: 1.5em; }
`.trim();

export const NAV_CSS = `
.nav-bar { display: flex; gap: 1rem; padding: 0.75rem 0; border-bottom: 1px solid #ddd; margin-bottom: 1.5rem; font-size: 0.9rem; }
.nav-bar a { text-decoration: none; color: #1a73e8; }
.nav-bar .nav-prev { margin-right: auto; }
.nav-bar .nav-next { margin-left: auto; }
.nav-bar .nav-index { margin: 0 auto; }
`.trim();
