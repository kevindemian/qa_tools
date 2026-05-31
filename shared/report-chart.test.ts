/** Tests for report-chart — SVG chart builders for HTML reports. */
import { buildChartSvg, buildMiniTrendChart } from './report-chart';

describe('buildChartSvg', () => {
    it('returns SVG string with passed/failed/skipped sections', () => {
        const svg = buildChartSvg({ passed: 10, failed: 3, skipped: 2, total: 15, duration: 5000 });
        expect(svg).toContain('<svg');
        expect(svg).toContain('#22c55e');
        expect(svg).toContain('#ef4444');
        expect(svg).toContain('#facc15');
    });

    it('handles zero values gracefully', () => {
        const svg = buildChartSvg({ passed: 0, failed: 0, skipped: 0, total: 0, duration: 0 });
        expect(svg).toContain('<svg');
        expect(svg).toContain('#e5e7eb');
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
        expect(svg).toContain('path');
        expect(svg).toContain('#6366f1');
    });

    it('handles empty data', () => {
        const svg = buildMiniTrendChart([]);
        expect(svg).toBe('');
    });
});
