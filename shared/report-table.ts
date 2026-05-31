/** Test-table builders for HTML reports — row rendering, error cells, history dots,
 *  category & flakiness badges, and the full test table with filtering and detail rows.
 * @module report-table */
import { escapeHtml, fmtDuration } from './report-utils';
import { extractSuite, CATEGORY_COLORS, categorizeFailure } from './report-types';
import type { FlatTest } from './result_parser';
import type { TestHistoryRun, KnownIssue } from './report-types';

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

function _renderStepsHtml(steps: NonNullable<FlatTest['steps']>): string {
    let html = '<div><strong>Steps</strong></div><div style="margin-bottom:8px">';
    let stepIdx = 0;
    for (const step of steps) {
        stepIdx++;
        html += '<div style="display:flex;gap:6px;align-items:flex-start;margin:4px 0">';
        html += '<span class="detail-step-num">' + stepIdx + '</span><div>';
        if (step.action) html += '<div><strong>Action:</strong> ' + escapeHtml(step.action) + '</div>';
        if (step.expected) html += '<div><strong>Expected:</strong> ' + escapeHtml(step.expected) + '</div>';
        html += '</div></div>';
    }
    html += '</div>';
    return html;
}

function _renderScreenshotsHtml(screenshots: NonNullable<FlatTest['screenshots']>): string {
    let html = '<div><strong>Screenshots</strong></div><div class="detail-screenshots">';
    for (const s of screenshots) {
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
    return html;
}

function _renderLogsHtml(logs: NonNullable<FlatTest['logs']>): string {
    return (
        '<div><strong>Logs</strong></div><div class="detail-logs"><pre>' +
        escapeHtml(logs.join('\n')) +
        '</pre><div class="log-count">' +
        logs.length +
        ' lines</div></div>'
    );
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
    if (hasSteps) html += _renderStepsHtml(t.steps!);
    if (hasScreenshots) html += _renderScreenshotsHtml(t.screenshots!);
    if (hasLogs) html += _renderLogsHtml(t.logs!);
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

export function buildFlakinessBadge(rate: number): string {
    const pct = Math.round(rate * 100);
    const color = pct >= 50 ? '#dc2626' : pct >= 20 ? '#ca8a04' : '#16a34a';
    const label = pct >= 50 ? 'alta' : pct >= 20 ? 'média' : 'baixa';
    return `<span style="display:inline-block;padding:1px 6px;border-radius:4px;background:${color}20;color:${color};font-size:0.7rem;font-weight:600;margin-left:4px" title="Flakiness: ${pct}%">🔄 ${label}</span>`;
}

function _buildTableHeaderRow(
    hasSuite: boolean,
    hasError: boolean,
    hasHistory: boolean,
    hasFlakiness: boolean,
): string {
    return (
        '<thead><tr><th>#</th><th>Test</th>' +
        (hasSuite ? '<th>Suite</th>' : '') +
        '<th>Status</th><th>Duration</th>' +
        (hasError ? '<th>Error</th>' : '') +
        (hasHistory ? '<th>History</th>' : '') +
        (hasFlakiness ? '<th>Flaky</th>' : '') +
        '</tr></thead>'
    );
}

function _buildStatusBadge(state: string): string {
    return '<span class="status-badge status-' + state + '">' + state + '</span>';
}

interface _ColumnFlags {
    hasSuite: boolean;
    hasError: boolean;
    hasHistory: boolean;
    hasFlakiness: boolean;
    hasStepsOrScreenshotsOrLogs: boolean;
}

function _buildTestTableRow(
    t: FlatTest,
    i: number,
    categories: Record<string, string> | undefined,
    history: Record<string, TestHistoryRun[]> | undefined,
    knownIssues: KnownIssue[] | undefined,
    flakinessMap: Record<string, number> | undefined,
    flags: _ColumnFlags,
): string {
    const matchedKi = knownIssues && t.state === 'failed' ? matchKnownIssue(t.title, knownIssues) : undefined;
    let extraRowClass = '';
    if (t.state === 'passed') extraRowClass = ' row-passed';
    if (matchedKi) extraRowClass += ' ki-suppressed';
    const hierarchy = t.fullTitle ? t.fullTitle.replace(/ > /g, ' \u203A ') : undefined;
    let html =
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
        (flags.hasStepsOrScreenshotsOrLogs &&
        ((t.steps && t.steps.length > 0) ||
            (t.screenshots && t.screenshots.length > 0) ||
            (t.logs && t.logs.length > 0))
            ? '<span class="detail-toggle" onclick="toggleDetail(' + i + ')"> \u25BC</span>'
            : '') +
        '</td>';
    if (flags.hasSuite) html += '<td>' + escapeHtml(extractSuite(t)) + '</td>';
    html += '<td>' + _buildStatusBadge(t.state) + '</td>';
    html += '<td>' + (t.state === 'skipped' ? '—' : fmtDuration(t.duration)) + '</td>';
    if (flags.hasError) html += '<td>' + buildErrorCell(t) + '</td>';
    if (flags.hasHistory) {
        const testHistory = history![t.title] ?? history![t.fullTitle ?? ''] ?? [];
        html += buildHistoryCell(testHistory);
    }
    if (flags.hasFlakiness) {
        const rate = flakinessMap![t.title] ?? flakinessMap![t.fullTitle ?? ''] ?? 0;
        html += '<td>' + (rate > 0 ? buildFlakinessBadge(rate) : '<span style="color:#9ca3af">—</span>') + '</td>';
    }
    html += '</tr>';
    if (flags.hasStepsOrScreenshotsOrLogs) {
        const cols = 4 + (flags.hasSuite ? 1 : 0) + (flags.hasError ? 1 : 0) + (flags.hasHistory ? 1 : 0);
        html += buildDetailRow(t, i, cols + 1);
    }
    return html;
}

export function buildTestTable(
    tests: FlatTest[],
    categories?: Record<string, string>,
    history?: Record<string, TestHistoryRun[]>,
    knownIssues?: KnownIssue[],
    flakinessMap?: Record<string, number>,
): string {
    const hasPassed = tests.some((t) => t.state === 'passed');
    const hasError = tests.some((t) => t.state === 'failed' && t.error);
    const hasSuite = tests.some((t) => extractSuite(t));
    const hasHistory = history !== undefined && Object.keys(history).length > 0;
    const hasFlakiness = flakinessMap !== undefined && Object.keys(flakinessMap).length > 0;
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
        '<div class="wrapper"><table>' + _buildTableHeaderRow(hasSuite, hasError, hasHistory, hasFlakiness) + '<tbody>';
    for (const [i, t] of tests.entries()) {
        html += _buildTestTableRow(t, i, categories, history, knownIssues, flakinessMap, {
            hasSuite,
            hasError,
            hasHistory,
            hasFlakiness,
            hasStepsOrScreenshotsOrLogs,
        });
    }
    html += '</tbody></table></div>';
    return html;
}
