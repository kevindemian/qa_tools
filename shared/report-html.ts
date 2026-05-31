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
        '" style="display:inline-block;padding:8px 16px;background:#f3f4f6;border-radius:6px;color:#374151;text-decoration:none;font-size:0.85rem" target="_blank">📊 View Flakiness Dashboard</a></div>'
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
    let html = '<div class="card" style="margin-bottom:12px">';
    html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">';
    html +=
        '<div><span style="font-weight:700">' +
        escapeHtml(e.key) +
        '</span> &mdash; ' +
        escapeHtml(e.summary) +
        '</div>';
    html +=
        '<span class="status-badge" style="background:#e0e7ff;color:#3730a3">' +
        e.issues.length +
        ' issues, ' +
        closePct +
        '% closed</span>';
    html += '</div>';
    for (const issue of e.issues) {
        html += '<div style="display:flex;gap:8px;align-items:center;padding:4px 0;font-size:0.85rem">';
        html +=
            '<span class="status-badge ' +
            _coverageStatusClass(issue.status) +
            '">' +
            escapeHtml(issue.status) +
            '</span>';
        html += '<span><strong>' + escapeHtml(issue.key) + '</strong></span>';
        html += '<span>' + escapeHtml(issue.summary) + '</span>';
        html += '<span style="font-size:0.7rem;color:#6b7280">' + escapeHtml(issue.type) + '</span></div>';
    }
    html += '</div>';
    return html;
}

const _COVERAGE_CSS =
    "body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background: #f9fafb; color: #111827; }" +
    'h1 { font-size: 1.5rem; }' +
    '.card { background: #fff; border-radius: 8px; padding: 16px 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }' +
    '.status-badge { display: inline-block; padding: 2px 8px; border-radius: 9999px; font-size: 0.75rem; font-weight: 600; }' +
    '.status-passed { background: #dcfce7; color: #166534; }' +
    '.status-failed { background: #fecaca; color: #991b1b; }' +
    '.status-skipped { background: #fef9c3; color: #854d0e; }' +
    '.summary { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 20px; }';

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
            epicRows;

        return buildHtmlPage({
            title: reportTitle,
            styles: _COVERAGE_CSS,
            bodyContent: coverageBody,
            footer: 'Generated by QA Tools',
        });
    } catch (err) {
        rootLogger.error('Failed to generate coverage HTML: ' + (err as Error).message);
        return buildErrorPage('Error generating coverage report', 'Error generating coverage report');
    }
}
