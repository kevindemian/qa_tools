/**
 * Tests for report-styles — CSS builder for HTML reports using design tokens.
 */

import { buildCss, buildCssVars, buildDarkVars } from '../report/report-styles.js';

describe('Report-styles', () => {
    describe('BuildCssVars', () => {
        it('generates :root with CSS custom properties', () => {
            const vars = buildCssVars();

            expect(vars).toContain(':root');
            expect(vars).toContain('--color-success');
            expect(vars).toContain('--color-surface-page');
            expect(vars).toContain('--color-text-primary');
            expect(vars).toContain('--color-border-default');
            expect(vars).toContain('--color-badge-pass-bg');
        });

        it('contains light-mode color values', () => {
            const vars = buildCssVars();

            expect(vars).toContain('#22c55e');
            expect(vars).toContain('#ef4444');
        });
    });

    describe('BuildDarkVars', () => {
        it('generates html.dark with CSS custom properties', () => {
            const vars = buildDarkVars();

            expect(vars).toContain('html.dark');
            expect(vars).toContain('--color-surface-page');
            expect(vars).toContain('--color-text-primary');
        });

        it('contains dark-mode color values', () => {
            const vars = buildDarkVars();

            expect(vars).toContain('#4ade80');
            expect(vars).toContain('#f87171');
            expect(vars).toContain('#0d1117');
            expect(vars).toContain('#161b22');
        });
    });

    describe('BuildCss', () => {
        it('returns a non-empty CSS string', () => {
            const css = buildCss();

            expect(css).toBeTruthy();
            expect(css.length).toBeGreaterThan(100);
        });

        it.each([
            { label: 'CSS variables', expected: ['--color-success', '--color-surface-card'] },
            { label: 'common CSS classes', expected: ['.card', 'body', '.footer'] },
            { label: 'chart styles', expected: ['.chart-box', '.legend'] },
            { label: 'dark mode queries', expected: ['html.dark'] },
            { label: 'print media query', expected: ['@media print'] },
            { label: 'responsive breakpoints', expected: ['@media(max-width:768px)', '@media(max-width:640px)'] },
            { label: 'tab styles', expected: ['.tab-btn', '.tab-content'] },
        ])('contains $label', ({ expected }) => {
            expect.hasAssertions();

            const css = buildCss();

            for (const token of expected) {
                expect(css).toContain(token);
            }
        });
    });
});
