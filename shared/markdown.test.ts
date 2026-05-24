// Mock marked to avoid ESM import issues in Jest
jest.mock('marked', () => {
    const lexer = (src: string) => {
        if (!src) return [];
        const tokens: Array<{ type: string; [key: string]: unknown }> = [];
        const lines = src.split('\n');
        for (const line of lines) {
            if (line.startsWith('# ')) {
                tokens.push({
                    type: 'heading',
                    depth: 1,
                    tokens: [{ type: 'text', text: line.slice(2), raw: line.slice(2) }],
                });
            } else if (line.startsWith('## ')) {
                tokens.push({
                    type: 'heading',
                    depth: 2,
                    tokens: [{ type: 'text', text: line.slice(3), raw: line.slice(3) }],
                });
            } else if (line.startsWith('- ')) {
                tokens.push({
                    type: 'list',
                    items: [{ tokens: [{ type: 'text', text: line.slice(2), raw: line.slice(2) }] }],
                });
            } else if (line.startsWith('|')) {
                const cells = line
                    .split('|')
                    .filter(Boolean)
                    .map((c) => c.trim());
                if (cells.length && cells.every((c) => /^-+$/.test(c))) continue;
                tokens.push({
                    type: 'table',
                    header: cells.map((c) => ({ tokens: [{ type: 'text', text: c, raw: c }] })),
                    rows: [],
                });
            } else if (line.startsWith('---')) {
                tokens.push({ type: 'hr' });
            } else if (line.startsWith('> ')) {
                tokens.push({
                    type: 'blockquote',
                    tokens: [{ type: 'text', text: line.slice(2), raw: line.slice(2) }],
                });
            } else if (line.startsWith('```')) {
                const codeLines = [];
                const remaining = lines.slice(lines.indexOf(line) + 1);
                for (const cl of remaining) {
                    if (cl.startsWith('```')) break;
                    codeLines.push(cl);
                }
                tokens.push({ type: 'code', text: codeLines.join('\n') });
            } else {
                const inline: Array<{ type: string; text?: string; tokens?: unknown[] }> = [];
                const remaining = line;
                const parseInline = (txt: string): Array<{ type: string; text?: string; tokens?: unknown[] }> => {
                    const result: Array<{ type: string; text?: string; tokens?: unknown[] }> = [];
                    let cursor = 0;
                    const regex = /(\*\*(\w[\w\s]*\w|\w)\*\*)|(\*(\w[\w\s]*\w|\w)\*)|(`[^`]+`)/g;
                    let match: RegExpExecArray | null;
                    while ((match = regex.exec(txt)) !== null) {
                        if (match.index > cursor) {
                            result.push({ type: 'text', text: txt.slice(cursor, match.index) });
                        }
                        if (match[1]) {
                            result.push({ type: 'strong', tokens: [{ type: 'text', text: match[2] }] });
                        } else if (match[3]) {
                            result.push({ type: 'em', tokens: [{ type: 'text', text: match[4] }] });
                        } else if (match[5]) {
                            result.push({ type: 'codespan', text: match[5].slice(1, -1) });
                        }
                        cursor = match.index + match[0].length;
                    }
                    if (cursor < txt.length) {
                        result.push({ type: 'text', text: txt.slice(cursor) });
                    }
                    return result;
                };
                const inlineTokens = parseInline(line);
                if (inlineTokens.length) {
                    tokens.push({ type: 'paragraph', tokens: inlineTokens });
                }
            }
        }
        return tokens;
    };
    return { lexer };
});

import { md, mdBox, __setLexer } from './markdown';

describe('md', () => {
    it('renders headings', () => {
        const result = md('# Heading 1');
        expect(result).toContain('Heading 1');
    });

    it('renders bold text', () => {
        const result = md('**bold**');
        expect(result).toContain('bold');
    });

    it('renders code block', () => {
        const result = md('```\ncode\n```');
        expect(result).toContain('code');
    });

    it('renders lists', () => {
        const result = md('- item 1\n- item 2');
        expect(result).toContain('●');
        expect(result).toContain('item 1');
        expect(result).toContain('item 2');
    });

    it('renders table', () => {
        const result = md('| a | b |\n|---|---|\n| 1 | 2 |');
        expect(result).toContain('a');
        expect(result).toContain('1');
    });

    it('renders hr', () => {
        const result = md('---');
        expect(result.length).toBeGreaterThan(0);
    });

    it('handles empty input', () => {
        const result = md('');
        expect(result).toBe('');
    });

    it('renders mixed content', () => {
        const result = md('# Title\n\nParagraph text\n\n- item');
        expect(result).toContain('Title');
        expect(result).toContain('Paragraph');
        expect(result).toContain('●');
        expect(result).toContain('item');
    });

    it('renders codespan', () => {
        const result = md('use `code` inline');
        expect(result).toContain('code');
    });

    it('renders italic text', () => {
        const result = md('this is *italic* text');
        expect(result).toContain('italic');
        expect(result).toContain('\x1b[3m');
    });

    it('renders strong text inside paragraph', () => {
        const result = md('a **bold** word');
        expect(result).toContain('bold');
        expect(result).toContain('\x1b[1m');
    });

    it('renders mixed inline tokens', () => {
        const result = md('text **bold** and *italic* and `code`');
        expect(result).toContain('bold');
        expect(result).toContain('italic');
        expect(result).toContain('code');
    });
});

describe('renderPipeTable edge cases', () => {
    it('handles long cell content with word wrapping', () => {
        const result = md('| a | b |\n|---|---|\n| ' + 'x'.repeat(50) + ' | short |');
        expect(result).toContain('x'.repeat(50).slice(0, 10));
    });

    it('handles empty cell content', () => {
        const result = md('| a | b |\n|---|---|\n|  | short |');
        expect(result).toContain('a');
        expect(result).toContain('b');
    });
});

describe('mdBox', () => {
    it('renders box with markdown content', () => {
        const result = mdBox('# Title', { title: 'Doc', border: 'round' });
        expect(result).toContain('Title');
        expect(result).toContain('╭');
        expect(result).toContain('╮');
    });

    it('uses round border by default', () => {
        const result = mdBox('text');
        expect(result).toContain('╭');
        expect(result).toContain('╰');
    });

    it('accepts custom border style', () => {
        const result = mdBox('text', { border: 'double' });
        expect(result).toContain('╔');
        expect(result).toContain('╚');
    });
});

describe('__setLexer', () => {
    afterEach(() => {
        __setLexer(null);
    });

    it('uses injected lexer for custom token arrays', () => {
        const mockLexer = jest
            .fn()
            .mockReturnValue([{ type: 'heading', depth: 1, tokens: [{ type: 'text', text: 'From mock lexer' }] }]);
        __setLexer(mockLexer);
        const result = md('# Not used');
        expect(result).toContain('From mock lexer');
        expect(mockLexer).toHaveBeenCalledWith('# Not used');
    });
});

describe('wrapCell extended edge cases', () => {
    afterEach(() => {
        __setLexer(null);
    });

    function makeTableLexer(headerCells: string[], rowCells: string[]) {
        return jest.fn().mockReturnValue([
            {
                type: 'table',
                header: headerCells.map((h) => ({ tokens: [{ type: 'text', text: h }] })),
                rows: [rowCells.map((c) => ({ tokens: [{ type: 'text', text: c }] }))],
            },
        ]);
    }

    it('wraps text longer than column width with spaces', () => {
        const text = 'hello world '.repeat(8);
        const mockLexer = makeTableLexer(['a'], [text]);
        __setLexer(mockLexer);
        const result = md('', 30);
        const lines = result.split('\n');
        expect(lines.length).toBeGreaterThan(3);
        expect(result).toContain('hello');
    });

    it('truncates text without spaces at column width', () => {
        const text = 'x'.repeat(80);
        const mockLexer = makeTableLexer(['a'], [text]);
        __setLexer(mockLexer);
        const result = md('', 30);
        const lines = result.split('\n');
        expect(lines.length).toBeGreaterThan(3);
    });

    it('handles empty cell text', () => {
        const mockLexer = makeTableLexer(['a', 'b'], ['', 'short']);
        __setLexer(mockLexer);
        const result = md('', 50);
        expect(result).toContain('short');
    });
});

describe('renderTokens additional types', () => {
    afterEach(() => {
        __setLexer(null);
    });

    it('renders space token as empty line', () => {
        const mockLexer = jest
            .fn()
            .mockReturnValue([
                { type: 'heading', depth: 1, tokens: [{ type: 'text', text: 'A' }] },
                { type: 'space' },
                { type: 'heading', depth: 2, tokens: [{ type: 'text', text: 'B' }] },
            ]);
        __setLexer(mockLexer);
        const result = md('');
        expect(result).toContain('A');
        expect(result).toContain('B');
    });

    it('renders blockquote token', () => {
        const mockLexer = jest
            .fn()
            .mockReturnValue([{ type: 'blockquote', tokens: [{ type: 'text', text: 'cited text' }] }]);
        __setLexer(mockLexer);
        const result = md('');
        expect(result).toContain('cited text');
    });
});

describe('renderInline additional types', () => {
    afterEach(() => {
        __setLexer(null);
    });

    it('renders codespan inline', () => {
        const mockLexer = jest
            .fn()
            .mockReturnValue([{ type: 'paragraph', tokens: [{ type: 'codespan', text: 'inline code' }] }]);
        __setLexer(mockLexer);
        const result = md('');
        expect(result).toContain('inline code');
    });

    it('renders link inline', () => {
        const mockLexer = jest
            .fn()
            .mockReturnValue([{ type: 'paragraph', tokens: [{ type: 'link', text: 'click here' }] }]);
        __setLexer(mockLexer);
        const result = md('');
        expect(result).toContain('click here');
    });

    it('renders br inline as newline', () => {
        const mockLexer = jest.fn().mockReturnValue([
            {
                type: 'paragraph',
                tokens: [{ type: 'text', text: 'before' }, { type: 'br' }, { type: 'text', text: 'after' }],
            },
        ]);
        __setLexer(mockLexer);
        const result = md('');
        expect(result).toContain('before');
        expect(result).toContain('after');
    });

    it('renders del inline with strikethrough', () => {
        const mockLexer = jest.fn().mockReturnValue([
            {
                type: 'paragraph',
                tokens: [{ type: 'del', tokens: [{ type: 'text', text: 'struck' }] }],
            },
        ]);
        __setLexer(mockLexer);
        const result = md('');
        expect(result).toContain('~~struck~~');
    });
});
