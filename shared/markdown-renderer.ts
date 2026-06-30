/** Markdown ANSI terminal renderer — converts InlineToken AST to styled terminal strings.
 * @module Uses ANSI escape codes via the palette module for colors and styles. */

import { stripVTControlCharacters } from 'util';
import { palette } from './palette.js';
import type { InlineToken } from './markdown-lexer.js';

// ─── Pipe-table renderer ────────────────────────────────────────────────────────

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

function renderPipeTable(head: string[], rows: string[][], availWidth: number): string[] {
    const out: string[] = [];
    const n = head.length;
    if (n === 0) return out;

    const pipeOverhead = 3 * n + 1;
    const contentWidth = Math.max(availWidth - pipeOverhead, n * 3);
    const baseW = Math.floor(contentWidth / n);
    const colWidthMap = new Map<number, number>();
    for (let i = 0; i < n; i++) {
        colWidthMap.set(i, baseW);
    }
    colWidthMap.set(0, (colWidthMap.get(0) ?? 0) + contentWidth - baseW * n);

    const hSep =
        '│' +
        Array.from(colWidthMap.values())
            .map((w) => '─'.repeat(w + 2))
            .join('┼') +
        '│';

    const hLine = head.map((h, i) => palette.blue.bold(padCell(stripVTControlCharacters(h), colWidthMap.get(i) ?? 0)));
    out.push('│' + hLine.join('│') + '│');

    out.push(hSep);

    for (const row of rows) {
        const wrappedCols = row.map((cell, i) => wrapCell(cell, colWidthMap.get(i) ?? 0));
        const maxLines = Math.max(...wrappedCols.map((l) => l.length), 1);
        for (let li = 0; li < maxLines; li++) {
            const cells = wrappedCols.map((lns, ci) => {
                const charMap = new Map(lns.map((ch, idx) => [idx, ch]));
                return padCell(charMap.get(li) ?? '', colWidthMap.get(ci) ?? 0);
            });
            out.push('│' + cells.join('│') + '│');
        }
    }

    return out;
}

// ─── Inline token → ANSI string ────────────────────────────────────────────────

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

// ─── Block token → ANSI lines ──────────────────────────────────────────────────

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

// ─── Token list → ANSI lines ───────────────────────────────────────────────────

export function renderTokens(tokens: InlineToken[], availWidth?: number): string[] {
    const out: string[] = [];
    for (const token of tokens) {
        out.push(...renderBlockToken(token, availWidth));
    }
    return out;
}
