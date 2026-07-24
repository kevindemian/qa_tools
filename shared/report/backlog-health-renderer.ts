/**
 * Backlog Health Dashboard — HTML rendering layer.
 *
 * Receives computed BacklogHealthResult and produces HTML fragment.
 * This module has NO business logic — only presentation.
 *
 * @module backlog-health-renderer
 */

import { sanitizeHtml } from '../escape.js';
import { Card, MetricCard, MetricGrid, Badge } from '../primitives/index.js';
import type { BacklogHealthResult, BacklogHealthIssue } from './backlog-health.js';

const SUMMARY_TRUNCATE_LENGTH = 80;
const SCORE_THRESHOLD_SUCCESS = 80;
const SCORE_THRESHOLD_WARN = 50;

export function generateBacklogHealthHtml(result: BacklogHealthResult): string {
    const summaryCards = MetricGrid({
        children:
            MetricCard({
                label: 'Backlog Score',
                value: result.noData ? 'N/A' : String(result.score) + '%',
                severity: (() => {
                    if (result.noData) return 'warn';
                    if (result.score >= SCORE_THRESHOLD_SUCCESS) return 'success';
                    if (result.score >= SCORE_THRESHOLD_WARN) return 'warn';
                    return 'error';
                })(),
            }) +
            MetricCard({
                label: 'Unassigned',
                value: String(result.unassignedIssues.length),
                severity: result.unassignedIssues.length > 0 ? 'warn' : 'success',
            }) +
            MetricCard({
                label: 'Stale Issues',
                value: String(result.staleIssues.length),
                severity: result.staleIssues.length > 0 ? 'warn' : 'success',
            }) +
            MetricCard({
                label: 'Bugs Without Tests',
                value: String(result.bugsWithoutTests.length),
                severity: result.bugsWithoutTests.length > 0 ? 'error' : 'success',
            }),
    });

    let sectionsHtml = '';

    if (result.unassignedIssues.length > 0) {
        sectionsHtml += Card({
            title: 'Unassigned Issues (' + result.unassignedIssues.length + ')',
            variant: 'bordered',
            severity: 'warn',
            children: buildIssueListCapped(result.unassignedIssues, result.displayLimit),
        });
    }

    if (result.staleIssues.length > 0) {
        sectionsHtml += Card({
            title: 'Stale Issues (' + result.staleIssues.length + ')',
            variant: 'bordered',
            severity: 'warn',
            children: buildIssueListCapped(result.staleIssues, result.displayLimit),
        });
    }

    if (result.bugsWithoutTests.length > 0) {
        sectionsHtml += Card({
            title: 'Bugs Without Tests (' + result.bugsWithoutTests.length + ')',
            variant: 'bordered',
            severity: 'error',
            children: buildIssueListCapped(result.bugsWithoutTests, result.displayLimit),
        });
    }

    if (result.densityByEpic.length > 0) {
        sectionsHtml += Card({
            title: 'Density by Epic',
            children: buildDensityTable(result.densityByEpic),
        });
    }

    return '<div id="backlog-health">' + summaryCards + sectionsHtml + '</div>';
}

function buildIssueListCapped(issues: BacklogHealthIssue[], limit?: number): string {
    const hasLimit = typeof limit === 'number' && limit >= 0;
    const visible = hasLimit ? issues.slice(0, limit) : issues;
    let html = '<div style="max-height:300px;overflow-y:auto">';
    for (const issue of visible) {
        html += '<div style="padding:6px 0;border-bottom:1px solid var(--color-border-subtle);font-size:0.85rem">';
        html += '<span style="font-weight:600">' + sanitizeHtml(issue.key) + '</span>';
        html +=
            ' <span style="color:var(--color-text-secondary)">' +
            sanitizeHtml(issue.summary.slice(0, SUMMARY_TRUNCATE_LENGTH)) +
            '</span>';
        html += ' ' + Badge({ variant: issue.type === 'Bug' ? 'fail' : 'warn', children: issue.type });
        html += '</div>';
    }
    if (hasLimit && issues.length > limit) {
        html +=
            '<div style="padding:6px 0;color:var(--color-text-secondary);font-size:0.8rem">' +
            'Showing first ' +
            String(limit) +
            ' of ' +
            String(issues.length) +
            ' issues.</div>';
    }
    html += '</div>';
    return html;
}

function buildDensityTable(density: Array<{ epic: string; bugCount: number; testCount: number }>): string {
    let html = '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:0.85rem">';
    html +=
        '<thead><tr>' +
        '<th style="padding:6px 8px;text-align:left;color:var(--color-text-secondary)">Epic</th>' +
        '<th style="padding:6px 8px;text-align:right;color:var(--color-text-secondary)">Bugs</th>' +
        '<th style="padding:6px 8px;text-align:right;color:var(--color-text-secondary)">Tests</th>' +
        '<th style="padding:6px 8px;text-align:right;color:var(--color-text-secondary)">Ratio</th>' +
        '</tr></thead><tbody>';
    for (const d of density) {
        const ratio = d.bugCount > 0 ? (d.testCount / d.bugCount).toFixed(1) : '\u2014';
        html += '<tr style="border-bottom:1px solid var(--color-border-subtle)">';
        html += '<td style="padding:6px 8px">' + sanitizeHtml(d.epic) + '</td>';
        html += '<td style="padding:6px 8px;text-align:right">' + d.bugCount + '</td>';
        html += '<td style="padding:6px 8px;text-align:right">' + d.testCount + '</td>';
        html += '<td style="padding:6px 8px;text-align:right">' + ratio + '</td>';
        html += '</tr>';
    }
    html += '</tbody></table></div>';
    return html;
}
