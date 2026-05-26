import { stripVTControlCharacters } from 'util';
import { palette } from './palette';
import { box, type BoxBorder } from './box';

// ─── Token types ───────────────────────────────────────────────────────────────

interface InlineToken {
    type: string;
    text?: string;
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
    push({ type: 'link', text: src.slice(i + 1, cb) });
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
        if (/^\|?[\s:-]+\|/.test(lines[i]!.trim())) {
            sepIdx = i;
            break;
        }
    }

    if (sepIdx === -1) {
        const cells = parsePipeRow(lines[0]!);
        for (const c of cells) header.push({ tokens: lexInline(c) });
        for (let i = 1; i < lines.length; i++) {
            rows.push(parsePipeRow(lines[i]!).map((c) => ({ tokens: lexInline(c) })));
        }
        return { type: 'table', header, rows, align: [] };
    }

    const hCells = parsePipeRow(lines[0]!);
    for (const c of hCells) header.push({ tokens: lexInline(c) });

    const aCells = parsePipeRow(lines[sepIdx]!);
    const align = aCells.map((c) => {
        if (c.startsWith(':') && c.endsWith(':')) return 'center';
        if (c.endsWith(':')) return 'right';
        return 'left';
    });

    for (let i = sepIdx + 1; i < lines.length; i++) {
        rows.push(parsePipeRow(lines[i]!).map((c) => ({ tokens: lexInline(c) })));
    }

    return { type: 'table', header, rows, align };
}

// ─── Block-level handlers ───────────────────────────────────────────────────────

function lexHeading(line: string): InlineToken | null {
    const m = line.match(/^(#{1,6})\s+(.*)$/);
    if (!m) return null;
    return { type: 'heading', depth: m[1]!.length, tokens: lexInline(m[2]!) };
}

function lexCodeBlock(lines: string[], i: number): { token: InlineToken; next: number } | null {
    if (!lines[i]!.trimStart().startsWith('```')) return null;
    const codeLines: string[] = [];
    i++;
    while (i < lines.length && !lines[i]!.trimStart().startsWith('```')) {
        codeLines.push(lines[i]!);
        i++;
    }
    i++;
    return { token: { type: 'code', text: codeLines.join('\n') }, next: i };
}

function lexBlockquote(lines: string[], i: number): { token: InlineToken; next: number } | null {
    if (!lines[i]!.trimStart().startsWith('>')) return null;
    const quoteLines: string[] = [];
    while (i < lines.length && lines[i]!.trimStart().startsWith('>')) {
        quoteLines.push(lines[i]!.trimStart().replace(/^>\s?/, ''));
        i++;
    }
    return { token: { type: 'blockquote', tokens: lexInline(quoteLines.join(' ').trim()) }, next: i };
}

function lexUnorderedList(lines: string[], i: number): { token: InlineToken; next: number } | null {
    const m = lines[i]!.match(/^(\s*)[-*+]\s+(.*)$/);
    if (!m) return null;
    const items: Array<{ tokens: InlineToken[] }> = [];
    while (i < lines.length) {
        const m2 = lines[i]!.match(/^(\s*)[-*+]\s+(.*)$/);
        if (m2) {
            items.push({ tokens: lexInline(m2[2]!) });
            i++;
        } else if (lines[i]!.trim() === '') {
            break;
        } else {
            break;
        }
    }
    return { token: { type: 'list', items }, next: i };
}

function lexOrderedList(lines: string[], i: number): { token: InlineToken; next: number } | null {
    const m = lines[i]!.match(/^\s*\d+\.\s+(.*)$/);
    if (!m) return null;
    const items: Array<{ tokens: InlineToken[] }> = [];
    while (i < lines.length) {
        const m2 = lines[i]!.match(/^\s*\d+\.\s+(.*)$/);
        if (m2) {
            items.push({ tokens: lexInline(m2[1]!) });
            i++;
        } else if (lines[i]!.trim() === '') {
            break;
        } else {
            break;
        }
    }
    return { token: { type: 'list', items }, next: i };
}

function lexTableBlock(lines: string[], i: number): { token: InlineToken; next: number } | null {
    if (!lines[i]!.trimStart().startsWith('|')) return null;
    const tableLines: string[] = [];
    while (i < lines.length && lines[i]!.includes('|')) {
        tableLines.push(lines[i]!);
        i++;
    }
    return { token: lexPipeTable(tableLines), next: i };
}

function lexParagraph(lines: string[], i: number): { token: InlineToken; next: number } {
    const paraLines: string[] = [lines[i]!];
    i++;
    while (i < lines.length) {
        const n = lines[i]!;
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
        if (t.type === 'space' && idx > 0 && arr[idx - 1]!.type === 'space') return false;
        return true;
    });
}

// ─── Block-level lexer ──────────────────────────────────────────────────────────

function lexMarkdown(src: string): InlineToken[] {
    const tokens: InlineToken[] = [];
    const lines = src.split('\n');
    let i = 0;

    while (i < lines.length) {
        const line = lines[i]!;

        if (line.trim() === '') {
            tokens.push({ type: 'space' });
            i++;
            continue;
        }

        const h = lexHeading(line);
        if (h) {
            tokens.push(h);
            i++;
            continue;
        }

        const cb = lexCodeBlock(lines, i);
        if (cb) {
            tokens.push(cb.token);
            i = cb.next;
            continue;
        }

        if (/^-{3,}\s*$/.test(line.trim())) {
            tokens.push({ type: 'hr' });
            i++;
            continue;
        }

        const bq = lexBlockquote(lines, i);
        if (bq) {
            tokens.push(bq.token);
            i = bq.next;
            continue;
        }

        const ul = lexUnorderedList(lines, i);
        if (ul) {
            tokens.push(ul.token);
            i = ul.next;
            continue;
        }

        const ol = lexOrderedList(lines, i);
        if (ol) {
            tokens.push(ol.token);
            i = ol.next;
            continue;
        }

        const tbl = lexTableBlock(lines, i);
        if (tbl) {
            tokens.push(tbl.token);
            i = tbl.next;
            continue;
        }

        const para = lexParagraph(lines, i);
        tokens.push(para.token);
        i = para.next;
    }

    return dedupeSpaces(tokens);
}

// ─── Test support: inject pre-parsed tokens ─────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _testTokens: any[] | null = null;

export function __setLexer(tokens: unknown[] | null): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    _testTokens = tokens as any[] | null;
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- token AST shape varies by lexer output, cannot be statically typed
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- token AST shape varies by lexer output, cannot be statically typed
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

// ─── Public API ─────────────────────────────────────────────────────────────────

export function md(markdown: string, availWidth?: number): string {
    const tokens = _testTokens ?? lexMarkdown(markdown);
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
