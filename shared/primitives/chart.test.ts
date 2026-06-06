/**
 * Tests for chart primitives — BarChart, TrendChart, Sparkline, ProgressBar.
 *
 * @module primitives/chart.test
 */

import { BarChart, TrendChart, Sparkline, ProgressBar } from './chart.js';

describe('chart primitives', () => {
    describe('BarChart', () => {
        it('renders SVG with segments', async () => {
            const html = BarChart({
                segments: [
                    { value: 10, color: '#22c55e', label: 'pass' },
                    { value: 5, color: '#ef4444', label: 'fail' },
                ],
            });
            expect(html).toContain('data-component="bar-chart"');
            expect(html).toContain('<svg');
            expect(html).toContain('rect');
            expect(html).toContain('role="img"');
        });

        it('renders labels for wide segments', async () => {
            const html = BarChart({
                segments: [{ value: 100, color: '#22c55e', label: 'all' }],
                width: 300,
                height: 30,
            });
            expect(html).toContain('all');
        });

        it('handles empty total gracefully', async () => {
            const html = BarChart({
                segments: [{ value: 0, color: '#22c55e' }],
            });
            expect(html).toContain('<svg');
        });
    });

    describe('TrendChart', () => {
        it('renders SVG for 2+ points', async () => {
            const html = TrendChart({
                points: [{ passRate: 80 }, { passRate: 90 }, { passRate: 85 }],
            });
            expect(html).toContain('data-component="trend-chart"');
            expect(html).toContain('path');
        });

        it('returns empty for < 2 points', async () => {
            const html = TrendChart({ points: [{ passRate: 80 }] });
            expect(html).toBe('');
        });

        it('renders ref line', async () => {
            const html = TrendChart({
                points: [{ passRate: 80 }, { passRate: 90 }],
                refLine: 85,
                refLabel: '85%',
            });
            expect(html).toContain('85%');
        });
    });

    describe('Sparkline', () => {
        it('renders bar element', async () => {
            const html = Sparkline({ value: 50 });
            expect(html).toContain('data-component="sparkline"');
            expect(html).toContain('role="img"');
            expect(html).toContain('width:100px');
            expect(html).toContain('height:8px');
        });

        it('uses high color for >= 50', async () => {
            const html = Sparkline({ value: 75 });
            expect(html).toContain('#ef4444');
        });
    });

    describe('ProgressBar', () => {
        it('renders progress element', async () => {
            const html = ProgressBar({ value: 75 });
            expect(html).toContain('data-component="progress-bar"');
            expect(html).toContain('role="progressbar"');
            expect(html).toContain('aria-valuenow="75"');
            expect(html).toContain('width:75%');
        });

        it('renders with showLabel', async () => {
            const html = ProgressBar({ value: 50, showLabel: true });
            expect(html).toContain('50%');
        });

        it('clamps value to max', async () => {
            const html = ProgressBar({ value: 150, max: 100 });
            expect(html).toContain('width:100%');
        });
    });
});
