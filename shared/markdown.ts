/** Lightweight Markdown parser, renderer, and HTML converter.
 * @module Supported syntax: headings (#), bold (**), italic (*), strikethrough (~~),
 * inline code (`), code blocks (```), links [text](url), images ![alt](url),
 * unordered lists (-), ordered lists (1.), horizontal rules (---), tables (|...|),
 * blockquotes (>).
 *
 * Terminal output uses ANSI styles via the palette module.
 * HTML output generates a complete self-contained page with navigation sidebar
 * and responsive CSS for documentation rendering. */

import { stripVTControlCharacters } from 'util';
import { palette } from './palette';
import { box, type BoxBorder } from './box';
import { sanitizeHtml } from './escape';
import { buildHtmlPage } from './html-factory';

/** Safe accessor for string arrays: returns the element at index `i` or an empty string fallback.
 *  Eliminates non-null assertions (`lines[i]!`) that would crash on undefined. */
function getLine(lines: string[], i: number): string {
    return lines[i] ?? '';
}

// ─── Token types ───────────────────────────────────────────────────────────────

interface InlineToken {
    type: string;
    text?: string;
    href?: string;
    tokens?: InlineToken[];
    depth?: number;
    items?: Array<{ tokens: InlineToken[] }>;
    header?: Array<{ tokens: InlineToken[] }>;
    rows?: Array<Array<{ tokens: InlineToken[] }>>;
    align?: string[];
    lang?: string;
}

// ─── Inline handlers ────────────────────────────────────────────────────────────

function lexDel(src: string, i: number, flush: () => void, push: (t: InlineToken) => void): number | null {
    if (src[i] !== '~' || src[i + 1] !== '~') return null;
    const end = src.indexOf('~~', i + 2);
    if (end === -1) return null;
    flush();
    push({ type: 'del', tokens: lexInline(src.slice(i + 2, end)) });
    return end + 2;
}

function lexStrong(src: string, i: number, flush: () => void, push: (t: InlineToken) => void): number | null {
    if (src[i] !== '*' || src[i + 1] !== '*') return null;
    const end = src.indexOf('**', i + 2);
    if (end === -1) return null;
    flush();
    push({ type: 'strong', tokens: lexInline(src.slice(i + 2, end)) });
    return end + 2;
}

function lexEmStar(src: string, i: number, flush: () => void, push: (t: InlineToken) => void): number | null {
    if (src[i] !== '*' || src[i + 1] === '*') return null;
    const end = src.indexOf('*', i + 1);
    if (end === -1) return null;
    flush();
    push({ type: 'em', tokens: lexInline(src.slice(i + 1, end)) });
    return end + 1;
}

function lexEmUnderscore(src: string, i: number, flush: () => void, push: (t: InlineToken) => void): number | null {
    if (src[i] !== '_') return null;
    const end = src.indexOf('_', i + 1);
    if (end === -1) return null;
    flush();
    push({ type: 'em', tokens: lexInline(src.slice(i + 1, end)) });
    return end + 1;
}

function lexCodeSpan(src: string, i: number, flush: () => void, push: (t: InlineToken) => void): number | null {
    if (src[i] !== '`') return null;
    const end = src.indexOf('`', i + 1);
    if (end === -1) return null;
    flush();
    push({ type: 'codespan', text: src.slice(i + 1, end) });
    return end + 1;
}

function lexLink(src: string, i: number, flush: () => void, push: (t: InlineToken) => void): number | null {
    if (src[i] !== '[') return null;
    const cb = src.indexOf(']', i + 1);
    if (cb === -1 || src[cb + 1] !== '(') return null;
    const cp = src.indexOf(')', cb + 2);
    if (cp === -1) return null;
    flush();
    push({ type: 'link', text: src.slice(i + 1, cb), href: src.slice(cb + 2, cp) });
    return cp + 1;
}

// ─── Inline lexer ───────────────────────────────────────────────────────────────

function lexInline(src: string): InlineToken[] {
    const tokens: InlineToken[] = [];
    let i = 0;
    let buf = '';

    const flush = (): void => {
        if (buf) {
            tokens.push({ type: 'text', text: buf });
            buf = '';
        }
    };
    const push = (t: InlineToken): void => {
        tokens.push(t);
    };

    while (i < src.length) {
        const handlers = [lexDel, lexStrong, lexEmStar, lexEmUnderscore, lexCodeSpan, lexLink];
        let matched = false;
        for (const fn of handlers) {
            const next = fn(src, i, flush, push);
            if (next !== null) {
                i = next;
                matched = true;
                break;
            }
        }
        if (matched) continue;
        buf += src[i];
        i++;
    }

    flush();
    return tokens;
}

// ─── Pipe-table lexer ───────────────────────────────────────────────────────────

function parsePipeRow(line: string): string[] {
    const inner = line.trim();
    const s = inner.startsWith('|') ? inner.slice(1) : inner;
    const e = s.endsWith('|') ? s.slice(0, -1) : s;
    return e.split('|').map((c) => c.trim());
}

function lexPipeTable(lines: string[]): InlineToken {
    const header: Array<{ tokens: InlineToken[] }> = [];
    const rows: Array<Array<{ tokens: InlineToken[] }>> = [];
    let sepIdx = -1;

    for (let i = 0; i < lines.length; i++) {
        if (/^\|?[\s:-]+\|/.test(getLine(lines, i).trim())) {
            sepIdx = i;
            break;
        }
    }

    if (sepIdx === -1) {
        const cells = parsePipeRow(getLine(lines, 0));
        for (const c of cells) header.push({ tokens: lexInline(c) });
        for (let i = 1; i < lines.length; i++) {
            rows.push(parsePipeRow(getLine(lines, i)).map((c) => ({ tokens: lexInline(c) })));
        }
        return { type: 'table', header, rows, align: [] };
    }

    const hCells = parsePipeRow(getLine(lines, 0));
    for (const c of hCells) header.push({ tokens: lexInline(c) });

    const aCells = parsePipeRow(getLine(lines, sepIdx));
    const align = aCells.map((c) => {
        if (c.startsWith(':') && c.endsWith(':')) return 'center';
        if (c.endsWith(':')) return 'right';
        return 'left';
    });

    for (let i = sepIdx + 1; i < lines.length; i++) {
        rows.push(parsePipeRow(getLine(lines, i)).map((c) => ({ tokens: lexInline(c) })));
    }

    return { type: 'table', header, rows, align };
}

// ─── Block-level handlers ───────────────────────────────────────────────────────

function lexHeading(line: string): InlineToken | null {
    const m = line.match(/^(#{1,6})\s+(.*)$/);
    if (!m) return null;
    return { type: 'heading', depth: (m[1] ?? '').length, tokens: lexInline(m[2] ?? '') };
}

function lexCodeBlock(lines: string[], i: number): { token: InlineToken; next: number } | null {
    if (!getLine(lines, i).trimStart().startsWith('```')) return null;
    const codeLines: string[] = [];
    i++;
    while (i < lines.length && !getLine(lines, i).trimStart().startsWith('```')) {
        codeLines.push(getLine(lines, i));
        i++;
    }
    i++;
    return { token: { type: 'code', text: codeLines.join('\n') }, next: i };
}

function lexBlockquote(lines: string[], i: number): { token: InlineToken; next: number } | null {
    if (!getLine(lines, i).trimStart().startsWith('>')) return null;
    const quoteLines: string[] = [];
    while (i < lines.length && getLine(lines, i).trimStart().startsWith('>')) {
        quoteLines.push(getLine(lines, i).trimStart().replace(/^>\s?/, ''));
        i++;
    }
    return { token: { type: 'blockquote', tokens: lexInline(quoteLines.join(' ').trim()) }, next: i };
}

function lexUnorderedList(lines: string[], i: number): { token: InlineToken; next: number } | null {
    const m = getLine(lines, i).match(/^(\s*)[-*+]\s+(.*)$/);
    if (!m) return null;
    const items: Array<{ tokens: InlineToken[] }> = [];
    while (i < lines.length) {
        const m2 = getLine(lines, i).match(/^(\s*)[-*+]\s+(.*)$/);
        if (m2) {
            items.push({ tokens: lexInline(m2[2] ?? '') });
            i++;
        } else if (getLine(lines, i).trim() === '') {
            break;
        } else {
            break;
        }
    }
    return { token: { type: 'list', items }, next: i };
}

function lexOrderedList(lines: string[], i: number): { token: InlineToken; next: number } | null {
    const m = getLine(lines, i).match(/^\s*\d+\.\s+(.*)$/);
    if (!m) return null;
    const items: Array<{ tokens: InlineToken[] }> = [];
    while (i < lines.length) {
        const m2 = getLine(lines, i).match(/^\s*\d+\.\s+(.*)$/);
        if (m2) {
            items.push({ tokens: lexInline(m2[1] ?? '') });
            i++;
        } else if (getLine(lines, i).trim() === '') {
            break;
        } else {
            break;
        }
    }
    return { token: { type: 'list', items }, next: i };
}

function lexTableBlock(lines: string[], i: number): { token: InlineToken; next: number } | null {
    if (!getLine(lines, i).trimStart().startsWith('|')) return null;
    const tableLines: string[] = [];
    while (i < lines.length && getLine(lines, i).includes('|')) {
        tableLines.push(getLine(lines, i));
        i++;
    }
    return { token: lexPipeTable(tableLines), next: i };
}

function lexParagraph(lines: string[], i: number): { token: InlineToken; next: number } {
    const paraLines: string[] = [getLine(lines, i)];
    i++;
    while (i < lines.length) {
        const n = getLine(lines, i);
        if (
            n.trim() === '' ||
            /^(#{1,6}\s|---|```|>)/.test(n) ||
            /^(\s*[-*+]\s+|\s*\d+\.\s+)/.test(n) ||
            n.trimStart().startsWith('|')
        ) {
            break;
        }
        paraLines.push(n);
        i++;
    }
    return { token: { type: 'paragraph', tokens: lexInline(paraLines.join(' ')) }, next: i };
}

function dedupeSpaces(tokens: InlineToken[]): InlineToken[] {
    return tokens.filter((t, idx, arr) => {
        if (t.type === 'space' && idx > 0 && arr[idx - 1]?.type === 'space') return false;
        return true;
    });
}

// ─── Block-level token dispatcher ───────────────────────────────────────────────

function lexBlockToken(lines: string[], i: number): { token: InlineToken; next: number } {
    const line = getLine(lines, i);

    if (line.trim() === '') {
        return { token: { type: 'space' }, next: i + 1 };
    }

    const h = lexHeading(line);
    if (h) return { token: h, next: i + 1 };

    const cb = lexCodeBlock(lines, i);
    if (cb) return cb;

    if (/^-{3,}\s*$/.test(line.trim())) {
        return { token: { type: 'hr' }, next: i + 1 };
    }

    const bq = lexBlockquote(lines, i);
    if (bq) return bq;

    const ul = lexUnorderedList(lines, i);
    if (ul) return ul;

    const ol = lexOrderedList(lines, i);
    if (ol) return ol;

    const tbl = lexTableBlock(lines, i);
    if (tbl) return tbl;

    return lexParagraph(lines, i);
}

// ─── Block-level lexer ──────────────────────────────────────────────────────────

function lexMarkdown(src: string): InlineToken[] {
    const tokens: InlineToken[] = [];
    const lines = src.split('\n');
    let i = 0;

    while (i < lines.length) {
        const result = lexBlockToken(lines, i);
        tokens.push(result.token);
        i = result.next;
    }

    return dedupeSpaces(tokens);
}

// ─── Test support: inject pre-parsed tokens ─────────────────────────────────────

let _testTokens: InlineToken[] | null = null;

export function __setLexer(tokens: InlineToken[] | null): void {
    _testTokens = tokens;
}

// ─── Renderers (unchanged) ──────────────────────────────────────────────────────

function renderPipeTable(head: string[], rows: string[][], availWidth: number): string[] {
    const out: string[] = [];
    const n = head.length;
    if (n === 0) return out;

    const pipeOverhead = 3 * n + 1;
    const contentWidth = Math.max(availWidth - pipeOverhead, n * 3);
    const baseW = Math.floor(contentWidth / n);
    const colWidths = new Array(n).fill(baseW);
    colWidths[0] += contentWidth - baseW * n;

    function wrapCell(text: string, width: number): string[] {
        const clean = stripVTControlCharacters(text);
        if (clean.length <= width) return [clean];
        const lines: string[] = [];
        let remaining = clean;
        while (remaining.length > width) {
            const breakAt = remaining.lastIndexOf(' ', width);
            const splitAt = breakAt > 0 ? breakAt : width;
            lines.push(remaining.slice(0, splitAt));
            remaining = remaining.slice(splitAt).trimStart();
        }
        if (remaining.length > 0) lines.push(remaining);
        else if (lines.length === 0) lines.push('');
        return lines;
    }

    function padCell(text: string, width: number): string {
        const clean = stripVTControlCharacters(text);
        return ' ' + text + ' '.repeat(Math.max(0, width - clean.length)) + ' ';
    }

    const hSep = '│' + colWidths.map((w) => '─'.repeat(w + 2)).join('┼') + '│';

    const hLine = head.map((h, i) => palette.blue.bold(padCell(stripVTControlCharacters(h), colWidths[i])));
    out.push('│' + hLine.join('│') + '│');

    out.push(hSep);

    for (const row of rows) {
        const wrappedCols = row.map((cell, i) => wrapCell(cell, colWidths[i]));
        const maxLines = Math.max(...wrappedCols.map((l) => l.length), 1);
        for (let li = 0; li < maxLines; li++) {
            const cells = wrappedCols.map((lines, ci) => padCell(lines[li] || '', colWidths[ci]));
            out.push('│' + cells.join('│') + '│');
        }
    }

    return out;
}

function renderBlockToken(token: InlineToken, availWidth?: number): string[] {
    const out: string[] = [];

    if (token.type === 'heading') {
        const text = renderInline(token.tokens);
        out.push(palette.blue.bold(text));
        out.push('');
    } else if (token.type === 'paragraph') {
        const text = renderInline(token.tokens);
        if (text.trim()) out.push(text);
        out.push('');
    } else if (token.type === 'code') {
        const lines = (token.text ?? '').split('\n');
        for (const line of lines) {
            out.push(palette.muted(line));
        }
        out.push('');
    } else if (token.type === 'list') {
        for (const item of token.items as Array<{ tokens: InlineToken[] }>) {
            const text = renderInline(item.tokens);
            out.push('  ● ' + text);
        }
        out.push('');
    } else if (token.type === 'table') {
        const head: string[] = (token.header as Array<{ tokens: InlineToken[] }>).map((h) => renderInline(h.tokens));
        const rows: string[][] = (token.rows as Array<Array<{ tokens: InlineToken[] }>>).map((r) =>
            r.map((c) => renderInline(c.tokens)),
        );
        const termWidth = availWidth || process.stdout.columns || 80;
        const tableLines = renderPipeTable(head, rows, termWidth);
        for (const line of tableLines) {
            out.push(line);
        }
        out.push('');
    } else if (token.type === 'hr') {
        const w = availWidth || process.stdout.columns || 80;
        out.push(palette.border('─'.repeat(Math.min(w - 2, 60))));
        out.push('');
    } else if (token.type === 'space') {
        out.push('');
    } else if (token.type === 'blockquote') {
        const text = renderInline(token.tokens);
        out.push(palette.muted('│ ' + text));
        out.push('');
    }

    return out;
}

function renderTokens(tokens: InlineToken[], availWidth?: number): string[] {
    const out: string[] = [];

    for (const token of tokens) {
        out.push(...renderBlockToken(token, availWidth));
    }

    return out;
}

function renderInline(tokens: InlineToken[] | undefined): string {
    if (!tokens) return '';
    let out = '';
    for (const t of tokens) {
        if (t.type === 'text' || t.type === 'plain') {
            out += t.text;
        } else if (t.type === 'strong') {
            out += '\x1b[1m' + renderInline(t.tokens) + '\x1b[22m';
        } else if (t.type === 'em') {
            out += '\x1b[3m' + renderInline(t.tokens) + '\x1b[23m';
        } else if (t.type === 'codespan') {
            out += palette.muted(t.text ?? '');
        } else if (t.type === 'link') {
            out += palette.blue(t.text ?? '');
        } else if (t.type === 'br') {
            out += '\n';
        } else if (t.type === 'del') {
            out += '~~' + renderInline(t.tokens) + '~~';
        }
    }
    return out;
}

// ─── HTML rendering ────────────────────────────────────────────────────────────

function renderInlineToHtml(tokens: InlineToken[] | undefined): string {
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

function renderTokensToHtml(tokens: InlineToken[]): string {
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

const HTML_DOC_CSS = `
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

const NAV_CSS = `
.nav-bar { display: flex; gap: 1rem; padding: 0.75rem 0; border-bottom: 1px solid #ddd; margin-bottom: 1.5rem; font-size: 0.9rem; }
.nav-bar a { text-decoration: none; color: #1a73e8; }
.nav-bar .nav-prev { margin-right: auto; }
.nav-bar .nav-next { margin-left: auto; }
.nav-bar .nav-index { margin: 0 auto; }
`.trim();

/** A link in the navigation bar (prev/next). */
export interface NavLink {
    label: string;
    file: string;
}
/** Navigation configuration for prev/next links in HTML output. */
export interface NavConfig {
    prev?: NavLink;
    next?: NavLink;
}

// ─── Public API ─────────────────────────────────────────────────────────────────

/** Render Markdown to an ANSI-styled terminal string.
 * @param availWidth - Available character width (defaults to terminal width - padding). */
export function md(markdown: string, availWidth?: number): string {
    const tokens = _testTokens ?? lexMarkdown(markdown);
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
        title: options?.title,
        border,
        padding: 1,
    });
}

/** Render Markdown to a complete self-contained HTML page with optional navigation sidebar.
 * Includes responsive CSS and uses `en` as the document language. */
export function mdToHtml(markdown: string, title?: string, nav?: NavConfig): string {
    const tokens = _testTokens ?? lexMarkdown(markdown);
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
