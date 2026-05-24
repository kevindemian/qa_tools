import { stripVTControlCharacters } from 'util';
import { palette } from './palette';
import { box, type BoxBorder } from './box';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- ESM-only lazy-load in CJS
let _lexer: ((src: string) => any[]) | null = null;

export function __setLexer(mod: unknown): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    _lexer = mod as any;
}

function ensureLexer(): void {
    if (_lexer) return;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('marked') as { lexer: (src: string) => unknown[] };
    _lexer = mod.lexer;
}

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

    // Header row
    const hLine = head.map((h, i) => palette.blue.bold(padCell(stripVTControlCharacters(h), colWidths[i])));
    out.push('│' + hLine.join('│') + '│');

    // Separator
    out.push(hSep);

    // Data rows with wrapping
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function renderTokens(tokens: any[], availWidth?: number): string[] {
    const out: string[] = [];

    for (const token of tokens) {
        if (token.type === 'heading') {
            const text = renderInline(token.tokens);
            out.push(palette.blue.bold(text));
            out.push('');
        } else if (token.type === 'paragraph') {
            const text = renderInline(token.tokens);
            if (text.trim()) out.push(text);
            out.push('');
        } else if (token.type === 'code') {
            const lines = token.text.split('\n') as string[];
            for (const line of lines) {
                out.push(palette.muted(line));
            }
            out.push('');
        } else if (token.type === 'list') {
            for (const item of token.items as Array<{ tokens: unknown[] }>) {
                const text = renderInline(item.tokens);
                out.push('  ● ' + text);
            }
            out.push('');
        } else if (token.type === 'table') {
            const head: string[] = (token.header as Array<{ tokens: unknown[] }>).map((h) => renderInline(h.tokens));
            const rows: string[][] = (token.rows as Array<Array<{ tokens: unknown[] }>>).map((r) =>
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
    }

    return out;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function renderInline(tokens: any[] | undefined): string {
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
            out += palette.muted(t.text);
        } else if (t.type === 'link') {
            out += palette.blue(t.text || '');
        } else if (t.type === 'br') {
            out += '\n';
        } else if (t.type === 'del') {
            out += '~~' + renderInline(t.tokens) + '~~';
        }
    }
    return out;
}

export function md(markdown: string, availWidth?: number): string {
    ensureLexer();
    if (!_lexer) return markdown;
    const tokens = _lexer(markdown);
    const lines = renderTokens(tokens, availWidth);
    while (lines.length > 0 && lines[lines.length - 1] === '') {
        lines.pop();
    }
    return lines.join('\n');
}

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
