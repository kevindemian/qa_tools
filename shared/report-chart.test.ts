/**
 * Tests for report-chart — SVG chart builders using primitives.
 */

import { buildChartSvg, buildMiniTrendChart, buildTrendSection, buildChartSection } from './report-chart';

describe('buildChartSvg', () => {
    it('returns SVG string with passed/failed/skipped sections', () => {
        const svg = buildChartSvg({ passed: 10, failed: 3, skipped: 2, total: 15, duration: 5000 });
        expect(svg).toContain('<svg');
        expect(svg).toContain('data-component="bar-chart"');
        expect(svg).toContain('#22c55e');
        expect(svg).toContain('#ef4444');
    });

    it('handles zero values gracefully', () => {
        const svg = buildChartSvg({ passed: 0, failed: 0, skipped: 0, total: 0, duration: 0 });
        expect(svg).toContain('<svg');
    });
});

describe('buildMiniTrendChart', () => {
    it('returns SVG string with data points', () => {
        const svg = buildMiniTrendChart([
            { label: 'Mon', passRate: 90, total: 10, failed: 1 },
            { label: 'Tue', passRate: 85, total: 10, failed: 2 },
            { label: 'Wed', passRate: 95, total: 10, failed: 0 },
        ]);
        expect(svg).toContain('<svg');
        expect(svg).toContain('data-component="trend-chart"');
        expect(svg).toContain('path');
        expect(svg).toContain('#6366f1');
    });

    it('handles empty data', () => {
        const svg = buildMiniTrendChart([]);
        expect(svg).toBe('');
    });
});

describe('buildTrendSection', () => {
    it('returns empty for <2 points', () => {
        const html = buildTrendSection([{ label: 'Mon', passRate: 90, total: 10, failed: 1 }]);
        expect(html).toBe('');
    });

    it('returns card for >=2 points', () => {
        const html = buildTrendSection([
            { label: 'Mon', passRate: 90, total: 10, failed: 1 },
            { label: 'Tue', passRate: 85, total: 10, failed: 2 },
        ]);
        expect(html).toContain('Pass Rate Trend');
        expect(html).toContain('data-component="card"');
    });
});

describe('buildChartSection', () => {
    it('returns empty when wantChart is false', () => {
        const html = buildChartSection({ passed: 5, failed: 1, skipped: 0, total: 6, duration: 100 }, false);
        expect(html).toBe('');
    });

    it('returns chart section with legend', () => {
        const stats = { passed: 5, failed: 1, skipped: 0, total: 6, duration: 100 };
        const html = buildChartSection(stats, true);
        expect(html).toContain('Distribution');
        expect(html).toContain('data-component="card"');
        expect(html).toContain('Passed (5)');
        expect(html).toContain('Failed (1)');
    });
});
