/** Tests for report-styles — CSS builder for HTML reports. */
jest.mock('./theme', () => ({
    getTheme: jest.fn(() => ({
        colors: { success: '#22c55e', error: '#ef4444', warn: '#facc15', primary: '#6366f1' },
    })),
}));

import { buildCss } from './report-styles';

describe('buildCss', () => {
    it('returns a non-empty CSS string', () => {
        const css = buildCss();
        expect(css).toBeTruthy();
        expect(css.length).toBeGreaterThan(100);
    });

    it('contains common CSS classes', () => {
        const css = buildCss();
        expect(css).toContain('.card');
        expect(css).toContain('.summary');
        expect(css).toContain('.status-badge');
    });

    it('references theme colors', () => {
        const css = buildCss();
        expect(css).toContain('#22c55e');
        expect(css).toContain('#ef4444');
        expect(css).toContain('#facc15');
    });

    it('contains dark mode queries', () => {
        const css = buildCss();
        expect(css).toContain('html.dark');
    });

    it('contains print media query', () => {
        const css = buildCss();
        expect(css).toContain('@media print');
    });

    it('contains hierarchy sidebar styles', () => {
        const css = buildCss();
        expect(css).toContain('.sidebar');
        expect(css).toContain('.tree-node');
    });

    it('contains mini-trend chart styles', () => {
        const css = buildCss();
        expect(css).toContain('.mini-trend');
    });

    it('contains tab styles', () => {
        const css = buildCss();
        expect(css).toContain('.tab-btn');
        expect(css).toContain('.tab-content');
    });
});
