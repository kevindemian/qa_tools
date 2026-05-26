import type { FlatTest } from './result_parser';
import { rootLogger } from './logger';
import { getTheme } from './theme';

interface ReportOptions {
    title?: string;
    includeChart?: boolean;
    llmAnalysis?: string;
    llmConfidence?: 'high' | 'medium' | 'low';
    llmFallback?: boolean;
    generatedAt?: string;
    source?: string;
    ciUrl?: string;
    branch?: string;
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

function barLabel(barW: number, n: number, fill: string): string {
    if (barW < 20) return '';
    const textColor = fill === '#facc15' ? '#333' : '#fff';
    return `<text x="${barW / 2}" y="20" text-anchor="middle" fill="${textColor}" font-size="12" font-family="sans-serif">${n}</text>`;
}

function buildChartSvg(stats: ReportStats): string {
    const w = 300;
    const h = 30;
    const total = stats.total || 1;
    const pw = (stats.passed / total) * w;
    const fw = (stats.failed / total) * w;
    const sw = (stats.skipped / total) * w;
    const fillW = pw + fw + sw;
    const scale = fillW > 0 ? w / fillW : 1;
    return `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
  <rect x="0" y="0" width="${w}" height="${h}" rx="4" fill="#e5e7eb"/>
  <rect x="0" y="0" width="${pw * scale}" height="${h}" rx="4" fill="#22c55e"/>
  ${barLabel(pw * scale, stats.passed, '#22c55e')}
  <rect x="${pw * scale}" y="0" width="${fw * scale}" height="${h}" rx="4" fill="#ef4444"/>
  ${barLabel(fw * scale, stats.failed, '#ef4444')}
  <rect x="${(pw + fw) * scale}" y="0" width="${sw * scale}" height="${h}" rx="4" fill="#facc15"/>
  ${barLabel(sw * scale, stats.skipped, '#facc15')}
</svg>`;
}

function buildCss(): string {
    const t = getTheme();
    return (
        `
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background: #f9fafb; color: #111827; }
h1 { font-size: 1.5rem; margin-bottom: 0.5rem; }
.summary { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 20px; }
.card { background: #fff; border-radius: 8px; padding: 16px 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); min-width: 100px; }
.card .label { font-size: 0.75rem; text-transform: uppercase; color: #4b5563; }
.card .value { font-size: 1.5rem; font-weight: 700; }
.card .value.pass { color: ` +
        t.colors.success +
        `; }
.card .value.fail { color: ` +
        t.colors.error +
        `; }
.card .value.skip { color: ` +
        t.colors.warn +
        `; }
.chart-box { background: #fff; border-radius: 8px; padding: 16px 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); margin-bottom: 20px; }
.failed-summary { box-shadow: inset 4px 0 0 0 ` +
        t.colors.error +
        `; }
.legend { display: flex; gap: 16px; margin-top: 8px; font-size: 0.8rem; }
.legend span { display: flex; align-items: center; gap: 4px; }
.legend .dot { width: 10px; height: 10px; border-radius: 2px; display: inline-block; }
table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
th { background: #f3f4f6; text-align: left; padding: 10px 12px; font-size: 0.75rem; text-transform: uppercase; color: #4b5563; }
td { padding: 8px 12px; border-top: 1px solid #e5e7eb; font-size: 0.875rem; }
.control-bar { margin-bottom: 12px; }
.control-bar button { padding: 4px 12px; border: 1px solid #d1d5db; background: #fff; border-radius: 6px; cursor: pointer; font-size: 0.8rem; }
.control-bar button:hover { background: #f3f4f6; }
.status-badge { display: inline-block; padding: 2px 8px; border-radius: 9999px; font-size: 0.75rem; font-weight: 600; }
.status-passed { background: #dcfce7; color: #166534; }
.status-failed { background: #fecaca; color: #991b1b; }
.status-skipped { background: #fef9c3; color: #854d0e; }
tr:hover { background: #f9fafb; }
tr:nth-child(even) { background: #f8fafc; }
tr:nth-child(even):hover { background: #f1f5f9; }
.row-passed { display: table-row; }
.footer { margin-top: 16px; font-size: 0.75rem; color: #4b5563; text-align: center; }
@media (prefers-color-scheme: dark) {
  body { background: #0d1117; color: #c9d1d9; }
  .card { background: #161b22; box-shadow: 0 1px 3px rgba(0,0,0,0.4); }
  .chart-box { background: #161b22; box-shadow: 0 1px 3px rgba(0,0,0,0.4); }
  .card .label { color: #8b949e; }
  table { background: #161b22; box-shadow: 0 1px 3px rgba(0,0,0,0.4); }
  th { background: #1c2128; color: #8b949e; }
  td { border-top-color: #30363d; }
  .footer { color: #8b949e; }
  .control-bar button { background: #21262d; color: #c9d1d9; border-color: #30363d; }
  .control-bar button:hover { background: #30363d; }
  .status-passed { background: #052e16; color: #4ade80; }
  .status-failed { background: #450a0a; color: #f87171; }
  .status-skipped { background: #451a03; color: #fbbf24; }
  tr:hover { background: #1c2128; }
  tr:nth-child(even) { background: #1c2128; }
  tr:nth-child(even):hover { background: #21262d; }
}
</style></head><body>
`
    );
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

function buildFailedSummary(tests: FlatTest[], stats: ReportStats): string {
    if (stats.failed === 0) return '';
    const failed = tests.filter((t) => t.state === 'failed');
    let html = '<div class="chart-box failed-summary">';
    html +=
        '<div class="label" style="margin-bottom:8px;color:' +
        getTheme().colors.error +
        '"><b>❌ Failed Tests (' +
        stats.failed +
        ')</b></div>';
    for (const t of failed) {
        html +=
            '<p style="margin:4px 0">• ' +
            escapeHtml(t.title) +
            ' <span class="status-badge status-failed">failed</span> (' +
            (t.state === 'skipped' ? '—' : fmtDuration(t.duration)) +
            ')</p>';
    }
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

function buildErrorCell(t: FlatTest): string {
    if (t.state === 'failed' && t.error) {
        const truncated = t.error.length > 120 ? t.error.slice(0, 120) + '...' : t.error;
        return (
            '<span title="' +
            escapeHtml(t.error) +
            '" style="color:#991b1b;font-size:0.8rem">' +
            escapeHtml(truncated) +
            '</span>'
        );
    }
    return '';
}

function buildTestTable(tests: FlatTest[]): string {
    const hasPassed = tests.some((t) => t.state === 'passed');
    const hasError = tests.some((t) => t.state === 'failed' && t.error);
    let html = hasPassed
        ? '<div class="control-bar"><button onclick="togglePassed()">Toggle Passed</button></div>'
        : '';
    html +=
        '<table><thead><tr><th>#</th><th>Test</th><th>Status</th><th>Duration</th>' +
        (hasError ? '<th>Error</th>' : '') +
        '</tr></thead><tbody>';
    for (let i = 0; i < tests.length; i++) {
        const t = tests[i]!;
        const rowClass = t.state === 'passed' ? ' class="row-passed"' : '';
        html += '<tr' + rowClass + '>';
        html += '<td>' + (i + 1) + '</td>';
        html += '<td>' + escapeHtml(t.title) + '</td>';
        html += '<td><span class="status-badge status-' + t.state + '">' + t.state + '</span></td>';
        html += '<td>' + (t.state === 'skipped' ? '—' : fmtDuration(t.duration)) + '</td>';
        if (hasError) html += '<td>' + buildErrorCell(t) + '</td>';
        html += '</tr>';
    }
    html += '</tbody></table>';
    return html;
}

function buildToggleScript(): string {
    return `<script>
function togglePassed() {
    const rows = document.querySelectorAll('.row-passed');
    const btn = document.querySelector('.control-bar button');
    const hidden = rows.length > 0 && rows[0].style.display === 'none';
    rows.forEach(r => r.style.display = hidden ? '' : 'none');
    if (btn) btn.textContent = hidden ? 'Hide Passed' : 'Show Passed';
}
</script>`;
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
        html += buildFailedSummary(tests, stats);
        html += buildLlmSection(options || { title: '', includeChart: true });
        html += buildChartSection(stats, options?.includeChart !== false);
        html += buildTestTable(tests);
        html += buildToggleScript();
        const generatedAt = options?.generatedAt || new Date().toISOString();
        const source = options?.source || process.env.CI_JOB_NAME || process.env.GITHUB_WORKFLOW || '';
        const ciUrl = options?.ciUrl || process.env.CI_JOB_URL || process.env.GITHUB_SERVER_URL || '';
        const branch = options?.branch || process.env.CI_COMMIT_BRANCH || process.env.GITHUB_REF_NAME || '';

        let footer = '<div class="footer">Generated by QA Tools · ' + generatedAt.slice(0, 10);
        if (source) footer += ' · ' + escapeHtml(source);
        if (branch) {
            if (ciUrl)
                footer += ' · <a href="' + escapeHtml(ciUrl) + '" style="color:inherit">' + escapeHtml(branch) + '</a>';
            else footer += ' · ' + escapeHtml(branch);
        }
        footer += '</div>';

        html += footer;
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
