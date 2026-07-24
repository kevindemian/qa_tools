/**
 * AI vs Manual Comparison Dashboard — HTML rendering layer.
 *
 * Receives computed AiComparisonResult and produces a complete HTML page.
 * This module has NO business logic — only presentation.
 *
 * @module ai-comparison-renderer
 */

import { sanitizeHtml } from '../escape.js';
import { buildHtmlPage, buildErrorPage } from './html-factory.js';
import { buildCss } from './report-styles.js';
import { rootLogger } from '../logger.js';
import {
    MetricCard,
    MetricGrid,
    Badge,
    DataTable,
    Section,
    EmptyState,
    RecommendedActions,
} from '../primitives/index.js';
import type { TableColumn, TableRow } from '../primitives/index.js';
import type { AiComparisonResult } from './ai-comparison.js';

function buildComparisonCards(result: AiComparisonResult): string {
    return Section({
        dataSection: 'comparison',
        title: 'Comparison Overview',
        children: MetricGrid({
            children:
                MetricCard({ label: 'AI Pass Rate', value: `${result.aiPassRate}%` }) +
                MetricCard({ label: 'Manual Pass Rate', value: `${result.manualPassRate}%` }) +
                MetricCard({ label: 'AI Avg Flakiness', value: result.aiFlakinessAvg.toFixed(3) }) +
                MetricCard({ label: 'Manual Avg Flakiness', value: result.manualFlakinessAvg.toFixed(3) }) +
                MetricCard({ label: 'AI Acceptance', value: result.aiAcceptanceRate.toFixed(2) }) +
                MetricCard({ label: 'Manual Acceptance', value: result.manualAcceptanceRate.toFixed(2) }),
        }),
    });
}

function buildAdvantageSection(result: AiComparisonResult): string {
    let badgeHtml: string;
    let description: string;
    let severity: 'pass' | 'fail' | 'info' | 'default';

    if (result.aiTotal === 0 || result.manualTotal === 0) {
        badgeHtml = Badge({ variant: 'default', children: 'N/A' });
        description = 'Both AI and manual test data required for comparison.';
        severity = 'default';
    } else if (result.aiAdvantage === 'pass_rate') {
        badgeHtml = Badge({ variant: 'pass', children: 'Pass Rate' });
        description = `AI-generated tests pass at a higher rate (${result.aiPassRate}% vs ${result.manualPassRate}%).`;
        severity = 'pass';
    } else if (result.aiAdvantage === 'flakiness') {
        badgeHtml = Badge({ variant: 'info', children: 'Flakiness' });
        description = `AI-generated tests are less flaky (${result.aiFlakinessAvg.toFixed(3)} vs ${result.manualFlakinessAvg.toFixed(3)}).`;
        severity = 'info';
    } else {
        badgeHtml = Badge({ variant: 'default', children: 'None' });
        description = 'AI-generated tests show no clear advantage over manual tests.';
        severity = 'default';
    }

    return Section({
        dataSection: 'advantage',
        title: 'AI Advantage',
        children: `<div data-part="advantage" data-severity="${severity}">${badgeHtml} — ${sanitizeHtml(description)}</div>`,
    });
}

function buildVersionTable(result: AiComparisonResult): string {
    if (result.byVersion.length === 0) return '';

    const columns: TableColumn[] = [
        { key: 'version', label: 'Prompt Version' },
        { key: 'count', label: 'Tests', align: 'right' },
        { key: 'passRate', label: 'Pass Rate', align: 'right' },
    ];

    const rows: TableRow[] = result.byVersion.map((v) => ({
        key: sanitizeHtml(v.version),
        cells: {
            version: sanitizeHtml(v.version),
            count: String(v.count),
            passRate: `${v.passRate}%`,
        },
    }));

    return Section({
        dataSection: 'versions',
        title: 'Version Breakdown',
        children: DataTable({ columns, rows }),
    });
}

function buildRecommendedActions(result: AiComparisonResult): string {
    const actions: Array<{ text: string; severity: 'error' | 'warn' | 'info' }> = [];

    if (result.aiAdvantage === 'pass_rate' && result.aiTotal > 0 && result.manualTotal > 0) {
        actions.push({
            text: `Prioritize AI test generation — AI tests show higher pass rate (${result.aiPassRate}% vs ${result.manualPassRate}%). Consider increasing AI-generated test coverage.`,
            severity: 'info',
        });
    }

    if (result.aiAdvantage === 'flakiness' && result.aiTotal > 0 && result.manualTotal > 0) {
        actions.push({
            text: `Replace flaky manual tests — AI tests are less flaky (${result.aiFlakinessAvg.toFixed(3)} vs ${result.manualFlakinessAvg.toFixed(3)}). Migrate critical manual tests to AI-generated equivalents.`,
            severity: 'info',
        });
    }

    if (result.aiAcceptanceRate < 0.5 && result.aiTotal > 0) {
        actions.push({
            text: `Improve AI test quality — AI acceptance rate is ${(result.aiAcceptanceRate * 100).toFixed(0)}%. Review prompt templates and test generation parameters.`,
            severity: 'warn',
        });
    }

    if (actions.length === 0) return '';

    return Section({
        dataSection: 'actions',
        title: 'Recommended Actions',
        children: RecommendedActions({ actions }),
    });
}

export function generateAiComparisonHtml(result: AiComparisonResult | null | undefined, title?: string): string {
    try {
        if (!result) {
            return buildErrorPage('Error generating dashboard', 'Invalid or missing AI comparison data');
        }
        const pageTitle = title || 'AI vs Manual Test Comparison';

        let bodyContent: string;

        if (result.aiTotal === 0 && result.manualTotal === 0) {
            bodyContent = EmptyState({
                title: 'No comparison data available.',
                description:
                    'The AI comparison dashboard requires both AI-generated and manual test data. Neither dataset was found.',
                action: 'Ensure your test pipeline includes both AI-generated and manual tests with pass/fail results and flakiness scores.',
            });
        } else {
            bodyContent =
                buildComparisonCards(result) +
                buildAdvantageSection(result) +
                buildVersionTable(result) +
                buildRecommendedActions(result);
        }

        return buildHtmlPage({
            title: pageTitle,
            styles: buildCss(),
            theme: 'system',
            bodyContent: wrapContainer(pageTitle, bodyContent),
            footer: `Generated by QA Tools — ${pageTitle}`,
        });
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        rootLogger.error(
            'Failed to generate AI comparison dashboard: ' +
                msg +
                '. Verify your AI test data format and ensure records contain required fields (testTitle, generatedBy, passed, flakiness).',
        );
        return buildErrorPage(
            'Error generating dashboard',
            'An error occurred while generating the AI comparison dashboard. Check the logs for details and ensure your AI test data is valid.',
        );
    }
}

function wrapContainer(pageTitle: string, children: string): string {
    return `<div data-component="container" data-dashboard="ai-comparison">
        <h1>${sanitizeHtml(pageTitle)}</h1>
        ${children}
    </div>`;
}
