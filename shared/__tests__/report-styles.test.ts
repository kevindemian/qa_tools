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

            expect(vars).toContain('#1a7f37');
            expect(vars).toContain('#d1242f');
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

        it('contains pipeline-health summary card CSS classes', () => {
            const css = buildCss();

            expect(css).toContain('.summary{');
            expect(css).toContain('.card .num{');
            expect(css).toContain('.card .num[data-color="info"]');
            expect(css).toContain('.card .num[data-color="success"]');
            expect(css).toContain('.card .num[data-color="error"]');
            expect(css).toContain('.card .num[data-status="pass"]');
            expect(css).toContain('.card .num[data-status="fail"]');
            expect(css).toContain('.failure-bar{');
        });

        it('contains pipeline-health error message CSS class', () => {
            const css = buildCss();

            expect(css).toContain('.error-msg{');
        });
    });
});
