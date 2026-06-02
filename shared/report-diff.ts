/**
 * Diff-comparison section builder for HTML reports — renders new failures, fixes, and flaky counts.
 *
 * Uses primitives for card, badge, and layout consistency.
 *
 * @module report-diff
 */

import { escapeHtml } from './report-utils';
import type { FlatTest } from './result_parser';
import type { ReportOptions } from './report-types';
import { Card, Badge, MetricCard, FlexRow } from './primitives';

function _buildDiffSummaryCards(newFails: number, newPasses: number, flakyCount: number): string {
    let html = MetricCard({ label: 'new failures', value: String(newFails), severity: 'error', icon: '❌' });
    html += MetricCard({ label: 'fixed', value: String(newPasses), severity: 'success', icon: '✅' });
    if (flakyCount > 0) {
        html += MetricCard({ label: 'flaky', value: String(flakyCount), severity: 'warn', icon: '🔄' });
    }
    return FlexRow({ children: html, gap: 12 });
}

function _buildDiffRow(t: FlatTest, badgeText: string, badgeClass: string): string {
    const badgeVariant = badgeClass === 'passed' ? 'pass' : badgeClass === 'failed' ? 'fail' : 'skip';
    const badge = Badge({ variant: badgeVariant, children: badgeText });
    let html =
        '<div style="display:flex;gap:8px;align-items:center;padding:4px 0;font-size:0.85rem">' +
        badge +
        '<span>' +
        escapeHtml(t.title) +
        '</span>';
    if (t.error) {
        html +=
            '<span style="color:var(--color-text-muted);font-size:0.75rem;max-width:400px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' +
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

    let content = '';
    content += '<div class="label" style="margin-bottom:12px;font-size:1rem">📊 Run Comparison</div>';
    content += _buildDiffSummaryCards(newFails, newPasses, flakyCount);
    if (newFails > 0) content += _buildDiffSection(diff.newFailures, 'New failures:', 'failed', 'failed');
    if (newPasses > 0)
        content += _buildDiffSection(diff.newPasses, 'Fixed (now passing):', 'passed', 'passed', 'margin-top:8px');
    if (flakyCount > 0)
        content += _buildDiffSection(diff.flaky, 'Flaky (status changed):', 'flaky', 'skip', 'margin-top:8px');

    return Card({
        variant: 'default',
        children: content,
    });
}
