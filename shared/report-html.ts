import { rootLogger } from './logger';
import { getTheme } from './theme';
import { sanitizeUrl } from './cli_base';
import type { FlatTest } from './result_parser';
import type { TrendPoint } from './metrics';
import type { TestHistoryRun, KnownIssue, TestRunTab, CoverageEpic, ReportOptions, ReportStats } from './report-types';
import {
    DEFAULT_TITLE,
    PASS_RATE_GOOD_THRESHOLD,
    PASS_RATE_WARN_THRESHOLD,
    CATEGORY_COLORS,
    categorizeFailure,
    extractSuite,
} from './report-types';
import { buildCss, buildThemeScript } from './report-styles';
import { buildToggleScript } from './report-scripts';

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

function healthColor(score: number): string {
    if (score >= 80) return '#22c55e';
    if (score >= 50) return '#eab308';
    return '#ef4444';
}

function healthBg(score: number): string {
    if (score >= 80) return '#f0fdf4';
    if (score >= 50) return '#fefce8';
    return '#fef2f2';
}

function buildHealthSection(health: import('./types').HealthScoreResult): string {
    const qcIcon = health.qualityGate === 'pass' ? '✅' : '❌';
    const qcText = health.qualityGate === 'pass' ? 'Pass' : 'Fail';
    const qcColor = health.qualityGate === 'pass' ? '#166534' : '#991b1b';
    const qcBg = health.qualityGate === 'pass' ? '#dcfce7' : '#fecaca';
    const overallColor = healthColor(health.overall);
    const dims = health.dimensions;
    const dimEntries: Array<{ label: string; score: number; status: string }> = [
        { label: 'Pass Rate', score: dims.passRate.score, status: dims.passRate.status },
        { label: 'Flaky Rate', score: dims.flakyRate.score, status: dims.flakyRate.status },
        { label: 'Coverage', score: dims.coverage.score, status: dims.coverage.status },
        { label: 'Suite Speed', score: dims.suiteSpeed.score, status: dims.suiteSpeed.status },
    ];

    let html = '<div class="chart-box" style="margin-top:16px">';
    html += '<div class="label" style="margin-bottom:12px;font-size:1rem">📊 Test Suite Health</div>';
    html += '<div style="display:flex;gap:16px;flex-wrap:wrap;align-items:center;margin-bottom:16px">';
    html += `<div style="text-align:center;min-width:100px"><div style="font-size:2.5rem;font-weight:800;color:${overallColor}">${health.overall}</div>`;
    html += `<div style="font-size:0.8rem;color:#6b7280;text-transform:capitalize">${health.grade.replace(/_/g, ' ')}</div></div>`;
    html += `<div style="padding:4px 12px;border-radius:9999px;font-size:0.85rem;font-weight:600;background:${qcBg};color:${qcColor}">${qcIcon} Quality Gate: ${qcText}</div>`;
    html += `<div style="font-size:0.75rem;color:#6b7280">${health.runCount} run(s) · ${health.timestamp.slice(0, 10)}</div>`;
    html += '</div>';
    html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px">';
    for (const d of dimEntries) {
        const barColor = healthColor(d.score);
        const bg = healthBg(d.score);
        const icon = d.status === 'pass' ? '✅' : '❌';
        html += `<div style="background:${bg};border-radius:6px;padding:10px 12px">`;
        html += `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">`;
        html += `<span style="font-size:0.75rem;color:#4b5563">${d.label}</span>`;
        html += `<span style="font-size:0.8rem;font-weight:700;color:${barColor}">${d.score} ${icon}</span>`;
        html += '</div>';
        html += `<div style="height:6px;background:#e5e7eb;border-radius:3px;overflow:hidden">`;
        html += `<div style="height:100%;width:${d.score}%;background:${barColor};border-radius:3px;transition:width 0.3s"></div>`;
        html += '</div></div>';
    }
    html += '</div></div>';
    return html;
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
    const isPass = (s: string) => s.toUpperCase() === 'PASSED' || s === 'PASS';
    const isFail = (s: string) => s.toUpperCase() === 'FAILED' || s === 'FAIL';
    const isSkip = (s: string) => s.toUpperCase() === 'SKIPPED' || s === 'ABORTED';
    const dotClass = (s: string) =>
        isPass(s) ? 'hist-pass' : isFail(s) ? 'hist-fail' : isSkip(s) ? 'hist-skip' : 'hist-other';
    const dots = history
        .map((r) => '<span class="hist-dot ' + dotClass(r.status) + '" title="' + escapeHtml(r.status) + '"></span>')
        .join('');
    const lines = history
        .map(
            (r) =>
                '<span style="display:flex;gap:6px;align-items:center">' +
                '<span class="hist-dot ' +
                dotClass(r.status) +
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

function buildCategoryBadge(cat: string): string {
    const color = CATEGORY_COLORS[cat] || '#6b7280';
    return `<span style="display:inline-block;padding:1px 6px;border-radius:4px;background:${color}20;color:${color};font-size:0.7rem;font-weight:600;margin-left:4px">${cat}</span>`;
}

function escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function generateHtmlReport(tests: FlatTest[], options?: ReportOptions): string {
    return generateReportWithFallback(tests, options);
}

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
        if (options?.healthScore) {
            html += buildHealthSection(options.healthScore);
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
