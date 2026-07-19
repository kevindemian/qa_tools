/**
 * Chart primitives — BarChart, TrendChart, Sparkline, ProgressBar.
 *
 * SVG-based chart rendering with consistent colors from design tokens.
 *
 * @module primitives/chart
 */

import { tokens } from '../ui/theme-tokens.js';

export interface BarSegment {
    value: number;
    color: string;
    label?: string;
}

export interface BarChartProps {
    segments: BarSegment[];
    width?: number;
    height?: number;
    showLabels?: boolean;
    role?: string;
    ariaLabel?: string;
}

export function BarChart(props: BarChartProps): string {
    const w = props.width ?? 300;
    const h = props.height ?? 30;
    const finiteSegments = props.segments.filter((seg) => Number.isFinite(seg.value));
    if (finiteSegments.length === 0 || props.segments.length === 0) {
        return `<svg data-component="bar-chart" viewBox="0 0 ${w} ${h}" width="100%" style="max-width:${w}px;height:auto"
        role="${props.role || 'img'}" ${props.ariaLabel ? `aria-label="${props.ariaLabel}"` : ''}
        xmlns="http://www.w3.org/2000/svg"></svg>`;
    }
    const total = finiteSegments.reduce((s, seg) => s + seg.value, 0);
    const fillW = finiteSegments.reduce((s, seg) => s + (seg.value / total) * w, 0);
    const scale = fillW > 0 ? w / fillW : 1;

    let x = 0;
    let bars = '';
    for (const seg of finiteSegments) {
        const segW = (seg.value / total) * w * scale;
        if (!Number.isFinite(segW) || segW <= 0) continue;
        let label = '';
        if (props.showLabels !== false && segW >= 20) {
            const textColor = seg.color === '#facc15' ? '#333' : '#fff';
            label = `<text x="${x + segW / 2}" y="${h / 2 + 1}" text-anchor="middle" fill="${textColor}" font-size="12" font-family="${tokens.fontFamily}">${seg.label ?? seg.value}</text>`;
        }
        bars += `<rect x="${x}" y="0" width="${segW}" height="${h}" rx="4" fill="${seg.color}" role="img" aria-label="${seg.label ?? seg.value}"/>
${label}`;
        x += segW;
    }

    return `<svg data-component="bar-chart" viewBox="0 0 ${w} ${h}" width="100%" style="max-width:${w}px;height:auto"
        role="${props.role || 'img'}" ${props.ariaLabel ? `aria-label="${props.ariaLabel}"` : ''}
        xmlns="http://www.w3.org/2000/svg">
        ${bars}
    </svg>`;
}

export interface ChartPoint {
    passRate: number;
    label?: string;
}

export interface TrendChartProps {
    points: ChartPoint[];
    width?: number;
    height?: number;
    refLine?: number;
    refLabel?: string;
    role?: string;
    ariaLabel?: string;
}

export function TrendChart(props: TrendChartProps): string {
    if (props.points.length < 2) return '';
    const w = props.width ?? 300;
    const h = props.height ?? 100;
    const pad = { top: 15, right: 10, bottom: 20, left: 30 };
    const chartW = w - pad.left - pad.right;
    const chartH = h - pad.top - pad.bottom;

    const pts = props.points.map((p, i) => ({
        x: pad.left + (i / (props.points.length - 1)) * chartW,
        y: pad.top + chartH - (p.passRate / 100) * chartH,
    }));
    const pathD = pts.map((p, i) => (i === 0 ? 'M' : 'L') + p.x.toFixed(1) + ' ' + p.y.toFixed(1)).join(' ');
    const refY =
        props.refLine !== undefined ? pad.top + chartH - (props.refLine / 100) * chartH : pad.top + chartH - 90;

    const dataPoints = pts
        .map(
            (p) =>
                `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3" fill="${tokens.color.chart.line}" role="img" aria-label="data point"/>`,
        )
        .join('');

    return `<svg data-component="trend-chart" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg"
        role="${props.role || 'img'}" ${props.ariaLabel ? `aria-label="${props.ariaLabel}"` : ''}>
        <text x="${pad.left}" y="${pad.top - 4}" font-size="9" fill="var(--color-text-muted)">100%</text>
        <text x="${pad.left}" y="${h - 4}" font-size="9" fill="var(--color-text-muted)">0%</text>
        <line x1="${pad.left}" y1="${refY.toFixed(1)}" x2="${w - pad.right}" y2="${refY.toFixed(1)}"
            stroke="${tokens.color.chart.ref}" stroke-dasharray="4,4" stroke-width="1"/>
        <text x="${w - pad.right - 20}" y="${(refY - 4).toFixed(1)}" font-size="8" fill="${tokens.color.chart.ref}">${props.refLabel || '90%'}</text>
        <path d="${pathD}" fill="none" stroke="${tokens.color.chart.line}" stroke-width="2"
            stroke-linecap="round" stroke-linejoin="round"/>
        ${dataPoints}
    </svg>`;
}

export interface SparklineProps {
    value: number;
    maxValue?: number;
    width?: number;
    height?: number;
    colorLow?: string;
    colorMedium?: string;
    colorHigh?: string;
    role?: string;
    ariaLabel?: string;
}

export function Sparkline(props: SparklineProps): string {
    const w = props.width ?? 100;
    const h = props.height ?? 8;
    if (!Number.isFinite(props.value) || !Number.isFinite(props.maxValue ?? 100) || props.maxValue === 0) {
        return `<div data-component="sparkline" role="${props.role || 'img'}"
        ${props.ariaLabel ? `aria-label="${props.ariaLabel}"` : ''}
        style="display:inline-block;vertical-align:middle"></div>`;
    }
    const pct = Math.min((props.value / (props.maxValue || 100)) * 100, 100);
    let color: string;
    if (pct >= 50) {
        color = props.colorHigh ?? tokens.color.chart.fail;
    } else if (pct >= 20) {
        color = props.colorMedium ?? tokens.color.chart.skip;
    } else {
        color = props.colorLow ?? tokens.color.chart.pass;
    }

    const ariaAttr = props.ariaLabel ? `aria-label="${props.ariaLabel}"` : '';
    return `<div data-component="sparkline" role="${props.role || 'img'}" ${ariaAttr}
        style="display:inline-block;vertical-align:middle">
        <span style="display:inline-block;width:${w}px;height:${h}px;background:var(--color-border-subtle);border-radius:${tokens.borderRadius.pill}px;overflow:hidden">
            <span style="display:block;height:100%;width:${pct.toFixed(0)}px;background:${color};border-radius:${tokens.borderRadius.pill}px;transition:width 0.3s"></span>
        </span>
    </div>`;
}

export interface ProgressBarProps {
    value: number;
    max?: number;
    height?: number;
    color?: string;
    showLabel?: boolean;
    role?: string;
    ariaLabel?: string;
}

export function ProgressBar(props: ProgressBarProps): string {
    const max = props.max ?? 100;
    if (!Number.isFinite(props.value) || !Number.isFinite(max) || max <= 0) {
        return `<div data-component="progress-bar" role="${props.role || 'progressbar'}"
        aria-valuenow="0" aria-valuemin="0" aria-valuemax="0"
        ${props.ariaLabel ? `aria-label="${props.ariaLabel}"` : ''}
        style="height:${props.height ?? 8}px;background:var(--color-border-subtle);border-radius:${tokens.borderRadius.sm}px;overflow:hidden;margin:${tokens.spacing.xs}px 0"></div>`;
    }
    const pct = Math.min((props.value / max) * 100, 100);
    const color = props.color ?? tokens.color.semantic.info.light;
    const h = props.height ?? 8;
    return `<div data-component="progress-bar" role="${props.role || 'progressbar'}"
        aria-valuenow="${props.value}" aria-valuemin="0" aria-valuemax="${max}"
        ${props.ariaLabel ? `aria-label="${props.ariaLabel}"` : ''}
        style="height:${h}px;background:var(--color-border-subtle);border-radius:${tokens.borderRadius.sm}px;overflow:hidden;margin:${tokens.spacing.xs}px 0">
        <div style="height:100%;width:${pct.toFixed(0)}%;background:${color};border-radius:${tokens.borderRadius.sm}px;transition:width 0.3s"></div>
        ${props.showLabel ? `<span style="font-size:${tokens.fontSize.xs};color:var(--color-text-muted);margin-top:2px;display:block;text-align:right">${pct.toFixed(0)}%</span>` : ''}
    </div>`;
}
