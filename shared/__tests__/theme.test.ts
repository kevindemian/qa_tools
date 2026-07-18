/**
 * Tests for theme — terminal UI theme derived from design tokens.
 */

import { getTheme, defaultTheme } from '../ui/theme.js';

describe('Theme', () => {
    it('getTheme returns defaultTheme', () => {
        expect(getTheme()).toBe(defaultTheme);
    });

    it('has expected color keys matching design tokens', () => {
        expect(defaultTheme.colors.success).toBe('#4ade80');
        expect(defaultTheme.colors.error).toBe('#f87171');
        expect(defaultTheme.colors.warn).toBe('#fbbf24');
        expect(defaultTheme.colors.info).toBe('#a5b4fc');
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
