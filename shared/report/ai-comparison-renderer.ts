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
import { icon } from '../icons.js';
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

const PASS_RATE_TARGET = 80;
const FLAKINESS_TARGET = 0.1;
const MIN_SAMPLE_SIZE = 30;

function buildComparisonCards(result: AiComparisonResult): string {
    // Calculate sample size warning
    const aiSampleSize = result.aiTotal;
    const manualSampleSize = result.manualTotal;
    const aiSampleSeverity = aiSampleSize < MIN_SAMPLE_SIZE ? 'warn' : 'default';
    const manualSampleSeverity = manualSampleSize < MIN_SAMPLE_SIZE ? 'warn' : 'default';

    const aiSampleWarning = aiSampleSize < MIN_SAMPLE_SIZE ? `data-part="sample-warning" data-severity="warn"` : '';
    const manualSampleWarning =
        manualSampleSize < MIN_SAMPLE_SIZE ? `data-part="sample-warning" data-severity="warn"` : '';

    return Section({
        dataSection: 'comparison',
        title: 'Comparison Overview',
        children: MetricGrid({
            children:
                MetricCard({
                    label: 'AI Pass Rate',
                    value: `${result.aiPassRate}%`,
                    target: `target: ${PASS_RATE_TARGET}%`,
                }) +
                MetricCard({
                    label: 'Manual Pass Rate',
                    value: `${result.manualPassRate}%`,
                    target: `target: ${PASS_RATE_TARGET}%`,
                }) +
                MetricCard({
                    label: 'AI Sample',
                    value: String(aiSampleSize),
                    severity: aiSampleSeverity,
                    ...(aiSampleWarning ? { sampleWarning: aiSampleWarning } : {}),
                }) +
                MetricCard({
                    label: 'Manual Sample',
                    value: String(manualSampleSize),
                    severity: manualSampleSeverity,
                    ...(manualSampleWarning ? { sampleWarning: manualSampleWarning } : {}),
                }) +
                MetricCard({
                    label: 'AI Flakiness',
                    value: result.aiFlakinessAvg.toFixed(3),
                    target: `target: <${FLAKINESS_TARGET}`,
                }) +
                MetricCard({
                    label: 'Manual Flakiness',
                    value: result.manualFlakinessAvg.toFixed(3),
                    target: `target: <${FLAKINESS_TARGET}`,
                }),
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

    // Add sample size context
    const sampleSizeWarning =
        result.aiTotal < MIN_SAMPLE_SIZE || result.manualTotal < MIN_SAMPLE_SIZE
            ? ` <span data-part="sample-warning" data-severity="warn">${icon('alert-triangle', 14)} Small sample size — results may not be statistically significant.</span>`
            : '';

    return Section({
        dataSection: 'advantage',
        title: 'Advantage Analysis',
        children: `<div data-part="advantage" data-severity="${severity}">${badgeHtml} — ${sanitizeHtml(description)}${sampleSizeWarning}</div>`,
    });
}

function buildVersionTable(result: AiComparisonResult): string {
    if (result.byVersion.length === 0) return '';

    // Sort by pass rate (best first)
    const sorted = [...result.byVersion].sort((a, b) => b.passRate - a.passRate);
    const bestVersion = sorted[0]?.version;

    const columns: TableColumn[] = [
        { key: 'version', label: 'Prompt Version' },
        { key: 'count', label: 'Tests', align: 'right' },
        { key: 'passRate', label: 'Pass Rate', align: 'right' },
        { key: 'quality', label: 'Quality' },
    ];

    const rows: TableRow[] = result.byVersion.map((v) => {
        let qualityBadge: string;
        if (v.version === bestVersion && v.passRate > PASS_RATE_TARGET) {
            qualityBadge = Badge({ variant: 'pass', children: 'Best' });
        } else if (v.passRate < 50) {
            qualityBadge = Badge({ variant: 'fail', children: 'Needs Work' });
        } else {
            qualityBadge = Badge({ variant: 'default', children: '—' });
        }

        return {
            key: sanitizeHtml(v.version),
            cells: {
                version: sanitizeHtml(v.version),
                count: String(v.count),
                passRate: `${v.passRate}%`,
                quality: qualityBadge,
            },
        };
    });

    return Section({
        dataSection: 'versions',
        title: 'Version Breakdown',
        children: DataTable({ columns, rows, caption: 'AI test results by prompt version — sorted by pass rate' }),
    });
}

function buildRecommendedActions(result: AiComparisonResult): string {
    const actions: Array<{ text: string; severity: 'error' | 'warn' | 'info' }> = [];

    // Action 1: AI advantage
    if (result.aiAdvantage === 'pass_rate' && result.aiTotal > 0 && result.manualTotal > 0) {
        actions.push({
            text: `Prioritize AI test generation — AI tests show higher pass rate (${result.aiPassRate}% vs ${result.manualPassRate}%). Consider increasing AI-generated test coverage.`,
            severity: 'info',
        });
    }

    // Action 2: Flakiness advantage
    if (result.aiAdvantage === 'flakiness' && result.aiTotal > 0 && result.manualTotal > 0) {
        actions.push({
            text: `Replace flaky manual tests — AI tests are less flaky (${result.aiFlakinessAvg.toFixed(3)} vs ${result.manualFlakinessAvg.toFixed(3)}). Migrate critical manual tests to AI-generated equivalents.`,
            severity: 'info',
        });
    }

    // Action 3: Low AI acceptance rate
    if (result.aiAcceptanceRate < 0.5 && result.aiTotal > 0) {
        actions.push({
            text: `Improve AI test quality — AI acceptance rate is ${(result.aiAcceptanceRate * 100).toFixed(0)}%. Review prompt templates and test generation parameters.`,
            severity: 'warn',
        });
    }

    // Action 4: Sample size warning
    if (result.aiTotal < MIN_SAMPLE_SIZE || result.manualTotal < MIN_SAMPLE_SIZE) {
        actions.push({
            text: `Small sample size detected — AI: ${result.aiTotal} tests, Manual: ${result.manualTotal} tests. Results may not be statistically significant. Increase sample size for reliable comparison.`,
            severity: 'warn',
        });
    }

    // Action 5: Best version recommendation
    if (result.byVersion.length > 1) {
        const sorted = [...result.byVersion].sort((a, b) => b.passRate - a.passRate);
        const best = sorted[0];
        if (best && best.passRate > PASS_RATE_TARGET) {
            actions.push({
                text: `Best performing version: "${sanitizeHtml(best.version)}" with ${best.passRate}% pass rate. Consider reusing for new tests.`,
                severity: 'info',
            });
        }
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
            bodyContent: wrapContainer(pageTitle, bodyContent, result.timestamp),
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

function wrapContainer(pageTitle: string, children: string, timestamp: string): string {
    return `<div data-component="container" data-dashboard="ai-comparison">
        <h1>${sanitizeHtml(pageTitle)}</h1>
        <div data-part="timestamp">${sanitizeHtml(timestamp)}</div>
        ${children}
    </div>`;
}
