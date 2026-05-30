import { rootLogger } from './logger';
import { sanitizeUrl } from './cli_base';
import { escapeHtml, statsFromTests } from './report-utils';
import type { FlatTest } from './result_parser';
import type { CoverageEpic, ReportOptions } from './report-types';
import { DEFAULT_TITLE } from './report-types';
import { buildCss, buildThemeScript } from './report-styles';
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
    buildTestTable,
    precomputeCategories,
} from './report-sections';
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

export function generateReportWithFallback(tests: FlatTest[], options?: ReportOptions): string {
    try {
        const stats = statsFromTests(tests);
        const title = options?.title || DEFAULT_TITLE;
        const passRate = stats.total > 0 ? (stats.passed / stats.total) * 100 : 0;
        const categories = options?.testCategories || precomputeCategories(tests);

        let html =
            '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">';
        html += '<title>' + title + '</title><style>' + buildCss() + '</style>';
        html += buildThemeScript(options?.theme);
        html += '</head><body>';
        html += '<h1>' + title + '</h1>';
        html += buildSummaryCards(stats, passRate);
        html += buildFailedSummary(tests, stats);
        html += buildLlmSection(options || { title: '', includeChart: true });
        html += buildChartSection(stats, options?.includeChart !== false);
        html += buildTrendSection(options?.trends || []);
        if (options?.qualityGate !== undefined) {
            html += buildQualityGate(passRate, options.qualityGate);
        }
        if (options?.healthScore) {
            html += buildHealthSection(options.healthScore);
        }

        const runs = options?.runs;
        if (runs && runs.length > 1) {
            html += buildTabs(runs);
            html += buildTabContents(runs, categories, options?.testHistory, options?.knownIssues);
        } else {
            const hasSidebar = tests.some(function (t) {
                return t.fullTitle && t.fullTitle.indexOf(' > ') !== -1;
            });
            if (hasSidebar) {
                html += '<div style="display:flex;gap:0">';
                html += buildHierarchySidebar(tests);
                html += '<div style="flex:1;min-width:0">';
            }
            html += buildFilterBar();
            html += buildTestTable(tests, categories, options?.testHistory, options?.knownIssues);
            if (hasSidebar) {
                html += '</div></div>';
            }
        }

        html += buildTimeline(tests);
        html += buildToggleScript();

        const generatedAt = options?.generatedAt || new Date().toISOString();
        const source = options?.source || Config.get('CI_JOB_NAME') || Config.get('GITHUB_WORKFLOW') || '';
        const ciUrl = options?.ciUrl || Config.get('CI_JOB_URL') || Config.get('GITHUB_SERVER_URL') || '';
        const branch = options?.branch || Config.get('CI_COMMIT_BRANCH') || Config.get('GITHUB_REF_NAME') || '';

        let footer = '<div class="footer">Generated by QA Tools · ' + generatedAt.slice(0, 10);
        if (source) footer += ' · ' + escapeHtml(source);
        if (branch) {
            if (ciUrl)
                footer +=
                    ' · <a href="' +
                    escapeHtml(sanitizeUrl(ciUrl)) +
                    '" style="color:inherit">' +
                    escapeHtml(branch) +
                    '</a>';
            else footer += ' · ' + escapeHtml(branch);
        }
        footer += '</div>';

        html += footer;
        html += '</body></html>';

        return html;
    } catch (err) {
        rootLogger.error('Failed to generate HTML report: ' + (err as Error).message);
        return '<!DOCTYPE html><html><body><h1>Error generating report</h1></body></html>';
    }
}

export function generateCoverageHtml(epics: CoverageEpic[], title?: string): string {
    try {
        const reportTitle = title || 'Coverage Report';
        const totalIssues = epics.reduce(function (sum, e) {
            return sum + e.issues.length;
        }, 0);
        const closedIssues = epics.reduce(function (sum, e) {
            return (
                sum +
                e.issues.filter(function (i) {
                    return i.status === 'Done' || i.status === 'Closed';
                }).length
            );
        }, 0);
        const closePct = totalIssues > 0 ? ((closedIssues / totalIssues) * 100).toFixed(1) : '0.0';
        let epicRows = '';
        for (const e of epics) {
            epicRows += '<div class="card" style="margin-bottom:12px">';
            epicRows += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">';
            epicRows +=
                '<div><span style="font-weight:700">' +
                escapeHtml(e.key) +
                '</span> &mdash; ' +
                escapeHtml(e.summary) +
                '</div>';
            epicRows +=
                '<span class="status-badge" style="background:#e0e7ff;color:#3730a3">' +
                e.issues.length +
                ' issues, ' +
                closePct +
                '% closed</span>';
            epicRows += '</div>';
            for (const issue of e.issues) {
                const statusClass =
                    issue.status === 'Done' || issue.status === 'Closed'
                        ? 'status-passed'
                        : issue.status === 'In Progress'
                          ? 'status-skipped'
                          : 'status-failed';
                epicRows += '<div style="display:flex;gap:8px;align-items:center;padding:4px 0;font-size:0.85rem">';
                epicRows += '<span class="status-badge ' + statusClass + '">' + escapeHtml(issue.status) + '</span>';
                epicRows += '<span><strong>' + escapeHtml(issue.key) + '</strong></span>';
                epicRows += '<span>' + escapeHtml(issue.summary) + '</span>';
                epicRows += '<span style="font-size:0.7rem;color:#6b7280">' + escapeHtml(issue.type) + '</span>';
                epicRows += '</div>';
            }
            epicRows += '</div>';
        }
        return (
            '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">' +
            '<title>' +
            reportTitle +
            '</title>' +
            "<style>body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background: #f9fafb; color: #111827; }" +
            'h1 { font-size: 1.5rem; }' +
            '.card { background: #fff; border-radius: 8px; padding: 16px 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }' +
            '.status-badge { display: inline-block; padding: 2px 8px; border-radius: 9999px; font-size: 0.75rem; font-weight: 600; }' +
            '.status-passed { background: #dcfce7; color: #166534; }' +
            '.status-failed { background: #fecaca; color: #991b1b; }' +
            '.status-skipped { background: #fef9c3; color: #854d0e; }' +
            '.summary { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 20px; }' +
            '</style></head><body>' +
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
            epicRows +
            '<div class="footer" style="margin-top:16px;font-size:0.75rem;color:#4b5563;text-align:center">Generated by QA Tools</div>' +
            '</body></html>'
        );
    } catch (err) {
        rootLogger.error('Failed to generate coverage HTML: ' + (err as Error).message);
        return '<!DOCTYPE html><html><body><h1>Error generating coverage report</h1></body></html>';
    }
}
