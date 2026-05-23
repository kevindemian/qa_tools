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
                let remaining = line;
                const parts: Array<{ text: string }> = [];
                const i = remaining.indexOf('**');
                if (i >= 0) {
                    const before = remaining.slice(0, i);
                    const boldEnd = remaining.indexOf('**', i + 2);
                    if (boldEnd >= 0) {
                        if (before) parts.push({ text: before });
                        parts.push({ text: remaining.slice(i + 2, boldEnd) });
                        remaining = remaining.slice(boldEnd + 2);
                    }
                }
                if (remaining && !parts.length) parts.push({ text: remaining });
                if (parts.length) {
                    for (const p of parts) {
                        if (p === parts[0] && p.text) inline.push({ type: 'text', text: p.text });
                        else inline.push({ type: 'strong', tokens: [{ type: 'text', text: p.text }] });
                    }
                } else if (line.trim()) {
                    inline.push({ type: 'text', text: line });
                }
                if (inline.length) {
                    tokens.push({ type: 'paragraph', tokens: inline });
                }
            }
        }
        return tokens;
    };
    return { lexer };
});

import { md } from './markdown';

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
});
