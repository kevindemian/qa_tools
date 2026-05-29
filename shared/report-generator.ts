import * as fs from 'fs';
import type { FlatTest } from './result_parser';
import { rootLogger } from './logger';
import { getTheme } from './theme';
import { sanitizeUrl } from './cli_base';
import type { TrendPoint } from './metrics';

/** A single historical test run entry. */
export interface TestHistoryRun {
    status: string;
    testExecKey: string;
    startedOn?: string;
    finishedOn?: string;
}

/** A known issue pattern matched against test titles. */
export interface KnownIssue {
    pattern: string;
    reason: string;
    ticket?: string;
}

/** A named set of test results for multi-environment tabs. */
export interface TestRunTab {
    name: string;
    tests: FlatTest[];
}

/** Epic-and-issues data for coverage HTML reports. */
export interface CoverageEpic {
    key: string;
    summary: string;
    issues: {
        key: string;
        summary: string;
        status: string;
        type: string;
    }[];
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
    /** Trend data for pass rate over time chart. */
    trends?: TrendPoint[];
    /** Theme override: 'dark', 'light', or undefined for system. */
    theme?: 'dark' | 'light';
    /** Known issue patterns to annotate in the report. */
    knownIssues?: KnownIssue[];
    /** Multi-environment test run tabs. */
    runs?: TestRunTab[];
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
.ki-badge { display: inline-block; padding: 1px 6px; border-radius: 4px; background: #fef3c7; color: #92400e; font-size: 0.7rem; font-weight: 600; margin-left: 4px; vertical-align: middle; }
.ki-suppressed { opacity: 0.6; }
.tabs { display: flex; gap: 4px; margin-bottom: 12px; }
.tab-btn { padding: 6px 14px; border: 1px solid #d1d5db; background: #fff; border-radius: 6px 6px 0 0; cursor: pointer; font-size: 0.8rem; }
.tab-btn:hover { background: #f3f4f6; }
.tab-btn.active { background: #e5e7eb; border-bottom-color: #e5e7eb; font-weight: 600; }
.tab-content { display: none; }
.tab-content.active { display: block; }
.mini-trend { margin-bottom: 20px; }
.mini-trend svg { max-width: 100%; height: auto; }
.sidebar { float: left; width: 220px; margin-right: 16px; margin-bottom: 16px; background: #fff; border-radius: 8px; padding: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); font-size: 0.85rem; }
.sidebar .tree-node { padding: 4px 8px; cursor: pointer; border-radius: 4px; margin: 2px 0; }
.sidebar .tree-node:hover { background: #f3f4f6; }
.sidebar .tree-node.active { background: #e0e7ff; color: #4338ca; font-weight: 600; }
.timeline-row { display: flex; align-items: center; gap: 8px; padding: 6px 0; font-size: 0.85rem; cursor: pointer; }
.timeline-row:hover { background: #f9fafb; }
.timeline-bar { height: 16px; border-radius: 3px; min-width: 4px; flex-shrink: 0; }
.detail-toggle { cursor: pointer; font-size: 0.75rem; color: #6366f1; margin-left: 4px; user-select: none; }
.detail-row { background: #f8fafc; }
.detail-row td { padding: 12px; }
.detail-step-num { display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px; border-radius: 50%; background: #6366f1; color: #fff; font-size: 0.7rem; font-weight: 700; margin-right: 6px; flex-shrink: 0; }
.detail-screenshots { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 8px; }
.detail-screenshots figure { margin: 0; text-align: center; }
.detail-screenshots img { max-width: 300px; border: 1px solid #e5e7eb; border-radius: 4px; }
.detail-screenshots figcaption { font-size: 0.75rem; color: #6b7280; margin-top: 4px; }
.detail-logs { margin-top: 8px; }
.detail-logs pre { background: #1f2937; color: #e5e7eb; padding: 8px 12px; border-radius: 4px; font-size: 0.75rem; overflow-x: auto; max-height: 200px; }
.detail-logs .log-count { font-size: 0.7rem; color: #6b7280; margin-top: 4px; }
.rate-good { color: ` +
        t.colors.success +
        `; }
.rate-warn { color: ` +
        t.colors.warn +
        `; }
.rate-bad { color: ` +
        t.colors.error +
        `; }
@media print { .control-bar, .detail-toggle, .sidebar, .tabs { display: none !important; } body { padding: 0; } }
html.dark body { background: #0d1117; color: #c9d1d9; }
html.dark .card { background: #161b22; box-shadow: 0 1px 3px rgba(0,0,0,0.4); }
html.dark .chart-box { background: #161b22; box-shadow: 0 1px 3px rgba(0,0,0,0.4); }
html.dark .card .label { color: #8b949e; }
html.dark table { background: #161b22; box-shadow: 0 1px 3px rgba(0,0,0,0.4); }
html.dark th { background: #1c2128; color: #8b949e; }
html.dark td { border-top-color: #30363d; }
html.dark .footer { color: #8b949e; }
html.dark .control-bar button { background: #21262d; color: #c9d1d9; border-color: #30363d; }
html.dark .control-bar button:hover { background: #30363d; }
html.dark .status-passed { background: #052e16; color: #4ade80; }
html.dark .status-failed { background: #450a0a; color: #f87171; }
html.dark .status-skipped { background: #451a03; color: #fbbf24; }
html.dark tr:hover { background: #1c2128; }
html.dark tr:nth-child(even) { background: #1c2128; }
html.dark tr:nth-child(even):hover { background: #21262d; }
html.dark .error-cell { color: #f87171; }
html.dark .ki-badge { background: #451a03; color: #fbbf24; }
html.dark .sidebar { background: #161b22; }
html.dark .sidebar .tree-node:hover { background: #1c2128; }
html.dark .sidebar .tree-node.active { background: #1e1b4b; color: #a5b4fc; }
html.dark .timeline-row:hover { background: #1c2128; }
html.dark .detail-row { background: #1c2128; }
html.dark .detail-screenshots img { border-color: #30363d; }
html.dark .tab-btn { background: #21262d; color: #c9d1d9; border-color: #30363d; }
html.dark .tab-btn:hover { background: #30363d; }
html.dark .tab-btn.active { background: #161b22; border-bottom-color: #161b22; }
`
    );
}

function buildThemeScript(theme?: string): string {
    return `<script id="qa-report-theme">
(function() {
    var theme = '${theme || 'system'}';
    function apply(t) {
        if (t === 'dark') { document.documentElement.classList.add('dark'); }
        else if (t === 'light') { document.documentElement.classList.remove('dark'); }
        else if (window.matchMedia('(prefers-color-scheme: dark)').matches) { document.documentElement.classList.add('dark'); }
    }
    apply(theme);
})();
function toggleTheme() {
    var html = document.documentElement;
    html.classList.toggle('dark');
    var isDark = html.classList.contains('dark');
    try { localStorage.setItem('qa-theme', isDark ? 'dark' : 'light'); } catch(e) {}
}
</script>`;
}

function buildMiniTrendChart(trends: TrendPoint[]): string {
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

function buildTrendSection(trends: TrendPoint[]): string {
    if (trends.length < 2) return '';
    let html = '<div class="chart-box">';
    html += '<div class="label" style="margin-bottom:8px">Pass Rate Trend</div>';
    html += buildMiniTrendChart(trends);
    html += '</div>';
    return html;
}

function matchKnownIssue(title: string, knownIssues: KnownIssue[]): KnownIssue | undefined {
    const lower = title.toLowerCase();
    return knownIssues.find(function (ki) {
        return lower.includes(ki.pattern.toLowerCase());
    });
}

function buildTabs(runs: TestRunTab[]): string {
    if (runs.length <= 1) return '';
    let html = '<div id="envTabs" class="tabs">';
    for (let i = 0; i < runs.length; i++) {
        html +=
            '<button class="tab-btn' +
            (i === 0 ? ' active' : '') +
            '" onclick="switchTab(' +
            i +
            ')">' +
            escapeHtml(runs[i]!.name) +
            '</button>';
    }
    html += '</div>';
    return html;
}

function buildTabContents(
    runs: TestRunTab[],
    categories?: Record<string, string>,
    history?: Record<string, TestHistoryRun[]>,
    knownIssues?: KnownIssue[],
): string {
    if (runs.length <= 1) return '';
    let html = '<div id="tabContents">';
    let tabIdx = 0;
    for (const run of runs) {
        html += '<div id="tabContent-' + tabIdx + '" class="tab-content' + (tabIdx === 0 ? ' active' : '') + '">';
        html += buildFilterBar();
        html += buildTestTable(run.tests, categories, history, knownIssues);
        html += '</div>';
        tabIdx++;
    }
    html += '</div>';
    return html;
}

function buildHierarchySidebar(tests: FlatTest[]): string {
    const suites = new Set<string>();
    for (const t of tests) {
        const suite = extractSuite(t);
        if (suite) suites.add(suite);
    }
    if (suites.size === 0) return '';
    const sorted = Array.from(suites).sort();
    let html = '<div class="sidebar">';
    html +=
        '<div style="font-weight:600;margin-bottom:6px;font-size:0.8rem;text-transform:uppercase;color:#6b7280">Suites</div>';
    for (const suite of sorted) {
        html +=
            '<div class="tree-node" onclick="filterByHierarchy(\'' +
            escapeHtml(suite) +
            '\')">' +
            escapeHtml(suite) +
            '</div>';
    }
    html +=
        '<div class="tree-node" onclick="clearHierarchy()" style="margin-top:6px;font-style:italic;color:#6b7280">Clear filter</div>';
    html += '</div>';
    return html;
}

function buildTimeline(tests: FlatTest[]): string {
    if (tests.length === 0) return '';
    let maxDur = 0;
    for (const t of tests) {
        if (t.duration > maxDur) maxDur = t.duration;
    }
    if (maxDur === 0) maxDur = 1;
    let html =
        '<div class="chart-box"><div class="label" style="margin-bottom:8px">Timeline <button id="timelineToggle" onclick="toggleTimeline()" style="font-size:0.75rem;margin-left:8px">Hide</button></div>';
    html += '<div id="timelineBody">';
    for (const t of tests) {
        const barW = Math.max(4, (t.duration / maxDur) * 300);
        const color = t.state === 'passed' ? '#22c55e' : t.state === 'failed' ? '#ef4444' : '#facc15';
        html += '<div class="timeline-row" onclick="scrollToTest(\'' + escapeHtml(t.title) + '\')">';
        html += '<span class="status-badge status-' + t.state + '">' + t.state + '</span>';
        html +=
            '<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' +
            escapeHtml(t.title) +
            '</span>';
        html += '<div class="timeline-bar" style="width:' + barW.toFixed(0) + 'px;background:' + color + '"></div>';
        html += '<span style="font-size:0.75rem;color:#6b7280;flex-shrink:0">' + fmtDuration(t.duration) + '</span>';
        html += '</div>';
    }
    html += '</div></div>';
    return html;
}

function buildDetailRow(t: FlatTest, index: number, colspan: number): string {
    const hasSteps = t.steps && t.steps.length > 0;
    const hasScreenshots = t.screenshots && t.screenshots.length > 0;
    const hasLogs = t.logs && t.logs.length > 0;
    if (!hasSteps && !hasScreenshots && !hasLogs) return '';
    let html =
        '<tr class="detail-row" id="detail-row-' +
        index +
        '" data-detail-for="test-' +
        index +
        '" style="display:none"><td colspan="' +
        colspan +
        '">';
    if (hasSteps) {
        html += '<div><strong>Steps</strong></div>';
        html += '<div style="margin-bottom:8px">';
        let stepIdx = 0;
        for (const step of t.steps!) {
            stepIdx++;
            html += '<div style="display:flex;gap:6px;align-items:flex-start;margin:4px 0">';
            html += '<span class="detail-step-num">' + stepIdx + '</span>';
            html += '<div>';
            if (step.action) html += '<div><strong>Action:</strong> ' + escapeHtml(step.action) + '</div>';
            if (step.expected) html += '<div><strong>Expected:</strong> ' + escapeHtml(step.expected) + '</div>';
            html += '</div></div>';
        }
        html += '</div>';
    }
    if (hasScreenshots) {
        html += '<div><strong>Screenshots</strong></div>';
        html += '<div class="detail-screenshots">';
        for (const s of t.screenshots!) {
            html +=
                '<figure><img src="' +
                s.dataUri +
                '" alt="' +
                escapeHtml(s.title) +
                '"/><figcaption>' +
                escapeHtml(s.title) +
                '</figcaption></figure>';
        }
        html += '</div>';
    }
    if (hasLogs) {
        html += '<div><strong>Logs</strong></div>';
        html += '<div class="detail-logs"><pre>' + escapeHtml(t.logs!.join('\n')) + '</pre>';
        html += '<div class="log-count">' + t.logs!.length + ' lines</div></div>';
    }
    html += '</td></tr>';
    return html;
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
        '<button onclick="window.print()" style="padding:4px 12px;border:1px solid #d1d5db;background:#fff;border-radius:6px;cursor:pointer;font-size:0.8rem">PDF</button>' +
        '<button onclick="toggleTheme()" style="padding:4px 12px;border:1px solid #d1d5db;background:#fff;border-radius:6px;cursor:pointer;font-size:0.8rem">🌓</button>' +
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
    knownIssues?: KnownIssue[],
): string {
    const hasPassed = tests.some((t) => t.state === 'passed');
    const hasError = tests.some((t) => t.state === 'failed' && t.error);
    const hasSuite = tests.some((t) => extractSuite(t));
    const hasHistory = history !== undefined && Object.keys(history).length > 0;
    const hasStepsOrScreenshotsOrLogs = tests.some(function (t) {
        return (
            (t.steps && t.steps.length > 0) ||
            (t.screenshots && t.screenshots.length > 0) ||
            (t.logs && t.logs.length > 0)
        );
    });
    let html = hasPassed
        ? '<div class="control-bar"><button id="toggleBtn" onclick="togglePassed()">Toggle Passed</button></div>'
        : '';
    html +=
        '<div class="wrapper"><table><thead><tr><th>#</th><th>Test</th>' +
        (hasSuite ? '<th>Suite</th>' : '') +
        '<th>Status</th><th>Duration</th>' +
        (hasError ? '<th>Error</th>' : '') +
        (hasHistory ? '<th>History</th>' : '') +
        '</tr></thead><tbody>';
    for (const [i, t] of tests.entries()) {
        const matchedKi = knownIssues && t.state === 'failed' ? matchKnownIssue(t.title, knownIssues) : undefined;
        let extraRowClass = '';
        if (t.state === 'passed') extraRowClass = ' row-passed';
        if (matchedKi) extraRowClass += ' ki-suppressed';
        const hierarchy = t.fullTitle ? t.fullTitle.replace(/ > /g, ' \u203A ') : undefined;
        html +=
            '<tr' +
            (extraRowClass ? ' class="' + extraRowClass.trim() + '"' : '') +
            (hierarchy ? ' data-hierarchy="' + escapeHtml(hierarchy) + '"' : '') +
            '>';
        html += '<td>' + (i + 1) + '</td>';
        const cat = t.state === 'failed' && categories ? categories[t.title] : undefined;
        html +=
            '<td' +
            (t.fullTitle ? ' title="' + escapeHtml(t.fullTitle) + '"' : '') +
            '>' +
            escapeHtml(t.title) +
            (cat ? buildCategoryBadge(cat) : '') +
            (matchedKi
                ? '<span class="ki-badge">Known Issue' + (matchedKi.ticket ? ': ' + matchedKi.ticket : '') + '</span>'
                : '') +
            (hasStepsOrScreenshotsOrLogs &&
            ((t.steps && t.steps.length > 0) ||
                (t.screenshots && t.screenshots.length > 0) ||
                (t.logs && t.logs.length > 0))
                ? '<span class="detail-toggle" onclick="toggleDetail(' + i + ')"> \u25BC</span>'
                : '') +
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
        if (hasStepsOrScreenshotsOrLogs) {
            const cols = 4 + (hasSuite ? 1 : 0) + (hasError ? 1 : 0) + (hasHistory ? 1 : 0);
            html += buildDetailRow(t, i, cols + 1);
        }
    }
    html += '</tbody></table></div>';
    return html;
}

function buildToggleScript(): string {
    return `<script>
function togglePassed() {
    var rows = document.querySelectorAll('.row-passed');
    var btn = document.getElementById('toggleBtn');
    var hidden = rows.length > 0 && rows[0].style.display === 'none';
    rows.forEach(function(r) { r.style.display = hidden ? '' : 'none'; });
    if (btn) btn.textContent = hidden ? 'Hide Passed' : 'Show Passed';
}
function filterTable() {
    var q = document.getElementById('searchInput').value.toLowerCase();
    var rows = document.querySelectorAll('tbody tr');
    rows.forEach(function(r) {
        if (r.classList.contains('detail-row')) return;
        r.style.display = r.textContent.toLowerCase().includes(q) ? '' : 'none';
    });
}
function exportCsv() {
    var headers = Array.from(document.querySelectorAll('thead th')).map(function(th) { return th.textContent.trim(); });
    var rows = document.querySelectorAll('tbody tr');
    var csv = headers.join(',') + '\\n';
    rows.forEach(function(r) {
        if (r.style.display !== 'none') {
            if (r.classList.contains('detail-row')) return;
            var cells = r.querySelectorAll('td');
            var vals = Array.from(cells).map(function(c) { return '"' + c.textContent.trim().replace(/"/g, '""') + '"'; });
            csv += vals.join(',') + '\\n';
        }
    });
    var blob = new Blob([csv], { type: 'text/csv' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'test-report.csv';
    a.click();
    URL.revokeObjectURL(a.href);
}
function switchTab(index) {
    var tabs = document.querySelectorAll('.tab-btn');
    tabs.forEach(function(t, i) { t.classList.toggle('active', i === index); });
    var contents = document.querySelectorAll('.tab-content');
    contents.forEach(function(c, i) { c.classList.toggle('active', i === index); });
}
function toggleTimeline() {
    var body = document.getElementById('timelineBody');
    var btn = document.getElementById('timelineToggle');
    if (!body || !btn) return;
    var hidden = body.style.display === 'none';
    body.style.display = hidden ? '' : 'none';
    btn.textContent = hidden ? 'Hide' : 'Show';
}
function scrollToTest(title) {
    var rows = document.querySelectorAll('tbody tr');
    for (var i = 0; i < rows.length; i++) {
        var r = rows[i];
        if (r.classList.contains('detail-row')) continue;
        var firstTd = r.querySelector('td');
        if (firstTd && firstTd.textContent.trim() === title) {
            r.scrollIntoView({ behavior: 'smooth', block: 'center' });
            r.style.background = '#fef3c7';
            setTimeout(function() { r.style.background = ''; }, 2000);
            return;
        }
    }
}
function toggleDetail(index) {
    var row = document.getElementById('detail-row-' + index);
    if (!row) return;
    var hidden = row.style.display === 'none' || row.style.display === '';
    row.style.display = hidden ? 'table-row' : 'none';
}
function filterByHierarchy(suite) {
    var q = document.getElementById('searchInput');
    if (q) q.value = 'h:' + suite;
    var rows = document.querySelectorAll('tbody tr');
    rows.forEach(function(r) {
        if (r.classList.contains('detail-row')) return;
        var hierarchy = r.getAttribute('data-hierarchy') || '';
        var match = hierarchy.toLowerCase().indexOf(suite.toLowerCase()) !== -1;
        r.style.display = match ? '' : 'none';
    });
    var nodes = document.querySelectorAll('.tree-node');
    nodes.forEach(function(n) { n.classList.remove('active'); });
    var targets = document.querySelectorAll('.tree-node');
    targets.forEach(function(n) {
        if (n.textContent.trim().indexOf(suite) !== -1) n.classList.add('active');
    });
}
function clearHierarchy() {
    var q = document.getElementById('searchInput');
    if (q) q.value = '';
    var rows = document.querySelectorAll('tbody tr');
    rows.forEach(function(r) { r.style.display = ''; });
    var nodes = document.querySelectorAll('.tree-node');
    nodes.forEach(function(n) { n.classList.remove('active'); });
}
function toggleTreeNode(el) {
    if (!el) return;
    var parent = el.parentElement;
    if (!parent) return;
    var children = parent.querySelector('.tree-children');
    if (children) {
        children.style.display = children.style.display === 'none' ? '' : 'none';
    }
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
        html += '<title>' + title + '</title><style>' + buildCss() + '</style>';
        html += buildThemeScript(options?.theme);
        html += '</head><body>';
        html += '<h1>' + title + '</h1>';
        html += buildSummaryCards(stats, passRate);
        html += buildFailedSummary(tests, stats);
        html += buildLlmSection(options || { title: '', includeChart: true });
        html += buildChartSection(stats, options?.includeChart !== false);
        html += buildTrendSection(options?.trends || []);
        if (options?.qualityGate !== undefined) {
            html += buildQualityGate(passRate, options.qualityGate);
        }

        const runs = options?.runs;
        if (runs && runs.length > 1) {
            html += buildTabs(runs);
            html += buildTabContents(runs, categories, options?.testHistory, options?.knownIssues);
        } else {
            const hasSidebar = tests.some(function (t) {
                return t.fullTitle && t.fullTitle.indexOf(' > ') !== -1;
            });
            if (hasSidebar) {
                html += '<div style="display:flex;gap:0">';
                html += buildHierarchySidebar(tests);
                html += '<div style="flex:1;min-width:0">';
            }
            html += buildFilterBar();
            html += buildTestTable(tests, categories, options?.testHistory, options?.knownIssues);
            if (hasSidebar) {
                html += '</div></div>';
            }
        }

        html += buildTimeline(tests);
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

/**
 * Load known issues from a JSON file.
 *
 * Supports both { issues: [...] } and top-level array formats.
 * Returns an empty array if the file does not exist or cannot be parsed.
 */
export function loadKnownIssues(filePath: string): KnownIssue[] {
    try {
        if (!fs.existsSync(filePath)) return [];
        const raw = fs.readFileSync(filePath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed as KnownIssue[];
        if (parsed && Array.isArray(parsed.issues)) return parsed.issues as KnownIssue[];
        return [];
    } catch {
        return [];
    }
}

/**
 * Generate a standalone HTML coverage report from epic/issue data.
 *
 * @param epics  - Array of coverage epics with their issues.
 * @param title  - Optional report title (default "Coverage Report").
 * @returns A self-contained HTML string.
 */
export function generateCoverageHtml(epics: CoverageEpic[], title?: string): string {
    try {
        const reportTitle = title || 'Coverage Report';
        const totalIssues = epics.reduce(function (sum, e) {
            return sum + e.issues.length;
        }, 0);
        const closedIssues = epics.reduce(function (sum, e) {
            return (
                sum +
                e.issues.filter(function (i) {
                    return i.status === 'Done' || i.status === 'Closed';
                }).length
            );
        }, 0);
        const closePct = totalIssues > 0 ? ((closedIssues / totalIssues) * 100).toFixed(1) : '0.0';
        let epicRows = '';
        for (const e of epics) {
            epicRows += '<div class="card" style="margin-bottom:12px">';
            epicRows += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">';
            epicRows +=
                '<div><span style="font-weight:700">' +
                escapeHtml(e.key) +
                '</span> &mdash; ' +
                escapeHtml(e.summary) +
                '</div>';
            epicRows +=
                '<span class="status-badge" style="background:#e0e7ff;color:#3730a3">' +
                e.issues.length +
                ' issues, ' +
                closePct +
                '% closed</span>';
            epicRows += '</div>';
            for (const issue of e.issues) {
                const statusClass =
                    issue.status === 'Done' || issue.status === 'Closed'
                        ? 'status-passed'
                        : issue.status === 'In Progress'
                          ? 'status-skipped'
                          : 'status-failed';
                epicRows += '<div style="display:flex;gap:8px;align-items:center;padding:4px 0;font-size:0.85rem">';
                epicRows += '<span class="status-badge ' + statusClass + '">' + escapeHtml(issue.status) + '</span>';
                epicRows += '<span><strong>' + escapeHtml(issue.key) + '</strong></span>';
                epicRows += '<span>' + escapeHtml(issue.summary) + '</span>';
                epicRows += '<span style="font-size:0.7rem;color:#6b7280">' + escapeHtml(issue.type) + '</span>';
                epicRows += '</div>';
            }
            epicRows += '</div>';
        }
        return (
            '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">' +
            '<title>' +
            reportTitle +
            '</title>' +
            "<style>body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background: #f9fafb; color: #111827; }" +
            'h1 { font-size: 1.5rem; }' +
            '.card { background: #fff; border-radius: 8px; padding: 16px 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }' +
            '.status-badge { display: inline-block; padding: 2px 8px; border-radius: 9999px; font-size: 0.75rem; font-weight: 600; }' +
            '.status-passed { background: #dcfce7; color: #166534; }' +
            '.status-failed { background: #fecaca; color: #991b1b; }' +
            '.status-skipped { background: #fef9c3; color: #854d0e; }' +
            '.summary { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 20px; }' +
            '</style></head><body>' +
            '<h1>' +
            reportTitle +
            '</h1>' +
            '<div class="summary"><div class="card"><div class="label" style="font-size:0.75rem;text-transform:uppercase;color:#4b5563">Total Epics</div><div class="value" style="font-size:1.5rem;font-weight:700">' +
            epics.length +
            '</div></div>' +
            '<div class="card"><div class="label" style="font-size:0.75rem;text-transform:uppercase;color:#4b5563">Total Issues</div><div class="value" style="font-size:1.5rem;font-weight:700">' +
            totalIssues +
            '</div></div>' +
            '<div class="card"><div class="label" style="font-size:0.75rem;text-transform:uppercase;color:#4b5563">Closed</div><div class="value" style="font-size:1.5rem;font-weight:700;color:#16a34a">' +
            closedIssues +
            '</div></div>' +
            '<div class="card"><div class="label" style="font-size:0.75rem;text-transform:uppercase;color:#4b5563">Coverage</div><div class="value" style="font-size:1.5rem;font-weight:700">' +
            closePct +
            '%</div></div></div>' +
            epicRows +
            '<div class="footer" style="margin-top:16px;font-size:0.75rem;color:#4b5563;text-align:center">Generated by QA Tools</div>' +
            '</body></html>'
        );
    } catch (err) {
        rootLogger.error('Failed to generate coverage HTML: ' + (err as Error).message);
        return '<!DOCTYPE html><html><body><h1>Error generating coverage report</h1></body></html>';
    }
}
