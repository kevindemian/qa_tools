/** Chart rendering utilities for HTML reports — bar charts, mini trend charts,
 * and distribution visualisations embedded in SVG.
 * @module report-chart */
import type { TrendPoint } from './metrics';
import type { ReportStats } from './report-types';

export function barLabel(barW: number, n: number, fill: string): string {
    if (barW < 20) return '';
    const textColor = fill === '#facc15' ? '#333' : '#fff';
    return `<text x="${barW / 2}" y="20" text-anchor="middle" fill="${textColor}" font-size="12" font-family="sans-serif">${n}</text>`;
}

export function buildChartSvg(stats: ReportStats): string {
    const w = 300;
    const h = 30;
    const total = stats.total || 1;
    const pw = (stats.passed / total) * w;
    const fw = (stats.failed / total) * w;
    const sw = (stats.skipped / total) * w;
    const fillW = pw + fw + sw;
    const scale = fillW > 0 ? w / fillW : 1;
    return `<svg viewBox="0 0 ${w} ${h}" width="100%" style="max-width:${w}px;height:auto" xmlns="http://www.w3.org/2000/svg">
  <rect x="0" y="0" width="${w}" height="${h}" rx="4" fill="#e5e7eb"/>
  <rect x="0" y="0" width="${pw * scale}" height="${h}" rx="4" fill="#22c55e"/>
  ${barLabel(pw * scale, stats.passed, '#22c55e')}
  <rect x="${pw * scale}" y="0" width="${fw * scale}" height="${h}" rx="4" fill="#ef4444"/>
  ${barLabel(fw * scale, stats.failed, '#ef4444')}
  <rect x="${(pw + fw) * scale}" y="0" width="${sw * scale}" height="${h}" rx="4" fill="#facc15"/>
  ${barLabel(sw * scale, stats.skipped, '#facc15')}
</svg>`;
}

export function buildMiniTrendChart(trends: TrendPoint[]): string {
    if (trends.length < 2) return '';
    const w = 300;
    const h = 100;
    const pad = { top: 15, right: 10, bottom: 20, left: 30 };
    const chartW = w - pad.left - pad.right;
    const chartH = h - pad.top - pad.bottom;
    const pts = trends.map((t, i) => ({
        x: pad.left + (i / (trends.length - 1)) * chartW,
        y: pad.top + chartH - (t.passRate / 100) * chartH,
    }));
    const pathD = pts.map((p, i) => (i === 0 ? 'M' : 'L') + p.x.toFixed(1) + ' ' + p.y.toFixed(1)).join(' ');
    const refY = pad.top + chartH - (90 / 100) * chartH;
    return (
        '<div class="mini-trend"><svg viewBox="0 0 ' +
        w +
        ' ' +
        h +
        '" xmlns="http://www.w3.org/2000/svg">' +
        '<text x="' +
        pad.left +
        '" y="' +
        (pad.top - 4) +
        '" font-size="9" fill="#6b7280">100%</text>' +
        '<text x="' +
        pad.left +
        '" y="' +
        (h - 4) +
        '" font-size="9" fill="#6b7280">0%</text>' +
        '<line x1="' +
        pad.left +
        '" y1="' +
        refY.toFixed(1) +
        '" x2="' +
        (w - pad.right) +
        '" y2="' +
        refY.toFixed(1) +
        '" stroke="#ef4444" stroke-dasharray="4,4" stroke-width="1"/>' +
        '<text x="' +
        (w - pad.right - 20) +
        '" y="' +
        (refY - 4).toFixed(1) +
        '" font-size="8" fill="#ef4444">90%</text>' +
        '<path d="' +
        pathD +
        '" fill="none" stroke="#6366f1" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
        pts
            .map(function (p) {
                return '<circle cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="3" fill="#6366f1"/>';
            })
            .join('') +
        '</svg></div>'
    );
}

export function buildTrendSection(trends: TrendPoint[]): string {
    if (trends.length < 2) return '';
    let html = '<div class="chart-box">';
    html += '<div class="label" style="margin-bottom:8px">Pass Rate Trend</div>';
    html += buildMiniTrendChart(trends);
    html += '</div>';
    return html;
}

export function buildChartSection(stats: ReportStats, wantChart: boolean): string {
    if (!wantChart || stats.total === 0) return '';
    let html = '<div class="chart-box"><div class="label" style="margin-bottom:4px">Distribution</div>';
    html += buildChartSvg(stats);
    html += '<div class="legend">';
    html += '<span><span class="dot" style="background:#22c55e"></span> Passed (' + stats.passed + ')</span>';
    html += '<span><span class="dot" style="background:#ef4444"></span> Failed (' + stats.failed + ')</span>';
    html += '<span><span class="dot" style="background:#facc15"></span> Skipped (' + stats.skipped + ')</span>';
    html += '</div></div>';
    return html;
}
