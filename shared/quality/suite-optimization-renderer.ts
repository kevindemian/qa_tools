/**
 * Suite Optimization Report — HTML renderer.
 *
 * Extracted from suite-optimization.ts (compute) to separate concerns.
 * This module handles ONLY HTML generation; all business logic remains in suite-optimization.ts.
 *
 * @module suite-optimization-renderer
 */

import { sanitizeHtml } from '../escape.js';
import { resolveGeneratedAt } from '../date-utils.js';
import { buildHtmlPage, buildErrorPage } from '../report/html-factory.js';
import { Container, Section } from '../primitives/layout.js';
import { MetricCard, MetricGrid } from '../primitives/card.js';
import { Badge, SeverityBadge } from '../primitives/badge.js';
import { DataTable, type TableColumn, type TableRow } from '../primitives/table.js';
import { RecommendedActions } from '../primitives/index.js';
import { buildCss } from '../report/report-styles.js';
import { rootLogger } from '../logger.js';
import { extractErrorMessage } from '../ui/prompt-errors.js';
import { icon } from '../icons.js';
import type { OptimizationResult } from '../types/data-hub-extensions.js';

const POTENTIAL_SAVINGS_WARN_THRESHOLD = 60;

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
    if (result.potentialSavings > POTENTIAL_SAVINGS_WARN_THRESHOLD) {
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

export function generateOptimizationHtml(
    result: OptimizationResult | null | undefined,
    title?: string,
    generatedAt?: string,
): string {
    const pageTitle = title || 'Suite Optimization Report';
    if (!result) {
        rootLogger.error('generateOptimizationHtml: optimization result is missing.');
        return buildErrorPage('Error generating dashboard', 'Suite optimization data is unavailable.');
    }
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
        `<div data-part="timestamp">${sanitizeHtml(resolveGeneratedAt(generatedAt))}</div>` +
        Section({
            dataSection: 'summary',
            title: 'Summary',
            children: MetricGrid({
                children:
                    MetricCard({
                        label: 'Tests to Optimize',
                        value: String(result.totalTests),
                        severity: 'warn',
                    }) +
                    MetricCard({
                        label: 'Total Duration',
                        value: `${result.totalDuration.toFixed(1)}s`,
                        severity: 'info',
                    }) +
                    MetricCard({
                        label: 'Potential Savings',
                        value: `${result.potentialSavings.toFixed(1)}s`,
                        severity: result.potentialSavings > 0 ? 'success' : 'default',
                        target: `target: <${POTENTIAL_SAVINGS_WARN_THRESHOLD}s`,
                    }) +
                    MetricCard({
                        label: 'Slow Threshold',
                        value: `${result.slowThreshold}s`,
                        severity: 'info',
                    }) +
                    MetricCard({
                        label: 'Flaky Threshold',
                        value: `${(result.flakyThreshold * 100).toFixed(0)}%`,
                        severity: 'info',
                    }),
            }),
        });

    if (actionable.length === 0) {
        bodyContent +=
            `<div class="clean-state" data-empty-state="no-optimizations">` +
            `<div class="icon">${icon('check-circle', 16)}</div>` +
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
            title: 'Optimization Table',
            children: DataTable({ columns, rows }),
        });

        const actionCounts: Record<string, number> = {};
        for (const entry of result.optimizations) {
            actionCounts[entry.action] = (actionCounts[entry.action] ?? 0) + 1;
        }
        const actionSummaryChildren = Object.entries(actionCounts)
            .map(([action, count]) =>
                MetricCard({
                    label: action.replace(/_/g, ' '),
                    value: String(count),
                    severity: 'info',
                }),
            )
            .join('');

        if (actionSummaryChildren) {
            bodyContent += Section({
                dataSection: 'action-summary',
                title: 'Action Summary',
                children: MetricGrid({ children: actionSummaryChildren }),
            });
        }
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
