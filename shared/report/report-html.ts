/**
 * HTML report orchestrator — assembles all sections into a complete report page.
 *
 * Uses primitives and design tokens for consistent visual output.
 * This is the public API for generating HTML test reports.
 *
 * @module report-html
 */

import { rootLogger } from '../logger.js';
import { sanitizeUrl } from '../ui/cli_base.js';
import { escapeHtml, statsFromMetricsRun } from './report-utils.js';
import { icon } from '../icons.js';
import type { FlatTest } from '../result_parser.js';
import type { ReportOptions } from './report-types.js';
import { DEFAULT_TITLE } from './report-types.js';
import { buildCss } from './report-styles.js';
import { buildHtmlPage, buildErrorPage } from './html-factory.js';
import { buildToggleScript } from './report-scripts.js';
import { buildChartSection, buildTrendSection } from './report-chart.js';

import {
    buildSummaryCards,
    buildFailedSummary,
    buildLlmSection,
    buildQualityGateSection,
    buildFilterBar,
    buildTabs,
    buildTabContents,
    buildHierarchySidebar,
    buildTimeline,
    buildHealthSection,
} from './report-sections.js';
import { buildTestTable } from './report-table.js';
import { buildDiffComparisonSection } from './report-diff.js';
import Config from '../config-accessor.js';
import type { QualityGateResult, QualityGateStatus } from '../quality/quality-gate.js';

/**
 * Builds a `QualityGateResult` (SSOT gate contract) from a single pass-rate gate.
 * Rule 24/25: non-finite pass-rate/threshold surface as `unknown`/`N/A` — never a
 * silent `pass`/`fail` based on a corrupt numeric input.
 */
function toQualityGateResult(passRate: number, threshold: number): QualityGateResult {
    const passRateValid = Number.isFinite(passRate);
    const thresholdValid = Number.isFinite(threshold);
    const valid = passRateValid && thresholdValid;
    const passed = valid && passRate >= threshold;
    let status: QualityGateStatus;
    if (!valid) {
        status = 'unknown';
    } else if (passed) {
        status = 'pass';
    } else {
        status = 'fail';
    }

    return {
        overall: status,
        score: passRateValid ? passRate : Number.NaN,
        checks: [
            {
                name: 'pass-rate',
                status,
                score: passRateValid ? passRate : Number.NaN,
                threshold: thresholdValid ? threshold : Number.NaN,
                details: valid
                    ? `Pass rate ${passRate.toFixed(1)}% against configured threshold of ${threshold}%.`
                    : 'Pass rate or threshold is non-finite. Correct the gate inputs at origin.',
            },
        ],
    };
}

export function generateHtmlReport(_tests: FlatTest[], options?: ReportOptions): string {
    try {
        const computed = options?.computed;
        if (!computed) {
            const msg = 'DataHub precomputed data (computed) is required for HTML report generation.';
            rootLogger.error(msg);
            return buildErrorPage('Error generating report', msg);
        }
        const precomputedRun = computed.metricsRuns?.[0];
        if (!precomputedRun) {
            const msg = 'DataHub precomputed data (metricsRuns) is required for HTML report generation.';
            rootLogger.error(msg);
            return buildErrorPage('Error generating report', msg);
        }
        const stats = statsFromMetricsRun(precomputedRun);
        if (!Number.isFinite(computed.passRate)) {
            throw new Error(
                `computed.passRate inválido (${String(computed.passRate)}) — DataHub.computed.passRate é obrigatório (SSOT).`,
            );
        }
        const passRate = computed.passRate;
        const title = options.title || DEFAULT_TITLE;
        const categories = computed.failureClassifications ?? {};
        const timestamp = options.generatedAt || new Date().toISOString();
        const dashboardId = options.dashboardId || 'coverage-report';
        const trends = computed.metricsTrends ?? [];

        let bodyContent = '<h1>' + title + '</h1>';
        bodyContent += `<div data-part="timestamp" data-dashboard="${escapeHtml(dashboardId)}">${timestamp}</div>`;
        bodyContent += `<div data-section="summary">`;
        bodyContent += buildSummaryCards(stats, passRate, options.passRateThreshold);
        bodyContent += `</div>`;
        bodyContent += `<div data-section="failed-summary">`;
        bodyContent += buildFailedSummary(precomputedRun.tests, stats);
        bodyContent += `</div>`;
        bodyContent += `<div data-section="llm-analysis">`;
        bodyContent += buildLlmSection(options);
        bodyContent += `</div>`;
        bodyContent += `<div data-section="charts">`;
        bodyContent += buildChartSection(stats, options.includeChart !== false);
        bodyContent += `</div>`;
        bodyContent += `<div data-section="trends">`;
        bodyContent += buildTrendSection(trends);
        bodyContent += `</div>`;
        if (options.qualityGate !== undefined) {
            bodyContent += buildQualityGateSection(toQualityGateResult(passRate, options.qualityGate));
        }
        if (options.healthScore) {
            bodyContent += `<div data-section="health">`;
            bodyContent += buildHealthSection(options.healthScore);
            bodyContent += `</div>`;
        }

        bodyContent += `<div data-section="test-table">`;
        bodyContent += _buildTestTableSection(precomputedRun.tests, categories, options);
        bodyContent += `</div>`;
        if (options.diffComparison) {
            bodyContent += `<div data-section="diff-comparison">`;
            bodyContent += buildDiffComparisonSection(options.diffComparison);
            bodyContent += `</div>`;
        }
        bodyContent += `<div data-section="flakiness-link">`;
        bodyContent += _buildFlakinessLink(options);
        bodyContent += `</div>`;
        bodyContent += `<div data-section="timeline">`;
        bodyContent += buildTimeline(precomputedRun.tests, computed);
        bodyContent += `</div>`;

        return buildHtmlPage({
            title,
            styles: buildCss(),
            theme: options.theme || 'system',
            headExtra: _buildProjectMeta(),
            bodyContent,
            footer: _buildReportFooter(options),
            bodyEnd: buildToggleScript(),
        });
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        rootLogger.error('Failed to generate HTML report: ' + msg);
        return buildErrorPage('Error generating report', 'Error generating report');
    }
}

function _buildFlakinessLink(options: ReportOptions): string {
    // legitimate: optional header chrome link — absent URL/map => no link; EmptyState is a section block, invalid in the header strip (Rule 25.3 intent).
    if (!options.flakinessDashboardUrl || !options.flakinessMap || Object.keys(options.flakinessMap).length === 0)
        return '';
    return (
        '<div class="timestamp-wrapper">' +
        '<a href="' +
        escapeHtml(options.flakinessDashboardUrl) +
        '" class="timestamp-link" target="_blank" rel="noopener">' +
        icon('bar-chart', 16) +
        ' View Flakiness Dashboard</a></div>'
    );
}

function _buildProjectMeta(): string {
    const projectName = Config.get('qaCurrentProject') || '';
    // legitimate: <head> <meta> tag — no project name => no meta emitted; EmptyState (a section block) is invalid inside <head> (DOM-level, Rule 25.3 intent).
    if (!projectName) return '';
    return `<meta name="qa-project" content="${escapeHtml(projectName)}">`;
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
                '" class="timestamp-icon">' +
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
        return buildTabs(runs) + buildTabContents(runs, categories, options.testHistory, options.flakinessMap);
    }
    const hasSidebar = tests.some((t) => t.fullTitle && t.fullTitle.indexOf(' > ') !== -1);
    let html = '';
    if (hasSidebar) {
        html += '<div class="page-grid">' + buildHierarchySidebar(tests) + '<div class="page-grid-sidebar">';
    }
    html += buildFilterBar();
    html += buildTestTable(tests, categories, options?.testHistory, options?.flakinessMap);
    if (hasSidebar) html += '</div></div>';
    return html;
}
