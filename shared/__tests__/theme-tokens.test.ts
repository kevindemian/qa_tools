/**
 * Tests for theme-tokens — validates token structure, values, and access patterns.
 *
 * @module theme-tokens.test
 */

import { tokens, getToken } from '../theme-tokens.js';

describe('Theme-tokens', () => {
    describe('Color.semantic', () => {
        it('has all four semantic colors', () => {
            expect(tokens.color.semantic.success.light).toBe('#22c55e');
            expect(tokens.color.semantic.error.light).toBe('#ef4444');
            expect(tokens.color.semantic.warn.light).toBe('#facc15');
            expect(tokens.color.semantic.info.light).toBe('#6366f1');
        });

        it('has dark variants', () => {
            expect(tokens.color.semantic.success.dark).toBe('#4ade80');
            expect(tokens.color.semantic.error.dark).toBe('#f87171');
            expect(tokens.color.semantic.warn.dark).toBe('#fbbf24');
            expect(tokens.color.semantic.info.dark).toBe('#a5b4fc');
        });
    });

    describe('Color.surface', () => {
        it('has page, card, elevated, input', () => {
            expect(tokens.color.surface.page.light).toBe('#f9fafb');
            expect(tokens.color.surface.card.light).toBe('#ffffff');
            expect(tokens.color.surface.elevated.light).toBe('#ffffff');
            expect(tokens.color.surface.input.light).toBe('#ffffff');
        });

        it('has dark variants for all surfaces', () => {
            expect(tokens.color.surface.page.dark).toBe('#0d1117');
            expect(tokens.color.surface.card.dark).toBe('#161b22');
            expect(tokens.color.surface.elevated.dark).toBe('#1c2128');
            expect(tokens.color.surface.input.dark).toBe('#21262d');
        });
    });

    describe('Color.text', () => {
        it('has primary, secondary, muted', () => {
            expect(tokens.color.text.primary.light).toBe('#111827');
            expect(tokens.color.text.secondary.light).toBe('#4b5563');
            expect(tokens.color.text.muted.light).toBe('#6b7280');
        });
    });

    describe('Color.badge', () => {
        it('has pass, fail, skip with bg and text', () => {
            expect(tokens.color.badge.pass.bg.light).toBe('#dcfce7');
            expect(tokens.color.badge.pass.text.light).toBe('#166534');
            expect(tokens.color.badge.fail.bg.light).toBe('#fecaca');
            expect(tokens.color.badge.fail.text.light).toBe('#991b1b');
            expect(tokens.color.badge.skip.bg.light).toBe('#fef9c3');
            expect(tokens.color.badge.skip.text.light).toBe('#854d0e');
        });

        it('has dark variants', () => {
            expect(tokens.color.badge.pass.bg.dark).toBe('#052e16');
            expect(tokens.color.badge.pass.text.dark).toBe('#4ade80');
        });
    });

    describe('Color.chart', () => {
        it('has chart colors', () => {
            expect(tokens.color.chart.pass).toBe('#22c55e');
            expect(tokens.color.chart.fail).toBe('#ef4444');
            expect(tokens.color.chart.skip).toBe('#facc15');
            expect(tokens.color.chart.line).toBe('#6366f1');
            expect(tokens.color.chart.ref).toBe('#ef4444');
        });
    });

    describe('Spacing', () => {
        it('has xs through xxxl', () => {
            expect(tokens.spacing.xs).toBe(4);
            expect(tokens.spacing.sm).toBe(8);
            expect(tokens.spacing.md).toBe(12);
            expect(tokens.spacing.lg).toBe(16);
            expect(tokens.spacing.xl).toBe(20);
            expect(tokens.spacing.xxl).toBe(24);
            expect(tokens.spacing.xxxl).toBe(32);
        });
    });

    describe('BorderRadius', () => {
        it('has sm, md, lg, pill', () => {
            expect(tokens.borderRadius.sm).toBe(4);
            expect(tokens.borderRadius.md).toBe(6);
            expect(tokens.borderRadius.lg).toBe(8);
            expect(tokens.borderRadius.pill).toBe(9999);
        });
    });

    describe('FontSize', () => {
        it('has xs through 2xl', () => {
            expect(tokens.fontSize.xs).toBe('0.7rem');
            expect(tokens.fontSize['2xl']).toBe('1.5rem');
        });
    });

    describe('FontWeight', () => {
        it('has normal through bold', () => {
            expect(tokens.fontWeight.normal).toBe(400);
            expect(tokens.fontWeight.bold).toBe(700);
        });
    });

    describe('FontFamily', () => {
        it('is a string', () => {
            expect(typeof tokens.fontFamily).toBe('string');
            expect(tokens.fontFamily.length).toBeGreaterThan(10);
        });
    });

    describe('Shadow', () => {
        it('has card and elevated', () => {
            expect(tokens.shadow.card).toContain('rgba');
            expect(tokens.shadow.elevated).toContain('rgba');
        });
    });

    describe('Breakpoint', () => {
        it('has sm, md, lg, xl', () => {
            expect(tokens.breakpoint.sm).toBe(640);
            expect(tokens.breakpoint.md).toBe(768);
            expect(tokens.breakpoint.lg).toBe(1024);
            expect(tokens.breakpoint.xl).toBe(1200);
        });
    });

    describe('GetToken', () => {
        it('retrieves nested tokens by dot path', () => {
            expect(getToken('color.semantic.success.light')).toBe('#22c55e');
            expect(getToken('spacing.lg')).toBe(16);
            expect(getToken('fontFamily')).toBe(tokens.fontFamily);
        });

        it('returns undefined for invalid paths', () => {
            expect(getToken('nonexistent')).toBeUndefined();
            expect(getToken('color.nonexistent')).toBeUndefined();
        });
    });
});
