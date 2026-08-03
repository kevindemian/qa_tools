/**
 * Tests for theme-tokens — validates token structure, values, and access patterns.
 *
 * @module theme-tokens.test
 */

import { tokens, getToken } from '../ui/theme-tokens.js';

function relativeLuminance(hex: string): number {
    const value = hex.replace('#', '');
    const r = parseInt(value.slice(0, 2), 16) / 255;
    const g = parseInt(value.slice(2, 4), 16) / 255;
    const b = parseInt(value.slice(4, 6), 16) / 255;
    const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrastRatio(foreground: string, background: string): number {
    const fg = relativeLuminance(foreground);
    const bg = relativeLuminance(background);
    const [lighter, darker] = fg >= bg ? [fg, bg] : [bg, fg];
    return (lighter + 0.05) / (darker + 0.05);
}

describe('Theme-tokens', () => {
    describe('Color.semantic', () => {
        it('has all four semantic colors (Primer light, B16/F5-T1)', () => {
            expect(tokens.color.semantic.success.light).toBe('#1a7f37');
            expect(tokens.color.semantic.error.light).toBe('#d1242f');
            expect(tokens.color.semantic.warn.light).toBe('#9a6700');
            expect(tokens.color.semantic.info.light).toBe('#0969da');
        });

        it('has dark variants', () => {
            expect(tokens.color.semantic.success.dark).toBe('#4ade80');
            expect(tokens.color.semantic.error.dark).toBe('#f87171');
            expect(tokens.color.semantic.warn.dark).toBe('#fbbf24');
            expect(tokens.color.semantic.info.dark).toBe('#a5b4fc');
        });

        it('light semantic colors meet WCAG AA text contrast ≥ 4.5:1 on white', () => {
            expect.hasAssertions();

            const white = '#ffffff';
            const cases = [
                { name: 'success', value: tokens.color.semantic.success.light },
                { name: 'error', value: tokens.color.semantic.error.light },
                { name: 'warn', value: tokens.color.semantic.warn.light },
                { name: 'info', value: tokens.color.semantic.info.light },
            ];
            for (const c of cases) {
                const ratio = contrastRatio(c.value, white);

                expect(ratio).toBeGreaterThanOrEqual(4.5);
            }
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
            expect(tokens.color.chart.pass).toBe('#1a7f37');
            expect(tokens.color.chart.fail).toBe('#d1242f');
            expect(tokens.color.chart.skip).toBe('#9a6700');
            expect(tokens.color.chart.line).toBe('#0969da');
            expect(tokens.color.chart.ref).toBe('#d1242f');
            expect(tokens.color.chart.onFillDark).toBe('#ffffff');
            expect(tokens.color.chart.onFillLight).toBe('#333333');
        });

        it('on-fill text tokens contrast with their fill colors', () => {
            expect(contrastRatio(tokens.color.chart.onFillDark, tokens.color.chart.pass)).toBeGreaterThanOrEqual(4.5);
            expect(contrastRatio(tokens.color.chart.onFillDark, tokens.color.chart.fail)).toBeGreaterThanOrEqual(4.5);
        });

        it('chart colors used as text meet WCAG AA contrast ≥ 4.5:1 on white', () => {
            expect.hasAssertions();

            const white = '#ffffff';
            for (const value of [
                tokens.color.chart.pass,
                tokens.color.chart.fail,
                tokens.color.chart.skip,
                tokens.color.chart.line,
                tokens.color.chart.ref,
            ]) {
                expect(contrastRatio(value, white)).toBeGreaterThanOrEqual(4.5);
            }
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
            expect(getToken('color.semantic.success.light')).toBe('#1a7f37');
            expect(getToken('spacing.lg')).toBe(16);
            expect(getToken('fontFamily')).toBe(tokens.fontFamily);
        });

        it('returns undefined for invalid paths', () => {
            expect(getToken('nonexistent')).toBeUndefined();
            expect(getToken('color.nonexistent')).toBeUndefined();
        });
    });
});
