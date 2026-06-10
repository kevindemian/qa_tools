/**
 * Tests for report-styles — CSS builder for HTML reports using design tokens.
 */

import { buildCss, buildCssVars, buildDarkVars } from './report-styles.js';

describe('report-styles', () => {
    describe('buildCssVars', () => {
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

    describe('buildDarkVars', () => {
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

    describe('buildCss', () => {
        it('returns a non-empty CSS string', () => {
            const css = buildCss();
            expect(css).toBeTruthy();
            expect(css.length).toBeGreaterThan(100);
        });

        it('contains CSS variables', () => {
            const css = buildCss();
            expect(css).toContain('--color-success');
            expect(css).toContain('--color-surface-card');
        });

        it('contains common CSS classes', () => {
            const css = buildCss();
            expect(css).toContain('.card');
            expect(css).toContain('body');
            expect(css).toContain('.footer');
        });

        it('contains chart styles', () => {
            const css = buildCss();
            expect(css).toContain('.chart-box');
            expect(css).toContain('.legend');
        });

        it('contains dark mode queries', () => {
            const css = buildCss();
            expect(css).toContain('html.dark');
        });

        it('contains print media query', () => {
            const css = buildCss();
            expect(css).toContain('@media print');
        });

        it('contains responsive breakpoints', () => {
            const css = buildCss();
            expect(css).toContain('@media(max-width:768px)');
            expect(css).toContain('@media(max-width:640px)');
        });

        it('contains tab styles', () => {
            const css = buildCss();
            expect(css).toContain('.tab-btn');
            expect(css).toContain('.tab-content');
        });
    });
});
