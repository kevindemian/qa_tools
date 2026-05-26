import type { FlatTest } from './result_parser';
import { rootLogger } from './logger';

interface ReportOptions {
    title?: string;
    includeChart?: boolean;
    llmAnalysis?: string;
    llmConfidence?: 'high' | 'medium' | 'low';
    llmFallback?: boolean;
}

interface ReportStats {
    passed: number;
    failed: number;
    skipped: number;
    total: number;
    duration: number;
}

const DEFAULT_TITLE = 'QA Tools — Test Report';
const PASS_RATE_GOOD_THRESHOLD = 90;
const PASS_RATE_WARN_THRESHOLD = 70;

function statsFromTests(tests: FlatTest[]): ReportStats {
    const passed = tests.filter((t) => t.state === 'passed').length;
    const failed = tests.filter((t) => t.state === 'failed').length;
    const skipped = tests.filter((t) => t.state === 'skipped').length;
    const duration = tests.reduce((sum, t) => sum + t.duration, 0);
    return { passed, failed, skipped, total: tests.length, duration };
}

function fmtDuration(ms: number): string {
    const sec = Math.floor(ms / 1000);
    const min = Math.floor(sec / 60);
    return min > 0 ? `${min}m ${sec % 60}s` : `${sec}s`;
}

function pctClass(rate: number): string {
    if (rate >= PASS_RATE_GOOD_THRESHOLD) return 'rate-good';
    if (rate >= PASS_RATE_WARN_THRESHOLD) return 'rate-warn';
    return 'rate-bad';
}

function pct(value: number, total: number): string {
    if (total === 0) return '0.0';
    return ((value / total) * 100).toFixed(1);
}

function buildChartSvg(stats: ReportStats): string {
    const w = 300;
    const h = 30;
    const total = stats.total || 1;
    const pw = (stats.passed / total) * w;
    const fw = (stats.failed / total) * w;
    const sw = (stats.skipped / total) * w;
    // Ensure total fills the bar
    const fillW = pw + fw + sw;
    const scale = fillW > 0 ? w / fillW : 1;
    return `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
  <rect x="0" y="0" width="${w}" height="${h}" rx="4" fill="#e5e7eb"/>
  <rect x="0" y="0" width="${pw * scale}" height="${h}" rx="4" fill="#22c55e"/>
  <rect x="${pw * scale}" y="0" width="${fw * scale}" height="${h}" rx="4" fill="#ef4444"/>
  <rect x="${(pw + fw) * scale}" y="0" width="${sw * scale}" height="${h}" rx="4" fill="#facc15"/>
</svg>`;
}

function buildCss(): string {
    return `
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background: #f9fafb; color: #111827; }
h1 { font-size: 1.5rem; margin-bottom: 0.5rem; }
.summary { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 20px; }
.card { background: #fff; border-radius: 8px; padding: 16px 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); min-width: 100px; }
.card .label { font-size: 0.75rem; text-transform: uppercase; color: #6b7280; }
.card .value { font-size: 1.5rem; font-weight: 700; }
.card .value.pass { color: #16a34a; }
.card .value.fail { color: #dc2626; }
.card .value.skip { color: #ca8a04; }
.chart-box { background: #fff; border-radius: 8px; padding: 16px 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); margin-bottom: 20px; }
.legend { display: flex; gap: 16px; margin-top: 8px; font-size: 0.8rem; }
.legend span { display: flex; align-items: center; gap: 4px; }
.legend .dot { width: 10px; height: 10px; border-radius: 2px; display: inline-block; }
table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
th { background: #f3f4f6; text-align: left; padding: 10px 12px; font-size: 0.75rem; text-transform: uppercase; color: #6b7280; }
td { padding: 8px 12px; border-top: 1px solid #e5e7eb; font-size: 0.875rem; }
.status-badge { display: inline-block; padding: 2px 8px; border-radius: 9999px; font-size: 0.75rem; font-weight: 600; }
.status-passed { background: #dcfce7; color: #166534; }
.status-failed { background: #fecaca; color: #991b1b; }
.status-skipped { background: #fef9c3; color: #854d0e; }
tr:hover { background: #f9fafb; }
.footer { margin-top: 16px; font-size: 0.75rem; color: #9ca3af; text-align: center; }
</style></head><body>
`;
}

export function generateHtmlReport(tests: FlatTest[], options?: ReportOptions): string {
    return generateReportWithFallback(tests, options);
}

function buildSummaryCards(stats: ReportStats, passRate: number): string {
    let html = '<div class="summary">';
    html += '<div class="card"><div class="label">Passed</div><div class="value pass">' + stats.passed + '</div></div>';
    html += '<div class="card"><div class="label">Failed</div><div class="value fail">' + stats.failed + '</div></div>';
    html +=
        '<div class="card"><div class="label">Skipped</div><div class="value skip">' + stats.skipped + '</div></div>';
    html += '<div class="card"><div class="label">Total</div><div class="value">' + stats.total + '</div></div>';
    html +=
        '<div class="card"><div class="label">Duration</div><div class="value" style="font-size:1rem">' +
        fmtDuration(stats.duration) +
        '</div></div>';
    html +=
        '<div class="card"><div class="label">Pass Rate</div><div class="value ' +
        pctClass(passRate) +
        '">' +
        pct(stats.passed, stats.total) +
        '%</div></div>';
    html += '</div>';
    return html;
}

function buildLlmSection(options: ReportOptions): string {
    if (!options.llmAnalysis) return '';
    let html = '<div class="chart-box">';
    html += '<div class="label" style="margin-bottom:8px">AI Analysis</div>';
    if (options.llmFallback) {
        html += '<p style="color:#ca8a04;font-size:0.8rem">⚠ AI Analysis unavailable — displaying template report.</p>';
    } else if (options.llmConfidence) {
        const badge = options.llmConfidence === 'high' ? '🟢' : options.llmConfidence === 'medium' ? '🟡' : '🔴';
        html +=
            '<p style="font-size:0.8rem;margin-bottom:8px">Confiança: ' + badge + ' ' + options.llmConfidence + '</p>';
    }
    html +=
        '<pre style="white-space:pre-wrap;font-family:inherit;margin:0">' + escapeHtml(options.llmAnalysis) + '</pre>';
    html += '</div>';
    return html;
}

function buildChartSection(stats: ReportStats, wantChart: boolean): string {
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

function buildTestTable(tests: FlatTest[]): string {
    let html = '<table><thead><tr><th>#</th><th>Test</th><th>Status</th><th>Duration</th></tr></thead><tbody>';
    for (let i = 0; i < tests.length; i++) {
        const t = tests[i]!;
        html += '<tr>';
        html += '<td>' + (i + 1) + '</td>';
        html += '<td>' + escapeHtml(t.title) + '</td>';
        html += '<td><span class="status-badge status-' + t.state + '">' + t.state + '</span></td>';
        html += '<td>' + fmtDuration(t.duration) + '</td>';
        html += '</tr>';
    }
    html += '</tbody></table>';
    return html;
}

export function generateReportWithFallback(tests: FlatTest[], options?: ReportOptions): string {
    try {
        const stats = statsFromTests(tests);
        const title = options?.title || DEFAULT_TITLE;
        const passRate = stats.total > 0 ? (stats.passed / stats.total) * 100 : 0;

        let html =
            '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">';
        html += '<title>' + title + '</title><style>' + buildCss();
        html += '<h1>' + title + '</h1>';
        html += buildSummaryCards(stats, passRate);
        html += buildLlmSection(options || { title: '', includeChart: true });
        html += buildChartSection(stats, options?.includeChart !== false);
        html += buildTestTable(tests);
        html += '<div class="footer">Generated by QA Tools</div>';
        html += '</body></html>';

        return html;
    } catch (err) {
        rootLogger.error('Failed to generate HTML report: ' + (err as Error).message);
        return '<!DOCTYPE html><html><body><h1>Error generating report</h1></body></html>';
    }
}

function escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
