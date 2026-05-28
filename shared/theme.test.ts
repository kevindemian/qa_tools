import { getTheme, defaultTheme } from './theme';

describe('theme', () => {
    it('getTheme returns defaultTheme', () => {
        expect(getTheme()).toBe(defaultTheme);
    });

    it('has expected color keys', () => {
        expect(defaultTheme.colors.success).toBe('#3fb950');
        expect(defaultTheme.colors.error).toBe('#f85149');
        expect(defaultTheme.colors.warn).toBe('#d29922');
        expect(defaultTheme.colors.info).toBe('#58a6ff');
        expect(defaultTheme.colors.muted).toBe('#8b949e');
        expect(defaultTheme.colors.border).toBe('#30363d');
    });

    it('has border config with type and padding', () => {
        expect(defaultTheme.borders.type).toBe('single');
        expect(defaultTheme.borders.padding).toBe(1);
    });

    it('typography title uppercases input', () => {
        expect(defaultTheme.typography.title('hello')).toBe('HELLO');
    });

    it('typography label returns input as-is', () => {
        expect(defaultTheme.typography.label('hello')).toBe('hello');
    });

    it('typography value returns input as-is', () => {
        expect(defaultTheme.typography.value('hello')).toBe('hello');
    });
});
