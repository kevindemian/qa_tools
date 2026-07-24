/**
 * Suite Optimization Report — HTML renderer.
 *
 * Extracted from suite-optimization.ts (compute) to separate concerns.
 * This module handles ONLY HTML generation; all business logic remains in suite-optimization.ts.
 *
 * @module suite-optimization-renderer
 */

import { sanitizeHtml } from '../escape.js';
import { buildHtmlPage, buildErrorPage } from '../report/html-factory.js';
import { Container, Section } from '../primitives/layout.js';
import { MetricCard, MetricGrid } from '../primitives/card.js';
import { Badge, SeverityBadge } from '../primitives/badge.js';
import { DataTable, type TableColumn, type TableRow } from '../primitives/table.js';
import { RecommendedActions } from '../primitives/index.js';
import { buildCss } from '../report/report-styles.js';
import { rootLogger } from '../logger.js';
import { extractErrorMessage } from '../ui/prompt-errors.js';
import type { OptimizationResult } from './suite-optimization.js';

function buildRecommendedActions(result: OptimizationResult): string {
    const actions: Array<{ severity: 'error' | 'warn' | 'info'; text: string }> = [];

    // Action 1: High impact tests
    const highImpact = result.optimizations.filter((e) => e.impact === 'high');
    if (highImpact.length > 0) {
        const topTests = highImpact
            .slice(0, 3)
            .map((e) => sanitizeHtml(e.testTitle))
            .join(', ');
        const moreText = highImpact.length > 3 ? ` and ${highImpact.length - 3} more` : '';
        actions.push({
            severity: 'error',
            text: `${highImpact.length} test(s) have high impact optimization opportunities. Prioritize: ${topTests}${moreText}.`,
        });
    }

    // Action 2: Quarantine candidates
    const quarantined = result.optimizations.filter((e) => e.action === 'quarantine');
    if (quarantined.length > 0) {
        actions.push({
            severity: 'warn',
            text: `${quarantined.length} test(s) recommended for quarantine due to high flakiness. Review and fix or remove.`,
        });
    }

    // Action 3: Potential savings
    if (result.potentialSavings > 60) {
        actions.push({
            severity: 'warn',
            text: `Potential savings of ${result.potentialSavings.toFixed(1)}s identified. Consider parallelization or splitting slow tests.`,
        });
    }

    if (actions.length === 0) {
        actions.push({
            severity: 'info',
            text: 'All tests are within acceptable thresholds. Continue monitoring.',
        });
    }

    return Section({
        dataSection: 'actions',
        title: 'Recommended Actions',
        children: RecommendedActions({ actions }),
    });
}

export function generateOptimizationHtml(result: OptimizationResult, title?: string): string {
    const pageTitle = title || 'Suite Optimization Report';
    const actionable = result.optimizations.filter((e) => e.action !== 'none');

    const customCss = [
        '.impact-high td:first-child{border-left:4px solid var(--color-error)}',
        '.impact-medium td:first-child{border-left:4px solid var(--color-warn)}',
        '.impact-low td:first-child{border-left:4px solid var(--color-success)}',
    ].join('');

    const styles = buildCss() + customCss;

    let bodyContent =
        `<div data-dashboard="suite-optimization">` +
        `<h1>${sanitizeHtml(pageTitle)}</h1>` +
        Section({
            dataSection: 'summary',
            title: 'Summary',
            children: MetricGrid({
                children:
                    MetricCard({ label: 'Total Tests', value: String(result.totalTests), severity: 'info' }) +
                    MetricCard({
                        label: 'Total Duration',
                        value: `${result.totalDuration.toFixed(1)}s`,
                        severity: 'info',
                    }) +
                    MetricCard({
                        label: 'Potential Savings',
                        value: `${result.potentialSavings.toFixed(1)}s`,
                        severity: result.potentialSavings > 0 ? 'success' : 'default',
                    }),
            }),
        });

    if (actionable.length === 0) {
        bodyContent +=
            `<div class="clean-state" data-empty-state="no-optimizations">` +
            `<div class="icon">\u2714</div>` +
            `<p>All tests are within acceptable thresholds — no optimizations needed.</p>` +
            `</div>`;
    } else {
        // Sort by impact (high first) for better prioritization
        const sorted = [...actionable].sort((a, b) => {
            const impactOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
            return (impactOrder[a.impact] ?? 3) - (impactOrder[b.impact] ?? 3);
        });

        const actionVariant: Record<string, 'default' | 'pass' | 'fail' | 'skip' | 'info' | 'warn'> = {
            quarantine: 'fail',
            split: 'fail',
            parallelize: 'info',
            speed_up: 'warn',
            remove_wait: 'skip',
            none: 'default',
        };

        const columns: TableColumn[] = [
            { key: 'test', label: 'Test' },
            { key: 'duration', label: 'Duration (s)', align: 'right' },
            { key: 'savings', label: 'Savings (s)', align: 'right' },
            { key: 'action', label: 'Action' },
            { key: 'impact', label: 'Impact' },
            { key: 'reason', label: 'Reason' },
        ];

        const rows: TableRow[] = sorted.map((entry) => {
            // Calculate potential savings for this test
            const savings = Math.max(0, entry.duration - result.slowThreshold);

            return {
                key: sanitizeHtml(entry.testTitle),
                class: `impact-${entry.impact}`,
                cells: {
                    test: sanitizeHtml(entry.testTitle),
                    duration: entry.duration.toFixed(1),
                    savings: savings > 0 ? `-${savings.toFixed(1)}` : '0',
                    action: Badge({
                        variant: actionVariant[entry.action] ?? 'default',
                        children: entry.action.replace(/_/g, ' '),
                    }),
                    impact: SeverityBadge({ severity: entry.impact, children: entry.impact }),
                    reason: sanitizeHtml(entry.reason),
                },
            };
        });

        bodyContent += Section({
            dataSection: 'optimizations',
            title: 'Optimization Opportunities',
            children: DataTable({ columns, rows }),
        });
    }

    bodyContent += buildRecommendedActions(result) + `</div>`;

    const wrappedContent = Container({
        children: bodyContent,
    });

    try {
        return buildHtmlPage({
            title: pageTitle,
            styles,
            bodyContent: wrappedContent,
        });
    } catch (err: unknown) {
        rootLogger.error(
            'Failed to generate optimization HTML: ' +
                extractErrorMessage(err) +
                '. Verify that all dependencies (html-factory, report-styles, layout) and input data are valid.',
        );
        return buildErrorPage(
            'Error generating optimization report',
            'Failed to generate the optimization report. Verify that all dependencies (html-factory, report-styles, layout primitives) are available and the input data is valid.',
        );
    }
}
