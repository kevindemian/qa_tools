/** UI section builders for HTML reports — summary cards, filter bar, tabs,
 * sidebar, timeline, quality gate, LLM analysis, and failed-test summary.
 * @module report-sections */
import { getTheme } from './theme';
import { escapeHtml, fmtDuration, pct, pctSub, pctClass } from './report-utils';
import { extractSuite, CATEGORY_COLORS, categorizeFailure } from './report-types';
import type { FlatTest } from './result_parser';
import type { TestRunTab, TestHistoryRun, KnownIssue, ReportOptions, ReportStats } from './report-types';

export function matchKnownIssue(title: string, knownIssues: KnownIssue[]): KnownIssue | undefined {
    const lower = title.toLowerCase();
    return knownIssues.find(function (ki) {
        return lower.includes(ki.pattern.toLowerCase());
    });
}

export function precomputeCategories(tests: FlatTest[]): Record<string, string> {
    const cats: Record<string, string> = {};
    for (const t of tests) {
        if (t.state === 'failed' && t.error) {
            cats[t.title] = categorizeFailure(t.error);
        }
    }
    return cats;
}

export function buildDetailRow(t: FlatTest, index: number, colspan: number): string {
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

export function buildErrorCell(t: FlatTest): string {
    if (t.state === 'failed' && t.error) {
        const truncated = t.error.length > 120 ? t.error.slice(0, 120) + '...' : t.error;
        const isTruncated = t.error.length > 120;
        const cls = isTruncated ? 'error-cell error-truncated' : 'error-cell';
        const attrs = isTruncated ? ' data-full="' + escapeHtml(t.error) + '"' : ' title="' + escapeHtml(t.error) + '"';
        return '<span class="' + cls + '"' + attrs + '>' + escapeHtml(truncated) + '</span>';
    }
    return '';
}

export function buildHistoryCell(history: TestHistoryRun[]): string {
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

export function buildCategoryBadge(cat: string): string {
    const color = CATEGORY_COLORS[cat] || '#6b7280';
    return `<span style="display:inline-block;padding:1px 6px;border-radius:4px;background:${color}20;color:${color};font-size:0.7rem;font-weight:600;margin-left:4px">${cat}</span>`;
}

export function buildTestTable(
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

export function buildTabs(runs: TestRunTab[]): string {
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

export function buildTabContents(
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

export function buildHierarchySidebar(tests: FlatTest[]): string {
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

export function buildTimeline(tests: FlatTest[]): string {
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

export function buildSummaryCards(stats: ReportStats, passRate: number): string {
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

export function buildLlmSection(options: ReportOptions): string {
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

export function buildQualityGate(passRate: number, threshold: number): string {
    if (passRate >= threshold) return '';
    return `<div class="chart-box" style="border-left:4px solid #ef4444;background:#fef2f2">
<div class="label" style="color:#991b1b;margin-bottom:4px">❌ Quality Gate Failed</div>
<p style="margin:0;font-size:0.85rem">Pass rate ${passRate.toFixed(1)}% is below the configured threshold of ${threshold}%.</p>
</div>`;
}

export function buildFilterBar(): string {
    return (
        '<div class="control-bar" style="display:flex;gap:8px;align-items:center">' +
        '<input id="searchInput" type="text" placeholder="Filter tests..." oninput="filterTable()" style="padding:4px 8px;border:1px solid #d1d5db;border-radius:6px;font-size:0.8rem;flex:1">' +
        '<button onclick="exportCsv()" style="padding:4px 12px;border:1px solid #d1d5db;background:#fff;border-radius:6px;cursor:pointer;font-size:0.8rem">Export CSV</button>' +
        '<button onclick="window.print()" style="padding:4px 12px;border:1px solid #d1d5db;background:#fff;border-radius:6px;cursor:pointer;font-size:0.8rem">PDF</button>' +
        '<button onclick="toggleTheme()" style="padding:4px 12px;border:1px solid #d1d5db;background:#fff;border-radius:6px;cursor:pointer;font-size:0.8rem">🌓</button>' +
        '</div>'
    );
}

export function buildFailedSummary(tests: FlatTest[], stats: ReportStats): string {
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
