import type { FlatTest } from './result_parser';
import { rootLogger } from './logger';
import { getTheme } from './theme';
import { sanitizeUrl } from './cli_base';

/** A single historical test run entry. */
export interface TestHistoryRun {
    status: string;
    testExecKey: string;
    startedOn?: string;
    finishedOn?: string;
}

/**
 * HTML test report generation.
 *
 * Converts FlatTest results into a self-contained HTML page with summary
 * cards, optional SVG distribution chart, AI analysis section, and a
 * toggleable test table.  The pipeline always produces valid output,
 * falling back to a minimal error page when the render fails.
 */

/** Controls the content and metadata embedded in the generated HTML report. */
interface ReportOptions {
    /** Custom title for the report page. */
    title?: string;
    /** Whether to render the passed/failed/skipped bar chart (default true). */
    includeChart?: boolean;
    /** AI-generated textual analysis to embed below the summary cards. */
    llmAnalysis?: string;
    /** Stated confidence of the AI analysis — drives badge colour. */
    llmConfidence?: 'high' | 'medium' | 'low';
    /** When true, displays a warning that the analysis is a template fallback. */
    llmFallback?: boolean;
    /** ISO-8601 timestamp shown in the report footer. */
    generatedAt?: string;
    /** Name of the CI job or workflow that triggered this report. */
    source?: string;
    /** URL linking to the CI pipeline run, rendered in the footer. */
    ciUrl?: string;
    /** Branch name displayed in the footer (linked if ciUrl is also set). */
    branch?: string;
    /** Minimum pass rate (0-100) — report will render a quality gate warning below this threshold. */
    qualityGate?: number;
    /** Pre-computed failure category for each test by title. */
    testCategories?: Record<string, string>;
    /** Per-test Xray execution history keyed by test title. */
    testHistory?: Record<string, TestHistoryRun[]>;
}

/** Aggregated counts derived from a FlatTest array for rendering summary cards. */
interface ReportStats {
    /** Number of tests that passed. */
    passed: number;
    /** Number of tests that failed. */
    failed: number;
    /** Number of tests that were skipped. */
    skipped: number;
    /** Total number of tests (passed + failed + skipped). */
    total: number;
    /** Cumulative duration of all tests in milliseconds. */
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

function pctSub(value: number, total: number): string {
    if (total === 0) return '';
    return ' <span style="font-size:0.75rem;color:#6b7280;font-weight:400">(' + pct(value, total) + '%)</span>';
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

function buildCss(): string {
    const t = getTheme();
    return (
        `
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background: #f9fafb; color: #111827; }
.wrapper { max-width: 100%; overflow-x: auto; }
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
  input { padding: 4px 8px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 0.8rem; }
.status-badge { display: inline-block; padding: 2px 8px; border-radius: 9999px; font-size: 0.75rem; font-weight: 600; }
.status-passed { background: #dcfce7; color: #166534; }
.status-failed { background: #fecaca; color: #991b1b; }
.status-skipped { background: #fef9c3; color: #854d0e; }
tr:hover { background: #f9fafb; }
tr:nth-child(even) { background: #f8fafc; }
tr:nth-child(even):hover { background: #f1f5f9; }
.row-passed { display: table-row; }
.footer { margin-top: 16px; font-size: 0.75rem; color: #4b5563; text-align: center; }
.error-cell { color: #991b1b; font-size: 0.8rem; cursor: pointer; }
.error-truncated::after { content: ' \\25BC'; font-size: 0.7rem; }
.error-truncated.expanded::after { content: ' \\25B2'; }
.hist-dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin: 0 1px; }
.hist-pass { background: #22c55e; }
.hist-fail { background: #ef4444; }
.hist-skip { background: #facc15; }
.hist-other { background: #d1d5db; }
.hist-tooltip { display: none; position: absolute; background: #1f2937; color: #f9fafb; padding: 8px 12px; border-radius: 6px; font-size: 0.75rem; white-space: nowrap; z-index: 100; pointer-events: none; }
.hist-cell { position: relative; cursor: default; white-space: nowrap; }
.hist-cell:hover .hist-tooltip { display: block; }
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
  .error-cell { color: #f87171; }
}
</style></head><body>
`
    );
}

/**
 * Generate a complete HTML report from flat test results.
 *
 * @param tests  - Flat test result objects to render in the report.
 * @param options - Optional overrides for title, chart, AI analysis, etc.
 * @returns A self-contained HTML string suitable for saving to disk.
 */
export function generateHtmlReport(tests: FlatTest[], options?: ReportOptions): string {
    return generateReportWithFallback(tests, options);
}

function buildSummaryCards(stats: ReportStats, passRate: number): string {
    let html = '<div class="summary">';
    html +=
        '<div class="card"><div class="label">Passed</div><div class="value pass">' +
        stats.passed +
        pctSub(stats.passed, stats.total) +
        '</div></div>';
    html +=
        '<div class="card"><div class="label">Failed</div><div class="value fail">' +
        stats.failed +
        pctSub(stats.failed, stats.total) +
        '</div></div>';
    html +=
        '<div class="card"><div class="label">Skipped</div><div class="value skip">' +
        stats.skipped +
        pctSub(stats.skipped, stats.total) +
        '</div></div>';
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
        const CONFIDENCE_BADGES: Record<string, string> = { high: '🟢', medium: '🟡', low: '🔴' };
        const badge = CONFIDENCE_BADGES[options.llmConfidence] || '🔴';
        html +=
            '<p style="font-size:0.8rem;margin-bottom:8px">Confiança: ' + badge + ' ' + options.llmConfidence + '</p>';
    }
    html +=
        '<pre style="white-space:pre-wrap;font-family:inherit;margin:0">' + escapeHtml(options.llmAnalysis) + '</pre>';
    html += '</div>';
    return html;
}

function buildQualityGate(passRate: number, threshold: number): string {
    if (passRate >= threshold) return '';
    return `<div class="chart-box" style="border-left:4px solid #ef4444;background:#fef2f2">
<div class="label" style="color:#991b1b;margin-bottom:4px">❌ Quality Gate Failed</div>
<p style="margin:0;font-size:0.85rem">Pass rate ${passRate.toFixed(1)}% is below the configured threshold of ${threshold}%.</p>
</div>`;
}

function buildFilterBar(): string {
    return (
        '<div class="control-bar" style="display:flex;gap:8px;align-items:center">' +
        '<input id="searchInput" type="text" placeholder="Filter tests..." oninput="filterTable()" style="padding:4px 8px;border:1px solid #d1d5db;border-radius:6px;font-size:0.8rem;flex:1">' +
        '<button onclick="exportCsv()" style="padding:4px 12px;border:1px solid #d1d5db;background:#fff;border-radius:6px;cursor:pointer;font-size:0.8rem">Export CSV</button>' +
        '</div>'
    );
}

function precomputeCategories(tests: FlatTest[]): Record<string, string> {
    const cats: Record<string, string> = {};
    for (const t of tests) {
        if (t.state === 'failed' && t.error) {
            cats[t.title] = categorizeFailure(t.error);
        }
    }
    return cats;
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
        const isTruncated = t.error.length > 120;
        const cls = isTruncated ? 'error-cell error-truncated' : 'error-cell';
        const attrs = isTruncated ? ' data-full="' + escapeHtml(t.error) + '"' : ' title="' + escapeHtml(t.error) + '"';
        return '<span class="' + cls + '"' + attrs + '>' + escapeHtml(truncated) + '</span>';
    }
    return '';
}

function buildHistoryCell(history: TestHistoryRun[]): string {
    if (!history || history.length === 0) return '<td>—</td>';
    const dots = history
        .map((r) => {
            const cls =
                r.status.toUpperCase() === 'PASSED' || r.status === 'PASS'
                    ? 'hist-pass'
                    : r.status.toUpperCase() === 'FAILED' || r.status === 'FAIL'
                      ? 'hist-fail'
                      : r.status.toUpperCase() === 'SKIPPED' || r.status === 'ABORTED'
                        ? 'hist-skip'
                        : 'hist-other';
            return '<span class="hist-dot ' + cls + '" title="' + escapeHtml(r.status) + '"></span>';
        })
        .join('');
    const lines = history
        .map(
            (r) =>
                '<span style="display:flex;gap:6px;align-items:center">' +
                '<span class="hist-dot ' +
                (r.status.toUpperCase() === 'PASSED' || r.status === 'PASS'
                    ? 'hist-pass'
                    : r.status.toUpperCase() === 'FAILED' || r.status === 'FAIL'
                      ? 'hist-fail'
                      : r.status.toUpperCase() === 'SKIPPED' || r.status === 'ABORTED'
                        ? 'hist-skip'
                        : 'hist-other') +
                '" style="flex-shrink:0"></span>' +
                escapeHtml(r.status) +
                ' &mdash; ' +
                escapeHtml(r.testExecKey) +
                '</span>',
        )
        .join('');
    return '<td class="hist-cell">' + dots + '<div class="hist-tooltip">' + lines + '</div></td>';
}

function buildTestTable(
    tests: FlatTest[],
    categories?: Record<string, string>,
    history?: Record<string, TestHistoryRun[]>,
): string {
    const hasPassed = tests.some((t) => t.state === 'passed');
    const hasError = tests.some((t) => t.state === 'failed' && t.error);
    const hasSuite = tests.some((t) => extractSuite(t));
    const hasHistory = history !== undefined && Object.keys(history).length > 0;
    let html = hasPassed
        ? '<div class="control-bar"><button onclick="togglePassed()">Toggle Passed</button></div>'
        : '';
    html +=
        '<div class="wrapper"><table><thead><tr><th>#</th><th>Test</th>' +
        (hasSuite ? '<th>Suite</th>' : '') +
        '<th>Status</th><th>Duration</th>' +
        (hasError ? '<th>Error</th>' : '') +
        (hasHistory ? '<th>History</th>' : '') +
        '</tr></thead><tbody>';
    for (const [i, t] of tests.entries()) {
        const rowClass = t.state === 'passed' ? ' class="row-passed"' : '';
        html += '<tr' + rowClass + '>';
        html += '<td>' + (i + 1) + '</td>';
        const cat = t.state === 'failed' && categories ? categories[t.title] : undefined;
        html +=
            '<td' +
            (t.fullTitle ? ' title="' + escapeHtml(t.fullTitle) + '"' : '') +
            '>' +
            escapeHtml(t.title) +
            (cat ? buildCategoryBadge(cat) : '') +
            '</td>';
        if (hasSuite) html += '<td>' + escapeHtml(extractSuite(t)) + '</td>';
        html += '<td><span class="status-badge status-' + t.state + '">' + t.state + '</span></td>';
        html += '<td>' + (t.state === 'skipped' ? '—' : fmtDuration(t.duration)) + '</td>';
        if (hasError) html += '<td>' + buildErrorCell(t) + '</td>';
        if (hasHistory) {
            const testHistory = history[t.title] ?? history[t.fullTitle ?? ''] ?? [];
            html += buildHistoryCell(testHistory);
        }
        html += '</tr>';
    }
    html += '</tbody></table></div>';
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
function filterTable() {
    const q = document.getElementById('searchInput').value.toLowerCase();
    const rows = document.querySelectorAll('tbody tr');
    rows.forEach(r => {
        r.style.display = r.textContent.toLowerCase().includes(q) ? '' : 'none';
    });
}
function exportCsv() {
    const rows = document.querySelectorAll('tbody tr');
    let csv = '#,Test,Status,Duration,Error\\n';
    rows.forEach(r => {
        const cells = r.querySelectorAll('td');
        if (cells.length < 4) return;
        const vals = Array.from(cells).slice(0, 4).map(c => '"' + c.textContent.trim().replace(/"/g, '""') + '"');
        const err = cells.length > 4 ? '"' + cells[4].textContent.trim().replace(/"/g, '""') + '"' : '""';
        csv += vals.join(',') + ',' + err + '\\n';
    });
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'test-report.csv';
    a.click();
    URL.revokeObjectURL(a.href);
}
document.querySelectorAll('.error-truncated').forEach(function(el) {
    el.addEventListener('click', function() {
        if (this.classList.contains('expanded')) {
            this.textContent = this.getAttribute('data-full').slice(0, 120) + '...';
            this.classList.remove('expanded');
        } else {
            this.textContent = this.getAttribute('data-full');
            this.classList.add('expanded');
        }
    });
});
</script>`;
}

/**
 * Internal report builder that wraps every failure in a safe error page.
 *
 * Assembles the full HTML: CSS, summary cards, chart, AI section,
 * test table, and toggle script.  If any part of the render throws,
 * the error is logged and a minimal error page is returned instead.
 *
 * @internal
 * @param tests  - Flat test result objects to render.
 * @param options - Optional overrides for report content.
 * @returns A self-contained HTML string (or a minimal error page on failure).
 */
export function generateReportWithFallback(tests: FlatTest[], options?: ReportOptions): string {
    try {
        const stats = statsFromTests(tests);
        const title = options?.title || DEFAULT_TITLE;
        const passRate = stats.total > 0 ? (stats.passed / stats.total) * 100 : 0;
        const categories = options?.testCategories || precomputeCategories(tests);

        let html =
            '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">';
        html += '<title>' + title + '</title><style>' + buildCss();
        html += '<h1>' + title + '</h1>';
        html += buildSummaryCards(stats, passRate);
        html += buildFailedSummary(tests, stats);
        html += buildLlmSection(options || { title: '', includeChart: true });
        html += buildChartSection(stats, options?.includeChart !== false);
        if (options?.qualityGate !== undefined) {
            html += buildQualityGate(passRate, options.qualityGate);
        }
        html += buildFilterBar();
        html += buildTestTable(tests, categories, options?.testHistory);
        html += buildToggleScript();
        const generatedAt = options?.generatedAt || new Date().toISOString();
        const source = options?.source || process.env.CI_JOB_NAME || process.env.GITHUB_WORKFLOW || '';
        const ciUrl = options?.ciUrl || process.env.CI_JOB_URL || process.env.GITHUB_SERVER_URL || '';
        const branch = options?.branch || process.env.CI_COMMIT_BRANCH || process.env.GITHUB_REF_NAME || '';

        let footer = '<div class="footer">Generated by QA Tools · ' + generatedAt.slice(0, 10);
        if (source) footer += ' · ' + escapeHtml(source);
        if (branch) {
            if (ciUrl)
                footer +=
                    ' · <a href="' +
                    escapeHtml(sanitizeUrl(ciUrl)) +
                    '" style="color:inherit">' +
                    escapeHtml(branch) +
                    '</a>';
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

/** Categorise an error string into a CSS-class label (assertion, timeout, environment, etc.). */
export function categorizeFailure(error: string): string {
    const upper = error.toUpperCase();
    if (/TIMEOUT|TIMED OUT|30S|60S/.test(upper)) return 'TIMEOUT';
    if (/ASSERT|EXPECTED|GOT |ACTUAL|TO BE /.test(upper)) return 'ASSERTION';
    if (/CONNECT|DATABASE|NETWORK|REFUSED|ECONNREFUSED/.test(upper)) return 'ENVIRONMENT';
    if (/NULL|UNDEFINED|CANNOT READ|TYPEERROR|REFERENCEERROR/.test(upper)) return 'APPLICATION';
    if (/FLAKY|INTERMITTENT|RETRY/.test(upper)) return 'FLAKY';
    return 'UNKNOWN';
}

const CATEGORY_COLORS: Record<string, string> = {
    ASSERTION: '#6366f1',
    TIMEOUT: '#f59e0b',
    ENVIRONMENT: '#10b981',
    APPLICATION: '#ef4444',
    FLAKY: '#8b5cf6',
    UNKNOWN: '#6b7280',
};

function buildCategoryBadge(cat: string): string {
    const color = CATEGORY_COLORS[cat] || '#6b7280';
    return `<span style="display:inline-block;padding:1px 6px;border-radius:4px;background:${color}20;color:${color};font-size:0.7rem;font-weight:600;margin-left:4px">${cat}</span>`;
}

/** Extract the suite/folder name from a test title (text before the first `>` or `/`). */
export function extractSuite(t: FlatTest): string {
    if (t.fullTitle) {
        const parts = t.fullTitle.split(' > ');
        return parts.length > 1 ? parts.slice(0, -1).join(' > ') : '';
    }
    return '';
}
