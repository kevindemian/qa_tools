import { box, divider, card } from '../box.js';

describe('Box', () => {
    it('renders single border box with content', () => {
        const result = box(['hello', 'world'], { width: 30 });

        expect(result).toContain('┌');
        expect(result).toContain('┐');
        expect(result).toContain('└');
        expect(result).toContain('┘');
        expect(result).toContain('hello');
        expect(result).toContain('world');
    });

    it('renders double border box', () => {
        const result = box(['test'], { border: 'double', width: 20 });

        expect(result).toContain('╔');
        expect(result).toContain('╗');
        expect(result).toContain('╝');
    });

    it('renders round border box', () => {
        const result = box(['test'], { border: 'round', width: 20 });

        expect(result).toContain('╭');
        expect(result).toContain('╮');
        expect(result).toContain('╰');
        expect(result).toContain('╯');
    });

    it('renders title in top border', () => {
        const result = box(['content'], { title: 'Título', width: 30 });

        expect(result).toContain('Título');
    });

    it('includes padding', () => {
        const result = box(['hi'], { padding: 1, width: 20 });
        const lines = result.split('\n');

        // padding adds an empty line before and after content
        expect(lines.length).toBeGreaterThanOrEqual(4);
    });

    it('renders no border style', () => {
        const result = box(['hello'], { border: 'none', width: 20 });

        expect(result).not.toContain('┌');
        expect(result).toContain('hello');
    });

    it('handles empty content', () => {
        const result = box([], { width: 20 });

        expect(result).toContain('┌');
        expect(result).toContain('┘');
    });

    it('uses default single border when no border specified', () => {
        const result = box(['hello']);

        expect(result).toContain('┌');
        expect(result).toContain('hello');
    });

    it('handles empty content with auto-width computation', () => {
        const result = box([]);

        expect(result).toContain('┌');
        expect(result).toContain('┘');
    });
});

describe('Divider', () => {
    it('returns a line with border color', () => {
        const result = divider(40);

        expect(result.length).toBeGreaterThan(0);
    });
});

describe('Card', () => {
    it('renders a card with title and content', () => {
        const result = card('Status', ['Line 1', 'Line 2']);

        expect(result).toContain('Status');
        expect(result).toContain('Line 1');
        expect(result).toContain('Line 2');
    });

    it('renders card with custom border and color', () => {
        const result = card('Title', ['content'], { border: 'double', color: 'red' });

        expect(result).toContain('Title');
        expect(result).toContain('╔');
    });
});
