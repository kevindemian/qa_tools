/**
 * Chart rendering utilities for HTML reports — bar charts, mini trend charts,
 * and distribution visualisations embedded in SVG.
 *
 * Uses BarChart and TrendChart primitives with design token colors.
 *
 * @module report-chart
 */

import type { TrendPoint } from '../types/data-hub.js';
import type { ReportStats } from './report-types.js';
import { BarChart, TrendChart, Card } from '../primitives/index.js';
import { tokens } from '../ui/theme-tokens.js';

export function buildChartSvg(stats: ReportStats): string {
    return BarChart({
        segments: [
            { value: stats.passed, color: tokens.color.chart.pass, label: String(stats.passed) },
            { value: stats.failed, color: tokens.color.chart.fail, label: String(stats.failed) },
            { value: stats.skipped, color: tokens.color.chart.skip, label: String(stats.skipped) },
        ],
        width: 300,
        height: 30,
        role: 'img',
        ariaLabel: `Test distribution: ${stats.passed} passed, ${stats.failed} failed, ${stats.skipped} skipped`,
    });
}

export function buildMiniTrendChart(trends: TrendPoint[]): string {
    if (trends.length < 2) return '';
    return TrendChart({
        points: trends,
        width: 300,
        height: 100,
        refLine: 90,
        refLabel: '90%',
        role: 'img',
        ariaLabel: 'Pass rate trend chart',
    });
}

export function buildTrendSection(trends: TrendPoint[]): string {
    if (trends.length < 2) return '';
    return Card({
        title: 'Pass Rate Trend',
        children: buildMiniTrendChart(trends),
    });
}

export function buildChartSection(stats: ReportStats, wantChart: boolean): string {
    if (!wantChart || stats.total === 0) return '';
    const legend =
        '<div class="legend">' +
        `<span><span class="dot" style="background:${tokens.color.chart.pass}"></span> Passed (${stats.passed})</span>` +
        `<span><span class="dot" style="background:${tokens.color.chart.fail}"></span> Failed (${stats.failed})</span>` +
        `<span><span class="dot" style="background:${tokens.color.chart.skip}"></span> Skipped (${stats.skipped})</span>` +
        '</div>';
    return Card({
        title: 'Distribution',
        children: buildChartSvg(stats) + legend,
    });
}
