/** Markdown lexer — parses raw Markdown source into an InlineToken AST.
 * @module Supported syntax: headings (#), bold (**), italic (*), strikethrough (~~),
 * inline code (`), code blocks (```), links [text](url), images ![alt](url),
 * unordered lists (-), ordered lists (1.), horizontal rules (---), tables (|...|),
 * blockquotes (>). */

// ─── Token types ───────────────────────────────────────────────────────────────

export interface InlineToken {
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

// ─── Utilities ──────────────────────────────────────────────────────────────────

/** Safe accessor for string arrays: returns the element at index `i` or an empty string fallback.
 *  Eliminates non-null assertions (`lines[i]!`) that would crash on undefined. */
function getLine(lines: string[], i: number): string {
    const line: unknown = Reflect.get(lines, i);
    return typeof line === 'string' ? line : '';
}

// ─── Inline handlers ────────────────────────────────────────────────────────────

function lexDel(src: string, i: number, flush: () => void, push: (t: InlineToken) => void): number | null {
    if (src.charAt(i) !== '~' || src.charAt(i + 1) !== '~') return null;
    const end = src.indexOf('~~', i + 2);
    if (end === -1) return null;
    flush();
    push({ type: 'del', tokens: lexInline(src.slice(i + 2, end)) });
    return end + 2;
}

function lexStrong(src: string, i: number, flush: () => void, push: (t: InlineToken) => void): number | null {
    if (src.charAt(i) !== '*' || src.charAt(i + 1) !== '*') return null;
    const end = src.indexOf('**', i + 2);
    if (end === -1) return null;
    flush();
    push({ type: 'strong', tokens: lexInline(src.slice(i + 2, end)) });
    return end + 2;
}

function lexEmStar(src: string, i: number, flush: () => void, push: (t: InlineToken) => void): number | null {
    if (src.charAt(i) !== '*' || src.charAt(i + 1) === '*') return null;
    const end = src.indexOf('*', i + 1);
    if (end === -1) return null;
    flush();
    push({ type: 'em', tokens: lexInline(src.slice(i + 1, end)) });
    return end + 1;
}

function lexEmUnderscore(src: string, i: number, flush: () => void, push: (t: InlineToken) => void): number | null {
    if (src.charAt(i) !== '_') return null;
    const end = src.indexOf('_', i + 1);
    if (end === -1) return null;
    flush();
    push({ type: 'em', tokens: lexInline(src.slice(i + 1, end)) });
    return end + 1;
}

function lexCodeSpan(src: string, i: number, flush: () => void, push: (t: InlineToken) => void): number | null {
    if (src.charAt(i) !== '`') return null;
    const end = src.indexOf('`', i + 1);
    if (end === -1) return null;
    flush();
    push({ type: 'codespan', text: src.slice(i + 1, end) });
    return end + 1;
}

function lexLink(src: string, i: number, flush: () => void, push: (t: InlineToken) => void): number | null {
    if (src.charAt(i) !== '[') return null;
    const cb = src.indexOf(']', i + 1);
    if (cb === -1 || src.charAt(cb + 1) !== '(') return null;
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
        buf += src.charAt(i);
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
    const hashEnd = line.indexOf(' ');
    if (hashEnd < 1 || hashEnd > 6) return null;
    for (let i = 0; i < hashEnd; i++) {
        if (line.charAt(i) !== '#') return null;
    }
    const content = line.slice(hashEnd + 1);
    if (!content) return null;
    return { type: 'heading', depth: hashEnd, tokens: lexInline(content) };
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

function parseBulletLine(line: string): string | null {
    const trimmed = line.trimStart();
    if (trimmed.length < 2) return null;
    const ch = trimmed.charAt(0);
    if (ch !== '-' && ch !== '*' && ch !== '+') return null;
    if (trimmed.charAt(1) !== ' ' && trimmed.charAt(1) !== '\t') return null;
    return trimmed.slice(2);
}

function parseNumberedLine(line: string): string | null {
    const trimmed = line.trimStart();
    let dotIdx = -1;
    for (let j = 0; j < trimmed.length && j < 4; j++) {
        const c = trimmed.charAt(j);
        if (c === '.') {
            dotIdx = j;
            break;
        }
        if (c < '0' || c > '9') return null;
    }
    if (dotIdx < 1) return null;
    const rest = trimmed.slice(dotIdx + 1);
    if (rest.length === 0 || (rest.charAt(0) !== ' ' && rest.charAt(0) !== '\t')) return null;
    return rest.slice(1);
}

function lexUnorderedList(lines: string[], i: number): { token: InlineToken; next: number } | null {
    const content = parseBulletLine(getLine(lines, i));
    if (content === null) return null;
    const items: Array<{ tokens: InlineToken[] }> = [];
    while (i < lines.length) {
        const c = parseBulletLine(getLine(lines, i));
        if (c !== null) {
            items.push({ tokens: lexInline(c) });
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
    const content = parseNumberedLine(getLine(lines, i));
    if (content === null) return null;
    const items: Array<{ tokens: InlineToken[] }> = [];
    while (i < lines.length) {
        const c = parseNumberedLine(getLine(lines, i));
        if (c !== null) {
            items.push({ tokens: lexInline(c) });
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
    return tokens.filter((t, idx, arr) => !(t.type === 'space' && idx > 0 && arr[idx - 1]?.type === 'space'));
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

export function lexMarkdown(src: string): InlineToken[] {
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

export function getTestTokens(): InlineToken[] | null {
    return _testTokens;
}
