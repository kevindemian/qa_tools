/**
 * Tests for theme — terminal UI theme derived from design tokens.
 */

import { getTheme, defaultTheme } from './theme.js';

describe('theme', () => {
    it('getTheme returns defaultTheme', async () => {
        expect(getTheme()).toBe(defaultTheme);
    });

    it('has expected color keys matching design tokens', async () => {
        expect(defaultTheme.colors.success).toBe('#4ade80');
        expect(defaultTheme.colors.error).toBe('#f87171');
        expect(defaultTheme.colors.warn).toBe('#fbbf24');
        expect(defaultTheme.colors.info).toBe('#a5b4fc');
        expect(defaultTheme.colors.muted).toBe('#8b949e');
        expect(defaultTheme.colors.border).toBe('#30363d');
    });

    it('has border config with type and padding', async () => {
        expect(defaultTheme.borders.type).toBe('single');
        expect(defaultTheme.borders.padding).toBe(1);
    });

    it('typography title uppercases input', async () => {
        expect(defaultTheme.typography.title('hello')).toBe('HELLO');
    });

    it('typography label returns input as-is', async () => {
        expect(defaultTheme.typography.label('hello')).toBe('hello');
    });

    it('typography value returns input as-is', async () => {
        expect(defaultTheme.typography.value('hello')).toBe('hello');
    });
});
