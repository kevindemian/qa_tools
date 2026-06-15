/**
 * Self-contained HTML report for coverage gap analysis.
 * Uses primitives and design tokens for consistent rendering.
 *
 * Summary cards, per-epic progress bars, hierarchy tree, gaps table, quality gate section.
 * Dark mode support via CSS custom properties.
 *
 * @module generate-coverage-gap-html
 */

import type { CoverageGapResult, CoverageHierarchyNode } from './types.js';
import { rootLogger } from './logger.js';
import { sanitizeHtml } from './sanitize.js';
import { formatDateISO } from './date-utils.js';
import { buildHtmlPage, buildErrorPage } from './html-factory.js';
import { buildCss } from './report-styles.js';
import {
    Card,
    MetricCard,
    MetricGrid,
    Badge,
    ProgressBar,
    SearchInput,
    Button,
    FilterBar,
} from './primitives/index.js';
import { tokens } from './theme-tokens.js';

function buildSummaryCards(result: CoverageGapResult): string {
    const t = result.totals;
    return MetricGrid({
        children:
            MetricCard({ label: 'Total Issues', value: String(t.totalIssues) }) +
            MetricCard({ label: 'Covered', value: String(t.covered), severity: 'success' }) +
            MetricCard({ label: 'Gaps', value: String(t.gap), severity: 'error' }) +
            MetricCard({
                label: 'Weighted Coverage',
                value: t.weightedCoveragePct + '%',
                severity: t.weightedCoveragePct >= 50 ? 'success' : 'error',
            }) +
            MetricCard({
                label: 'Raw Coverage',
                value: t.rawCoveragePct + '%',
                severity: t.rawCoveragePct >= 50 ? 'success' : 'error',
            }),
    });
}

function buildQualityGateSection(result: CoverageGapResult): string {
    const gc = result.gateConfig;
    if (gc.failingEpics.length === 0) {
        return Card({
            variant: 'bordered',
            severity: 'success',
            children:
                `<div class="label" style="color:var(--color-badge-pass-text);margin-bottom:4px">Quality Gate</div>` +
                `<div style="font-size:1rem;font-weight:600;color:var(--color-badge-pass-text)">All epics pass (min ${gc.minCoveragePct}%)</div>`,
        });
    }
    return Card({
        variant: 'bordered',
        severity: 'error',
        children:
            `<div class="label" style="color:var(--color-badge-fail-text);margin-bottom:4px">Quality Gate</div>` +
            `<div style="font-size:1rem;font-weight:600;color:var(--color-badge-fail-text)">${gc.failingEpics.length} epic(s) below ${gc.minCoveragePct}% threshold</div>` +
            `<ul style="margin:8px 0 0;font-size:0.85rem">${gc.failingEpics.map((k) => '<li style="color:var(--color-badge-fail-text)">' + sanitizeHtml(k) + ' (' + sanitizeHtml(result.byEpic[k]?.rawPct + '%' || '') + ')</li>').join('')}</ul>`,
    });
}

function buildEpicCards(result: CoverageGapResult): string {
    let html =
        '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px;margin-bottom:20px">';
    for (const [key, epic] of Object.entries(result.byEpic)) {
        if (key === '__no_epic__') continue;
        const color = epic.weightedPct >= 50 ? tokens.color.chart.pass : tokens.color.chart.fail;
        const badge = epic.gatePass
            ? Badge({ variant: 'pass', children: 'PASS' })
            : Badge({ variant: 'fail', children: 'FAIL' });
        html += Card({
            variant: 'default',
            children:
                `<div style="font-weight:600;font-size:0.9rem;margin-bottom:4px">${sanitizeHtml(key)} ${badge}</div>` +
                `<div style="font-size:0.75rem;color:var(--color-text-muted);margin-bottom:8px">${sanitizeHtml(epic.epicSummary)}</div>` +
                `<div style="display:flex;justify-content:space-between;font-size:0.8rem;margin-bottom:4px">` +
                `<span>${epic.covered}/${epic.total} covered</span>` +
                `<span>Weighted: ${epic.weightedPct}%</span></div>` +
                ProgressBar({ value: epic.weightedPct, color, showLabel: false }),
        });
    }
    html += '</div>';
    return html;
}

function buildHierarchyHtml(nodes: CoverageHierarchyNode[], depth = 0): string {
    if (nodes.length === 0) return '<p style="font-size:0.85rem;color:var(--color-text-muted)">No hierarchy data</p>';
    let html = '<div class="tree">';
    for (const node of nodes) {
        const color = node.coveragePct >= 50 ? tokens.color.chart.pass : tokens.color.chart.fail;
        const hasChildren = node.children.length > 0;
        html += '<div class="tree-node">';
        if (hasChildren) {
            html += '<span class="tree-toggle" onclick="toggleTree(this)">▶</span>';
        }
        html +=
            '<strong>' +
            sanitizeHtml(node.key) +
            '</strong> <span style="color:var(--color-text-muted);font-size:0.8rem">' +
            sanitizeHtml(node.summary.slice(0, 60)) +
            '</span>';
        html +=
            '<span style="float:right;font-size:0.8rem;color:' +
            color +
            ';font-weight:600">' +
            node.coveragePct +
            '% (' +
            node.coveredIssues +
            '/' +
            node.totalIssues +
            ')</span>';
        if (hasChildren) {
            html += '<div class="tree-children" style="display:none">';
            html += buildHierarchyHtml(node.children, depth + 1);
            html += '</div>';
        }
        html += '</div>';
    }
    html += '</div>';
    return html;
}

function buildGapsTable(result: CoverageGapResult): string {
    const gaps = result.items.filter((i) => !i.hasTest);
    if (gaps.length === 0) {
        return '<p style="color:var(--color-success);font-weight:600">No coverage gaps found</p>';
    }
    let html = FilterBar({
        children:
            SearchInput({ placeholder: 'Filter gaps...', onInput: 'filterGaps()', id: 'gapSearchInput' }) +
            Button({ children: '🌓', onClick: 'toggleTheme()', variant: 'ghost' }),
    });
    html +=
        '<div style="overflow-x:auto;border-radius:8px;box-shadow:0 1px 3px rgba(0,0,0,0.1)"><table><thead><tr><th>Key</th><th>Summary</th><th>Type</th><th>Priority</th><th>Weight</th><th>Epic</th><th>Action</th></tr></thead><tbody>';
    for (const item of gaps) {
        html += '<tr class="gap-row" style="border-bottom:1px solid var(--color-border-subtle)">';
        html += '<td><strong>' + sanitizeHtml(item.issueKey) + '</strong></td>';
        html += '<td>' + sanitizeHtml(item.summary.slice(0, 80)) + '</td>';
        html += '<td>' + sanitizeHtml(item.type) + '</td>';
        html += '<td>' + sanitizeHtml(item.priority) + '</td>';
        html += '<td>' + item.coverageWeight + '</td>';
        html += '<td>' + (item.epicKey ? sanitizeHtml(item.epicKey) : '—') + '</td>';
        html += '<td>' + Badge({ variant: 'fail', children: 'GAP' }) + '</td>';
        html += '</tr>';
    }
    html += '</tbody></table></div>';
    return html;
}

function buildToggleScript(): string {
    return `<script>
function toggleTree(el) {
    var parent = el.parentElement;
    if (!parent) return;
    var children = parent.querySelector('.tree-children');
    if (children) {
        var hidden = children.style.display === 'none';
        children.style.display = hidden ? '' : 'none';
        el.textContent = hidden ? '▼' : '▶';
    }
}
function filterGaps() {
    var q = document.getElementById('gapSearchInput').value.toLowerCase();
    document.querySelectorAll('.gap-row').forEach(function(r) {
        r.style.display = r.textContent.toLowerCase().includes(q) ? '' : 'none';
    });
}
</script>`;
}

export function generateCoverageGapHtml(result: CoverageGapResult, title?: string, theme?: string): string {
    try {
        const reportTitle = title || 'Coverage Gap Analysis';
        const bodyContent =
            '<h1>' +
            sanitizeHtml(reportTitle) +
            '</h1>' +
            buildSummaryCards(result) +
            buildQualityGateSection(result) +
            '<h2>Coverage by Epic</h2>' +
            buildEpicCards(result) +
            '<h2>Hierarchy</h2>' +
            buildHierarchyHtml(result.hierarchy) +
            '<h2>Coverage Gaps (' +
            result.totals.gap +
            ')</h2>' +
            buildGapsTable(result);
        return buildHtmlPage({
            title: reportTitle,
            styles: buildCss(),
            theme: theme || 'system',
            bodyContent,
            footer: 'Generated by QA Tools · ' + formatDateISO(),
            bodyEnd: buildToggleScript(),
        });
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        rootLogger.error('Failed to generate coverage gap HTML: ' + msg);
        return buildErrorPage('Error generating coverage gap report', 'Error generating coverage gap report');
    }
}
