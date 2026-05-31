/** Diff-comparison section builder for HTML reports — renders new failures, fixes, and flaky counts.
 *  Shows summary cards and per-test rows for each category.
 * @module report-diff */
import { escapeHtml } from './report-utils';
import type { FlatTest } from './result_parser';
import type { ReportOptions } from './report-types';

function _buildDiffSummaryCards(newFails: number, newPasses: number, flakyCount: number): string {
    let html = '<div class="label" style="margin-bottom:12px;font-size:1rem">\ud83d\udcca Run Comparison</div>';
    html += '<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:12px">';
    html +=
        '<div class="card" style="padding:8px 16px;background:#fef2f2;border-radius:6px;min-width:80px;text-align:center">' +
        '<div style="font-size:1.2rem;font-weight:700;color:#dc2626">' +
        newFails +
        '</div>' +
        '<div style="font-size:0.7rem;color:#991b1b">new failures</div></div>';
    html +=
        '<div class="card" style="padding:8px 16px;background:#f0fdf4;border-radius:6px;min-width:80px;text-align:center">' +
        '<div style="font-size:1.2rem;font-weight:700;color:#16a34a">' +
        newPasses +
        '</div>' +
        '<div style="font-size:0.7rem;color:#166534">fixed</div></div>';
    if (flakyCount > 0) {
        html +=
            '<div class="card" style="padding:8px 16px;background:#fefce8;border-radius:6px;min-width:80px;text-align:center">' +
            '<div style="font-size:1.2rem;font-weight:700;color:#ca8a04">' +
            flakyCount +
            '</div>' +
            '<div style="font-size:0.7rem;color:#854d0e">flaky</div></div>';
    }
    html += '</div>';
    return html;
}

function _buildDiffRow(t: FlatTest, badgeText: string, badgeClass: string): string {
    let html =
        '<div style="display:flex;gap:8px;align-items:center;padding:4px 0;font-size:0.85rem">' +
        '<span class="status-badge status-' +
        badgeClass +
        '">' +
        badgeText +
        '</span>' +
        '<span>' +
        escapeHtml(t.title) +
        '</span>';
    if (t.error) {
        html +=
            '<span style="color:#6b7280;font-size:0.75rem;max-width:400px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' +
            escapeHtml(t.error) +
            '</span>';
    }
    html += '</div>';
    return html;
}

function _buildDiffSection(
    tests: FlatTest[],
    title: string,
    badgeText: string,
    badgeClass: string,
    extraStyle?: string,
): string {
    const style = 'margin-bottom:8px' + (extraStyle ? ';' + extraStyle : '');
    let html = '<div style="' + style + '"><strong>' + title + '</strong></div>';
    for (const t of tests) {
        html += _buildDiffRow(t, badgeText, badgeClass);
    }
    return html;
}

export function buildDiffComparisonSection(diff: NonNullable<ReportOptions['diffComparison']>): string {
    const newFails = diff.newFailures.length;
    const newPasses = diff.newPasses.length;
    const flakyCount = diff.flaky.length;
    if (newFails === 0 && newPasses === 0 && flakyCount === 0) return '';

    let html = '<div class="chart-box" style="margin-top:16px">';
    html += _buildDiffSummaryCards(newFails, newPasses, flakyCount);
    if (newFails > 0) html += _buildDiffSection(diff.newFailures, 'New failures:', 'failed', 'failed');
    if (newPasses > 0)
        html += _buildDiffSection(diff.newPasses, 'Fixed (now passing):', 'passed', 'passed', 'margin-top:8px');
    if (flakyCount > 0)
        html += _buildDiffSection(diff.flaky, 'Flaky (status changed):', 'flaky', 'skipped', 'margin-top:8px');
    html += '</div>';
    return html;
}
