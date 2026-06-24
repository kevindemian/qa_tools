import { md, mdBox, mdToHtml, __setLexer } from './markdown.js';

describe('Md', () => {
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

describe('RenderPipeTable edge cases', () => {
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

describe('MdBox', () => {
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

describe('WrapCell extended edge cases', () => {
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

describe('RenderTokens additional types', () => {
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

describe('RenderInline additional types', () => {
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

describe('MdToHtml', () => {
    it('wraps output in full HTML document', () => {
        const result = mdToHtml('# Hello');

        expect(result).toContain('<!DOCTYPE html>');
        expect(result).toContain('<h1>Hello</h1>');
        expect(result).toContain('</body></html>');
    });

    it('renders headings with correct levels', () => {
        const result = mdToHtml('## Sub\n### Subsub');

        expect(result).toContain('<h2>Sub</h2>');
        expect(result).toContain('<h3>Subsub</h3>');
    });

    it('renders paragraph text', () => {
        const result = mdToHtml('a simple paragraph');

        expect(result).toContain('<p>a simple paragraph</p>');
    });

    it('renders bold and italic', () => {
        const result = mdToHtml('**bold** and *italic*');

        expect(result).toContain('<strong>bold</strong>');
        expect(result).toContain('<em>italic</em>');
    });

    it('renders inline code', () => {
        const result = mdToHtml('use `code` here');

        expect(result).toContain('<code>code</code>');
    });

    it('renders code block', () => {
        const result = mdToHtml('```\nconst x = 1;\n```');

        expect(result).toContain('<pre><code>');
        expect(result).toContain('const x = 1;');
        expect(result).toContain('</code></pre>');
    });

    it('renders unordered list', () => {
        const result = mdToHtml('- item 1\n- item 2');

        expect(result).toContain('<ul>');
        expect(result).toContain('<li>item 1</li>');
        expect(result).toContain('<li>item 2</li>');
    });

    it('renders ordered list', () => {
        const result = mdToHtml('1. first\n2. second');

        expect(result).toContain('<ul>');
        expect(result).toContain('<li>first</li>');
    });

    it('renders table', () => {
        const result = mdToHtml('| a | b |\n|---|---|\n| 1 | 2 |');

        expect(result).toContain('<table>');
        expect(result).toContain('<th>a</th>');
        expect(result).toContain('<td>1</td>');
    });

    it('renders horizontal rule', () => {
        const result = mdToHtml('---');

        expect(result).toContain('<hr>');
    });

    it('renders blockquote', () => {
        const result = mdToHtml('> cited text');

        expect(result).toContain('<blockquote>');
        expect(result).toContain('cited text');
    });

    it('renders link with href', () => {
        const result = mdToHtml('[click](https://example.com)');

        expect(result).toContain('<a href="https://example.com">');
        expect(result).toContain('click');
        expect(result).toContain('</a>');
    });

    it('escapes HTML in text', () => {
        const result = mdToHtml('<script>alert("xss")</script>');

        expect(result).not.toContain('<script>');
        expect(result).toContain('&lt;script&gt;');
    });

    it('handles empty input', () => {
        const result = mdToHtml('');

        expect(result).toContain('<body></body>');
    });

    it('uses custom title', () => {
        const result = mdToHtml('# Hi', 'My Title');

        expect(result).toContain('<title>My Title</title>');
    });

    it('renders strikethrough', () => {
        const result = mdToHtml('~~struck~~');

        expect(result).toContain('<del>struck</del>');
    });

    it('converts .md link to .html', () => {
        const result = mdToHtml('[see](guide.md)');

        expect(result).toContain('<a href="guide.html">');
    });

    it('preserves anchor in .md link conversion', () => {
        const result = mdToHtml('[see](guide.md#section)');

        expect(result).toContain('<a href="guide.html#section">');
    });

    it('does NOT convert external .md links', () => {
        const result = mdToHtml('[ext](https://example.com/doc.md)');

        expect(result).toContain('href="https://example.com/doc.md"');
    });

    it('does NOT convert non-.md links', () => {
        const result = mdToHtml('[pdf](file.pdf)');

        expect(result).toContain('href="file.pdf"');
    });

    it('injects nav bar when NavConfig provided', () => {
        const result = mdToHtml('Content', 'Test', {
            prev: { label: 'Anterior', file: 'prev.html' },
            next: { label: 'Próximo', file: 'next.html' },
        });

        expect(result).toContain('class="nav-bar"');
        expect(result).toContain('href="prev.html"');
        expect(result).toContain('Anterior');
        expect(result).toContain('href="next.html"');
        expect(result).toContain('Próximo');
        expect(result).toContain('href="index.html"');
        expect(result).toContain('Índice');
    });

    it('nav bar omits prev/next when not provided', () => {
        const result = mdToHtml('Content', 'Test', {});

        expect(result).toContain('class="nav-bar"');
        expect(result).toContain('Índice');
        expect(result).not.toContain('←');
        expect(result).not.toContain('→');
    });

    it('nav bar does not appear without NavConfig', () => {
        const result = mdToHtml('Content');

        expect(result).not.toContain('nav-bar');
    });
});
