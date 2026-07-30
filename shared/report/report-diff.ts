/**
 * Diff-comparison section builder for HTML reports — renders new failures, fixes, and flaky counts.
 *
 * Uses primitives for card, badge, and layout consistency.
 *
 * @module report-diff
 */

import { escapeHtml } from './report-utils.js';
import { icon } from '../icons.js';
import type { FlatTest } from '../result_parser.js';
import type { ReportOptions } from './report-types.js';
import { Card, Badge, MetricCard, FlexRow } from '../primitives/index.js';

function _buildDiffSummaryCards(newFails: number, newPasses: number, flakyCount: number): string {
    let html = MetricCard({
        label: 'new failures',
        value: String(newFails),
        severity: 'error',
        icon: icon('x-circle', 16),
    });
    html += MetricCard({
        label: 'fixed',
        value: String(newPasses),
        severity: 'success',
        icon: icon('check-circle', 16),
    });
    if (flakyCount > 0) {
        html += MetricCard({
            label: 'flaky',
            value: String(flakyCount),
            severity: 'warn',
            icon: icon('refresh-cw', 16),
        });
    }
    return FlexRow({ children: html, gap: 12 });
}

function _buildDiffRow(t: FlatTest, badgeText: string, badgeClass: string): string {
    let badgeVariant: 'default' | 'info' | 'pass' | 'fail' | 'skip' | 'warn';
    if (badgeClass === 'passed') {
        badgeVariant = 'pass';
    } else if (badgeClass === 'failed') {
        badgeVariant = 'fail';
    } else {
        badgeVariant = 'skip';
    }
    const badge = Badge({ variant: badgeVariant, children: badgeText });
    let html = '<div class="diff-row">' + badge + '<span>' + escapeHtml(t.title) + '</span>';
    if (t.error) {
        html += '<span class="diff-file-name">' + escapeHtml(t.error) + '</span>';
    }
    html += '</div>';
    return html;
}

function _buildDiffSection(
    tests: FlatTest[],
    title: string,
    badgeText: string,
    badgeClass: string,
    spaced?: boolean,
): string {
    const cls = spaced ? 'diff-section diff-section-spaced' : 'diff-section';
    let html = '<div class="' + cls + '"><strong>' + title + '</strong></div>';
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
    content += '<div class="label diff-title">' + icon('bar-chart', 16) + ' Run Comparison</div>';
    content += _buildDiffSummaryCards(newFails, newPasses, flakyCount);
    if (newFails > 0) content += _buildDiffSection(diff.newFailures, 'New failures:', 'failed', 'failed');
    if (newPasses > 0) content += _buildDiffSection(diff.newPasses, 'Fixed (now passing):', 'passed', 'passed', true);
    if (flakyCount > 0) content += _buildDiffSection(diff.flaky, 'Flaky (status changed):', 'flaky', 'skip', true);

    return Card({
        variant: 'default',
        children: content,
    });
}
