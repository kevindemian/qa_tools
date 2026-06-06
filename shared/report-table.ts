/**
 * Test-table builders for HTML reports — row rendering, error cells, history dots,
 * category & flakiness badges, and the full test table with filtering and detail rows.
 *
 * Uses primitives for consistent badge, table, and cell rendering.
 *
 * @module report-table
 */

import { escapeHtml, fmtDuration } from './report-utils.js';
import { extractSuite, CATEGORY_COLORS, categorizeFailure } from './report-types.js';
import type { FlatTest } from './result_parser.js';
import type { TestHistoryRun, KnownIssue } from './report-types.js';
import { Badge } from './primitives/index.js';
import { Tr, Td } from './primitives/index.js';
import { tokens } from './theme-tokens.js';

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
    if (hasSteps) html += _renderStepsHtml(t.steps as NonNullable<FlatTest['steps']>);
    if (hasScreenshots) html += _renderScreenshotsHtml(t.screenshots as NonNullable<FlatTest['screenshots']>);
    if (hasLogs) html += _renderLogsHtml(t.logs as NonNullable<FlatTest['logs']>);
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

    interface ColDef {
        key: string;
        label: string;
        width?: string;
    }

    const columns: ColDef[] = [
        { key: 'index', label: '#', width: '40px' },
        { key: 'test', label: 'Test' },
        ...(hasSuite ? [{ key: 'suite', label: 'Suite' }] : []),
        { key: 'status', label: 'Status' },
        { key: 'duration', label: 'Duration' },
        ...(hasError ? [{ key: 'error', label: 'Error' }] : []),
        ...(hasHistory ? [{ key: 'history', label: 'History' }] : []),
        ...(hasFlakiness ? [{ key: 'flaky', label: 'Flaky' }] : []),
    ];

    const cellPadding = `${tokens.spacing.xs}px ${tokens.spacing.sm}px`;

    let thead = '<thead style="background:var(--color-surface-elevated)"><tr>';
    for (const col of columns) {
        const width = col.width ? `width:${col.width};` : '';
        thead += `<th data-column="${col.key}"
            scope="col"
            style="padding:${cellPadding};${width}
                   font-size:${tokens.fontSize.sm};text-transform:uppercase;
                   color:var(--color-text-secondary);white-space:nowrap;
                   border-bottom:2px solid var(--color-border-subtle)">
            ${col.label}
        </th>`;
    }
    thead += '</tr></thead>';

    let tbody = '<tbody>';
    for (const [i, t] of tests.entries()) {
        const matchedKi = knownIssues && t.state === 'failed' ? matchKnownIssue(t.title, knownIssues) : undefined;
        const cat = t.state === 'failed' && categories ? categories[t.title] : undefined;
        const hasStepsOrScreenshotsOrLogs =
            (t.steps?.length ?? 0) > 0 || (t.screenshots?.length ?? 0) > 0 || (t.logs?.length ?? 0) > 0;

        let testCell = escapeHtml(t.title);
        if (cat) testCell += buildCategoryBadge(cat);
        if (matchedKi) {
            testCell += `<span class="ki-badge">Known Issue${matchedKi.ticket ? ': ' + matchedKi.ticket : ''}</span>`;
        }
        if (hasStepsOrScreenshotsOrLogs) {
            testCell += '<span class="detail-toggle" onclick="toggleDetail(' + i + ')"> \u25BC</span>';
        }

        const statusBadge = Badge({
            variant: t.state === 'passed' ? 'pass' : t.state === 'failed' ? 'fail' : 'skip',
            children: t.state,
        });

        const durationCell = t.state === 'skipped' ? '—' : fmtDuration(t.duration);

        let flakyCell = '';
        if (hasFlakiness && flakinessMap) {
            const rate = flakinessMap[t.title] ?? flakinessMap[t.fullTitle ?? ''] ?? 0;
            flakyCell = rate > 0 ? buildFlakinessBadge(rate) : '<span style="color:var(--color-text-muted)">—</span>';
        }

        const rowClass = (t.state === 'passed' ? 'row-passed' : '') + (matchedKi ? ' ki-suppressed' : '');
        const hierarchyAttr = t.fullTitle ? ` data-hierarchy="${escapeHtml(t.fullTitle)}"` : '';
        const fullTitle = t.fullTitle;

        let cells = '';
        cells += Td({ children: String(i + 1) });
        cells += Td({ children: testCell, ...(fullTitle ? { title: escapeHtml(fullTitle) } : {}) });
        if (hasSuite) cells += Td({ children: escapeHtml(extractSuite(t)) });
        cells += Td({ children: statusBadge });
        cells += Td({ children: durationCell });
        if (hasError) cells += Td({ children: buildErrorCell(t) });
        if (hasHistory) {
            const testHistory = history?.[t.title] ?? history?.[t.fullTitle ?? ''] ?? [];
            cells += Td({ children: buildHistoryCell(testHistory) });
        }
        if (hasFlakiness) cells += Td({ children: flakyCell });

        tbody += Tr({ key: `test-${i}`, class: rowClass, attrs: hierarchyAttr, children: cells });

        const detail = buildDetailRow(t, i, columns.length);
        if (detail) tbody += detail;
    }
    tbody += '</tbody>';

    const tableHtml = `<div data-component="table-wrapper" style="overflow-x:auto;border-radius:${tokens.borderRadius.lg}px;box-shadow:${tokens.shadow.card}"><table data-component="data-table"
        role="table"
        style="width:100%;border-collapse:collapse;background:var(--color-surface-card);
               font-size:${tokens.fontSize.lg};color:var(--color-text-primary)">${thead}${tbody}</table></div>`;

    const toggleBtn = hasPassed
        ? '<div class="control-bar"><button id="toggleBtn" onclick="togglePassed()">Toggle Passed</button></div>'
        : '';

    return toggleBtn + tableHtml;
}
