/* eslint-disable @typescript-eslint/no-explicit-any */
class MockParser {
    parse(tokens: any[]): string {
        return tokens
            .map((t: any) => {
                if (t.type === 'text' || t.type === 'paragraph') return String(t.text || '');
                if (t.type === 'strong') {
                    const inner: any[] = t.tokens || [];
                    return '\x1b[1m' + inner.map((tt: any) => tt.text || '').join('') + '\x1b[22m';
                }
                if (t.type === 'code') return String(t.text || '');
                return '';
            })
            .join('');
    }

    parseInline(tokens: any[]): string {
        return tokens
            .map((t: any) => {
                if (t.type === 'text') return String(t.text || '');
                if (t.type === 'strong') {
                    const inner: any[] = t.tokens || [];
                    return '\x1b[1m' + inner.map((tt: any) => tt.text || '').join('') + '\x1b[22m';
                }
                if (t.type === 'codespan') return String(t.text || '');
                return '';
            })
            .join('');
    }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

jest.mock('marked', () => {
    function inlineTokens(src: string): Array<Record<string, unknown>> {
        const tokens: Array<Record<string, unknown>> = [];
        let remaining = src;
        while (remaining) {
            const boldStart = remaining.indexOf('**');
            const codeStart = remaining.indexOf('`');
            const first = Math.min(boldStart >= 0 ? boldStart : Infinity, codeStart >= 0 ? codeStart : Infinity);
            if (first > 0) {
                tokens.push({ type: 'text', text: remaining.slice(0, first) });
                remaining = remaining.slice(first);
            } else if (first === 0) {
                if (remaining.startsWith('**')) {
                    const end = remaining.indexOf('**', 2);
                    if (end >= 0) {
                        tokens.push({ type: 'strong', tokens: [{ type: 'text', text: remaining.slice(2, end) }] });
                        remaining = remaining.slice(end + 2);
                    } else {
                        tokens.push({ type: 'text', text: remaining });
                        remaining = '';
                    }
                } else if (remaining.startsWith('`')) {
                    const end = remaining.indexOf('`', 1);
                    if (end >= 0) {
                        tokens.push({ type: 'codespan', text: remaining.slice(1, end) });
                        remaining = remaining.slice(end + 1);
                    } else {
                        tokens.push({ type: 'text', text: remaining });
                        remaining = '';
                    }
                } else {
                    tokens.push({ type: 'text', text: remaining[0] });
                    remaining = remaining.slice(1);
                }
            } else {
                tokens.push({ type: 'text', text: remaining });
                remaining = '';
            }
        }
        return tokens;
    }

    function mockParse(src: string, opts?: { renderer?: Record<string, (...args: unknown[]) => string> }): string {
        if (!src) return '';
        const renderer = opts?.renderer;
        if (!renderer) return src;
        const lines = src.split('\n');
        let out = '';
        let i = 0;
        while (i < lines.length) {
            const line = lines[i];
            if (line.startsWith('# ')) {
                const text = line.slice(2);
                out += renderer.heading({ type: 'heading', depth: 1, text, tokens: inlineTokens(text) });
                i++;
            } else if (line.startsWith('- ')) {
                const items: Array<Record<string, unknown>> = [];
                while (i < lines.length && lines[i].startsWith('- ')) {
                    items.push({ tokens: inlineTokens(lines[i].slice(2)) });
                    i++;
                }
                out += renderer.list({ type: 'list', items });
            } else if (line.match(/^\d+\. /)) {
                const items: Array<Record<string, unknown>> = [];
                while (i < lines.length && lines[i].match(/^\d+\. /)) {
                    items.push({ tokens: inlineTokens(lines[i].replace(/^\d+\.\s*/, '')) });
                    i++;
                }
                out += renderer.list({ type: 'list', items });
            } else if (line.startsWith('|') && i + 1 < lines.length && /^\|[-:| ]+\|$/.test(lines[i + 1])) {
                const header = line
                    .split('|')
                    .filter(Boolean)
                    .map((c) => ({ tokens: inlineTokens(c.trim()) }));
                i += 2;
                const rows: Array<Array<Record<string, unknown>>> = [];
                while (i < lines.length && lines[i].startsWith('|')) {
                    const cells = lines[i]
                        .split('|')
                        .filter(Boolean)
                        .map((c) => ({ tokens: inlineTokens(c.trim()) }));
                    rows.push(cells);
                    i++;
                }
                out += renderer.table({ type: 'table', header, rows });
            } else if (line.startsWith('---')) {
                out += renderer.hr();
                i++;
            } else if (line.startsWith('```')) {
                const codeLines: string[] = [];
                i++;
                while (i < lines.length && !lines[i].startsWith('```')) {
                    codeLines.push(lines[i]);
                    i++;
                }
                i++;
                out += renderer.code({ type: 'code', text: codeLines.join('\n'), lang: '' });
            } else if (line.match(/^\s*$/) && renderer.space) {
                out += renderer.space();
                i++;
            } else if (line.trim()) {
                out += renderer.paragraph({ type: 'paragraph', tokens: inlineTokens(line) });
                i++;
            } else {
                i++;
            }
        }
        return out;
    }

    class MockRenderer {
        parser: MockParser;
        constructor() {
            this.parser = new MockParser();
        }
    }

    return { Renderer: MockRenderer, marked: { parse: mockParse } };
});
