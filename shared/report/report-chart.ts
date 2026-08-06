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
import { BarChart, TrendChart, Card, EmptyState } from '../primitives/index.js';
import { icon } from '../icons.js';
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
    // legitimate: nested SVG chart body (not a section) — <2 points cannot draw a trend line; caller buildTrendSection guards first; EmptyState (section block) invalid as chart body (Rule 25.3 intent).
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
    // Rule 25: explicit no-data (insufficient trend points) instead of silent omission.
    if (trends.length < 2) {
        return EmptyState({
            title: 'Insufficient trend data',
            description:
                'The pass rate trend requires at least two dated data points to draw a trend line. No usable trend was found.',
            action: 'Run the report pipeline on two or more dates so a pass-rate trend can be plotted.',
            icon: icon('trending-up', 16),
        });
    }
    return Card({
        title: 'Pass Rate Trend',
        children: buildMiniTrendChart(trends),
    });
}

export function buildChartSection(stats: ReportStats, wantChart: boolean): string {
    // legitimate: feature toggle — charts disabled by config (wantChart=false); EmptyState would falsely claim "no data" (Rule 25.3).
    if (!wantChart) return '';
    // Rule 25: explicit no-data (zero tests) instead of silent omission.
    if (stats.total === 0) {
        return EmptyState({
            title: 'No test distribution data available',
            description: 'The distribution chart requires test execution results. No tests were found to chart.',
            action: 'Run a test suite so the pass/fail/skip distribution can be rendered.',
            icon: icon('bar-chart', 16),
        });
    }
    const legend =
        '<div class="legend">' +
        `<span><span class="dot dot-pass"></span> Passed (${stats.passed})</span>` +
        `<span><span class="dot dot-fail"></span> Failed (${stats.failed})</span>` +
        `<span><span class="dot dot-skip"></span> Skipped (${stats.skipped})</span>` +
        '</div>';
    return Card({
        title: 'Distribution',
        children: buildChartSvg(stats) + legend,
    });
}
