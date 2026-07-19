/**
 * Tests for chart primitives — BarChart, TrendChart, Sparkline, ProgressBar.
 *
 * @module primitives/chart.test
 */

import { BarChart, TrendChart, Sparkline, ProgressBar } from '../chart.js';

describe('Chart primitives', () => {
    describe('BarChart', () => {
        it('renders SVG with segments', () => {
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

        it('renders labels for wide segments', () => {
            const html = BarChart({
                segments: [{ value: 100, color: '#22c55e', label: 'all' }],
                width: 300,
                height: 30,
            });

            expect(html).toContain('all');
        });

        it('renders empty svg with no misleading bar when all segments are zero', () => {
            const html = BarChart({
                segments: [{ value: 0, color: '#22c55e' }],
            });

            expect(html).toContain('<svg');
            expect(html).not.toContain('<rect');
        });

        it('renders only finite segments and never produces NaN when a segment value is NaN', () => {
            const html = BarChart({
                segments: [
                    { value: 10, color: '#22c55e', label: 'pass' },
                    { value: NaN, color: '#ef4444', label: 'fail' },
                ],
            });

            expect(html).toContain('<svg');
            expect(html).toContain('<rect');
            expect(html).toContain('pass');
            expect(html).not.toContain('fail');
            expect(html).not.toContain('NaN');
        });

        it('renders empty svg when given no finite segments', () => {
            const html = BarChart({
                segments: [
                    { value: NaN, color: '#ef4444' },
                    { value: Infinity, color: '#f59e0b' },
                ],
            });

            expect(html).toContain('<svg');
            expect(html).not.toContain('NaN');
            expect(html).not.toContain('<rect');
        });
    });

    describe('TrendChart', () => {
        it('renders SVG for 2+ points', () => {
            const html = TrendChart({
                points: [{ passRate: 80 }, { passRate: 90 }, { passRate: 85 }],
            });

            expect(html).toContain('data-component="trend-chart"');
            expect(html).toContain('path');
        });

        it('returns empty for < 2 points', () => {
            const html = TrendChart({ points: [{ passRate: 80 }] });

            expect(html).toBe('');
        });

        it('renders ref line', () => {
            const html = TrendChart({
                points: [{ passRate: 80 }, { passRate: 90 }],
                refLine: 85,
                refLabel: '85%',
            });

            expect(html).toContain('85%');
        });
    });

    describe('Sparkline', () => {
        it('renders bar element', () => {
            const html = Sparkline({ value: 50 });

            expect(html).toContain('data-component="sparkline"');
            expect(html).toContain('role="img"');
            expect(html).toContain('width:100px');
            expect(html).toContain('height:8px');
        });

        it('uses high color for >= 50', () => {
            const html = Sparkline({ value: 75 });

            expect(html).toContain('#ef4444');
        });

        it('renders empty and never produces NaN when value is NaN', () => {
            const html = Sparkline({ value: NaN });

            expect(html).toContain('data-component="sparkline"');
            expect(html).not.toContain('NaN');
            expect(html).not.toContain('width:NaN');
        });

        it('renders empty when maxValue is zero', () => {
            const html = Sparkline({ value: 50, maxValue: 0 });

            expect(html).toContain('data-component="sparkline"');
            expect(html).not.toContain('NaN');
        });
    });

    describe('ProgressBar', () => {
        it('renders progress element', () => {
            const html = ProgressBar({ value: 75 });

            expect(html).toContain('data-component="progress-bar"');
            expect(html).toContain('role="progressbar"');
            expect(html).toContain('aria-valuenow="75"');
            expect(html).toContain('width:75%');
        });

        it('renders with showLabel', () => {
            const html = ProgressBar({ value: 50, showLabel: true });

            expect(html).toContain('50%');
        });

        it('clamps value to max', () => {
            const html = ProgressBar({ value: 150, max: 100 });

            expect(html).toContain('width:100%');
        });

        it('renders empty and never produces NaN when value is NaN', () => {
            const html = ProgressBar({ value: NaN });

            expect(html).toContain('data-component="progress-bar"');
            expect(html).not.toContain('NaN');
            expect(html).not.toContain('width:NaN');
        });

        it('renders empty when max is zero', () => {
            const html = ProgressBar({ value: 50, max: 0 });

            expect(html).toContain('data-component="progress-bar"');
            expect(html).not.toContain('NaN');
        });
    });
});
