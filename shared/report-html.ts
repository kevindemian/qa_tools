/**
 * HTML report orchestrator — assembles all sections into a complete report page.
 *
 * Uses primitives and design tokens for consistent visual output.
 * This is the public API for generating HTML test reports.
 *
 * @module report-html
 */

import { rootLogger } from './logger';
import { sanitizeUrl } from './cli_base';
import { escapeHtml, statsFromTests } from './report-utils';
import type { FlatTest } from './result_parser';
import type { CoverageEpic, ReportOptions } from './report-types';
import { DEFAULT_TITLE } from './report-types';
import { buildCss } from './report-styles';
import { buildHtmlPage, buildErrorPage } from './html-factory';
import { buildToggleScript } from './report-scripts';
import { buildChartSection, buildTrendSection } from './report-chart';
import {
    buildSummaryCards,
    buildFailedSummary,
    buildLlmSection,
    buildQualityGate,
    buildFilterBar,
    buildTabs,
    buildTabContents,
    buildHierarchySidebar,
    buildTimeline,
} from './report-sections';
import { buildTestTable, precomputeCategories } from './report-table';
import { buildDiffComparisonSection } from './report-diff';
import Config from './config';
import { Card, MetricCard, Badge } from './primitives';
import { tokens } from './theme-tokens';

function healthColor(score: number): string {
    if (score >= 80) return tokens.color.chart.pass;
    if (score >= 50) return tokens.color.semantic.warn.light;
    return tokens.color.chart.fail;
}

function healthBg(score: number): string {
    if (score >= 80) return '#f0fdf4';
    if (score >= 50) return '#fefce8';
    return '#fef2f2';
}

function buildHealthSection(health: import('./types').HealthScoreResult): string {
    const qcIcon = health.qualityGate === 'pass' ? '✅' : '❌';
    const qcText = health.qualityGate === 'pass' ? 'Pass' : 'Fail';
    const qcColor = health.qualityGate === 'pass' ? 'var(--color-badge-pass-text)' : 'var(--color-badge-fail-text)';
    const qcBg = health.qualityGate === 'pass' ? 'var(--color-badge-pass-bg)' : 'var(--color-badge-fail-bg)';
    const overallColor = healthColor(health.overall);
    const dims = health.dimensions;
    const dimEntries: Array<{ label: string; score: number; status: string }> = [
        { label: 'Pass Rate', score: dims.passRate.score, status: dims.passRate.status },
        { label: 'Flaky Rate', score: dims.flakyRate.score, status: dims.flakyRate.status },
        { label: 'Coverage', score: dims.coverage.score, status: dims.coverage.status },
        { label: 'Suite Speed', score: dims.suiteSpeed.score, status: dims.suiteSpeed.status },
    ];

    let dimCards = '';
    for (const d of dimEntries) {
        const barColor = healthColor(d.score);
        const bg = healthBg(d.score);
        const icon = d.status === 'pass' ? '✅' : '❌';
        dimCards += `<div style="background:${bg};border-radius:6px;padding:10px 12px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
                <span style="font-size:0.75rem;color:var(--color-text-secondary)">${d.label}</span>
                <span style="font-size:0.8rem;font-weight:700;color:${barColor}">${d.score} ${icon}</span>
            </div>
            <div style="height:6px;background:var(--color-border-subtle);border-radius:3px;overflow:hidden">
                <div style="height:100%;width:${d.score}%;background:${barColor};border-radius:3px;transition:width 0.3s"></div>
            </div>
        </div>`;
    }

    const html = Card({
        variant: 'default',
        children:
            `<div class="label" style="margin-bottom:12px;font-size:1rem">📊 Test Suite Health</div>` +
            `<div style="display:flex;gap:16px;flex-wrap:wrap;align-items:center;margin-bottom:16px">` +
            `<div style="text-align:center;min-width:100px"><div style="font-size:2.5rem;font-weight:800;color:${overallColor}">${health.overall}</div>` +
            `<div style="font-size:0.8rem;color:var(--color-text-muted);text-transform:capitalize">${health.grade.replace(/_/g, ' ')}</div></div>` +
            `<span style="padding:4px 12px;border-radius:9999px;font-size:0.85rem;font-weight:600;background:${qcBg};color:${qcColor}">${qcIcon} Quality Gate: ${qcText}</span>` +
            `<span style="font-size:0.75rem;color:var(--color-text-muted)">${health.runCount} run(s) · ${health.timestamp.slice(0, 10)}</span>` +
            `</div>` +
            `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px">${dimCards}</div>`,
    });
    return html;
}

export function generateHtmlReport(tests: FlatTest[], options?: ReportOptions): string {
    return generateReportWithFallback(tests, options);
}

function _buildFlakinessLink(options: ReportOptions): string {
    if (!options.flakinessDashboardUrl || !options.flakinessMap || Object.keys(options.flakinessMap).length === 0)
        return '';
    return (
        '<div style="text-align:center;margin-top:12px">' +
        '<a href="' +
        escapeHtml(options.flakinessDashboardUrl) +
        '" style="display:inline-block;padding:8px 16px;background:var(--color-surface-elevated);border-radius:6px;color:var(--color-text-primary);text-decoration:none;font-size:0.85rem" target="_blank" rel="noopener">📊 View Flakiness Dashboard</a></div>'
    );
}

function _buildReportFooter(options?: ReportOptions): string {
    const generatedAt = options?.generatedAt || new Date().toISOString();
    const source = options?.source || Config.get('CI_JOB_NAME') || Config.get('GITHUB_WORKFLOW') || '';
    const ciUrl = options?.ciUrl || Config.get('CI_JOB_URL') || Config.get('GITHUB_SERVER_URL') || '';
    const branch = options?.branch || Config.get('CI_COMMIT_BRANCH') || Config.get('GITHUB_REF_NAME') || '';
    let text = 'Generated by QA Tools · ' + generatedAt.slice(0, 10);
    if (source) text += ' · ' + escapeHtml(source);
    if (branch) {
        if (ciUrl)
            text +=
                ' · <a href="' +
                escapeHtml(sanitizeUrl(ciUrl)) +
                '" style="color:inherit">' +
                escapeHtml(branch) +
                '</a>';
        else text += ' · ' + escapeHtml(branch);
    }
    return text;
}

function _buildTestTableSection(
    tests: FlatTest[],
    categories: Record<string, string>,
    options?: ReportOptions,
): string {
    const runs = options?.runs;
    if (runs && runs.length > 1) {
        return (
            buildTabs(runs) +
            buildTabContents(runs, categories, options?.testHistory, options?.knownIssues, options?.flakinessMap)
        );
    }
    const hasSidebar = tests.some((t) => t.fullTitle && t.fullTitle.indexOf(' > ') !== -1);
    let html = '';
    if (hasSidebar) {
        html += '<div style="display:flex;gap:0">' + buildHierarchySidebar(tests) + '<div style="flex:1;min-width:0">';
    }
    html += buildFilterBar();
    html += buildTestTable(tests, categories, options?.testHistory, options?.knownIssues, options?.flakinessMap);
    if (hasSidebar) html += '</div></div>';
    return html;
}

export function generateReportWithFallback(tests: FlatTest[], options?: ReportOptions): string {
    try {
        const stats = statsFromTests(tests);
        const title = options?.title || DEFAULT_TITLE;
        const passRate = stats.total > 0 ? (stats.passed / stats.total) * 100 : 0;
        const categories = options?.testCategories || precomputeCategories(tests);

        let bodyContent = '<h1>' + title + '</h1>';
        bodyContent += buildSummaryCards(stats, passRate);
        bodyContent += buildFailedSummary(tests, stats);
        bodyContent += buildLlmSection(options || { title: '', includeChart: true });
        bodyContent += buildChartSection(stats, options?.includeChart !== false);
        bodyContent += buildTrendSection(options?.trends || []);
        if (options?.qualityGate !== undefined) bodyContent += buildQualityGate(passRate, options.qualityGate);
        if (options?.healthScore) bodyContent += buildHealthSection(options.healthScore);

        bodyContent += _buildTestTableSection(tests, categories, options);
        if (options?.diffComparison) bodyContent += buildDiffComparisonSection(options.diffComparison);
        bodyContent += _buildFlakinessLink(options || { title: '', includeChart: true });
        bodyContent += buildTimeline(tests);

        return buildHtmlPage({
            title,
            styles: buildCss(),
            theme: options?.theme || 'system',
            bodyContent,
            footer: _buildReportFooter(options),
            bodyEnd: buildToggleScript(),
        });
    } catch (err) {
        rootLogger.error('Failed to generate HTML report: ' + (err as Error).message);
        return buildErrorPage('Error generating report', 'Error generating report');
    }
}

function _coverageStatusClass(status: string): string {
    return status === 'Done' || status === 'Closed'
        ? 'status-passed'
        : status === 'In Progress'
          ? 'status-skipped'
          : 'status-failed';
}

function _renderEpicRow(e: CoverageEpic, closePct: string): string {
    let issues = '';
    for (const issue of e.issues) {
        issues +=
            '<div style="display:flex;gap:8px;align-items:center;padding:4px 0;font-size:0.85rem">' +
            Badge({
                variant:
                    _coverageStatusClass(issue.status) === 'status-passed'
                        ? 'pass'
                        : _coverageStatusClass(issue.status) === 'status-failed'
                          ? 'fail'
                          : 'skip',
                children: issue.status,
            }) +
            '<span><strong>' +
            escapeHtml(issue.key) +
            '</strong></span>' +
            '<span>' +
            escapeHtml(issue.summary) +
            '</span>' +
            '<span style="font-size:0.7rem;color:var(--color-text-muted)">' +
            escapeHtml(issue.type) +
            '</span></div>';
    }
    return Card({
        variant: 'default',
        children:
            `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">` +
            `<div><span style="font-weight:700">${escapeHtml(e.key)}</span> &mdash; ${escapeHtml(e.summary)}</div>` +
            Badge({ variant: 'info', children: `${e.issues.length} issues, ${closePct}% closed` }) +
            `</div>${issues}`,
    });
}

export function generateCoverageHtml(epics: CoverageEpic[], title?: string): string {
    try {
        const reportTitle = title || 'Coverage Report';
        const totalIssues = epics.reduce((sum, e) => sum + e.issues.length, 0);
        const closedIssues = epics.reduce(
            (sum, e) => sum + e.issues.filter((i) => i.status === 'Done' || i.status === 'Closed').length,
            0,
        );
        const closePct = totalIssues > 0 ? ((closedIssues / totalIssues) * 100).toFixed(1) : '0.0';

        let epicRows = '';
        for (const e of epics) epicRows += _renderEpicRow(e, closePct);

        const coverageBody =
            '<h1>' +
            reportTitle +
            '</h1>' +
            '<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:20px">' +
            MetricCard({ label: 'Total Epics', value: String(epics.length) }) +
            MetricCard({ label: 'Total Issues', value: String(totalIssues) }) +
            MetricCard({ label: 'Closed', value: String(closedIssues), severity: 'success' }) +
            MetricCard({ label: 'Coverage', value: closePct + '%' }) +
            '</div>' +
            epicRows;

        return buildHtmlPage({
            title: reportTitle,
            styles: buildCss(),
            bodyContent: coverageBody,
            footer: 'Generated by QA Tools',
        });
    } catch (err) {
        rootLogger.error('Failed to generate coverage HTML: ' + (err as Error).message);
        return buildErrorPage('Error generating coverage report', 'Error generating coverage report');
    }
}
