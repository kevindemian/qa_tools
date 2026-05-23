import { box, divider } from './box';

describe('box', () => {
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
});

describe('divider', () => {
    it('returns a line with border color', () => {
        const result = divider(40);
        expect(result.length).toBeGreaterThan(0);
    });
});
