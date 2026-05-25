import { md, mdBox, __setLexer } from './markdown';

describe('md', () => {
    afterEach(() => {
        __setLexer(null);
    });

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

    it('renders ordered list', () => {
        const result = md('1. first\n2. second');
        expect(result).toContain('●');
        expect(result).toContain('first');
        expect(result).toContain('second');
    });

    it('renders blockquote', () => {
        const result = md('> cited text');
        expect(result).toContain('cited text');
    });

    it('renders strikethrough', () => {
        const result = md('~~struck~~');
        expect(result).toContain('~~struck~~');
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

describe('__setLexer token injection', () => {
    afterEach(() => {
        __setLexer(null);
    });

    it('uses injected tokens for rendering', () => {
        const tokens = [{ type: 'heading', depth: 1, tokens: [{ type: 'text', text: 'From injected tokens' }] }];
        __setLexer(tokens);
        const result = md('');
        expect(result).toContain('From injected tokens');
    });
});

describe('wrapCell extended edge cases', () => {
    afterEach(() => {
        __setLexer(null);
    });

    function makeTableTokens(headerCells: string[], rowCells: string[]) {
        return [
            {
                type: 'table',
                header: headerCells.map((h) => ({ tokens: [{ type: 'text', text: h }] })),
                rows: [rowCells.map((c) => ({ tokens: [{ type: 'text', text: c }] }))],
            },
        ];
    }

    it('wraps text longer than column width with spaces', () => {
        const text = 'hello world '.repeat(8);
        const tokens = makeTableTokens(['a'], [text]);
        __setLexer(tokens);
        const result = md('', 30);
        const lines = result.split('\n');
        expect(lines.length).toBeGreaterThan(3);
        expect(result).toContain('hello');
    });

    it('truncates text without spaces at column width', () => {
        const text = 'x'.repeat(80);
        const tokens = makeTableTokens(['a'], [text]);
        __setLexer(tokens);
        const result = md('', 30);
        const lines = result.split('\n');
        expect(lines.length).toBeGreaterThan(3);
    });

    it('handles empty cell text', () => {
        const tokens = makeTableTokens(['a', 'b'], ['', 'short']);
        __setLexer(tokens);
        const result = md('', 50);
        expect(result).toContain('short');
    });
});

describe('renderTokens additional types', () => {
    afterEach(() => {
        __setLexer(null);
    });

    it('renders space token as empty line', () => {
        const tokens = [
            { type: 'heading', depth: 1, tokens: [{ type: 'text', text: 'A' }] },
            { type: 'space' },
            { type: 'heading', depth: 2, tokens: [{ type: 'text', text: 'B' }] },
        ];
        __setLexer(tokens);
        const result = md('');
        expect(result).toContain('A');
        expect(result).toContain('B');
    });

    it('renders blockquote token', () => {
        const tokens = [{ type: 'blockquote', tokens: [{ type: 'text', text: 'cited text' }] }];
        __setLexer(tokens);
        const result = md('');
        expect(result).toContain('cited text');
    });
});

describe('renderInline additional types', () => {
    afterEach(() => {
        __setLexer(null);
    });

    it('renders codespan inline', () => {
        const tokens = [{ type: 'paragraph', tokens: [{ type: 'codespan', text: 'inline code' }] }];
        __setLexer(tokens);
        const result = md('');
        expect(result).toContain('inline code');
    });

    it('renders link inline', () => {
        const tokens = [{ type: 'paragraph', tokens: [{ type: 'link', text: 'click here' }] }];
        __setLexer(tokens);
        const result = md('');
        expect(result).toContain('click here');
    });

    it('renders br inline as newline', () => {
        const tokens = [
            {
                type: 'paragraph',
                tokens: [{ type: 'text', text: 'before' }, { type: 'br' }, { type: 'text', text: 'after' }],
            },
        ];
        __setLexer(tokens);
        const result = md('');
        expect(result).toContain('before');
        expect(result).toContain('after');
    });

    it('renders del inline with strikethrough', () => {
        const tokens = [
            {
                type: 'paragraph',
                tokens: [{ type: 'del', tokens: [{ type: 'text', text: 'struck' }] }],
            },
        ];
        __setLexer(tokens);
        const result = md('');
        expect(result).toContain('~~struck~~');
    });
});
