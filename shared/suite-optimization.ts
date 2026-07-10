/**
 * Suite Optimization Advisor — analyzes test duration and flakiness data
 * to recommend optimization actions for a test suite.
 *
 * @module suite-optimization
 */

import { sanitizeHtml } from './escape.js';
import { buildHtmlPage, buildErrorPage } from './html-factory.js';
import { Container, Section } from './primitives/layout.js';
import { MetricCard, MetricGrid } from './primitives/card.js';
import { Badge, SeverityBadge } from './primitives/badge.js';
import { DataTable, type TableColumn, type TableRow } from './primitives/table.js';
import { buildCss } from './report-styles.js';
import { rootLogger } from './logger.js';
import { extractErrorMessage } from './prompt-errors.js';

export type OptimizationAction = 'parallelize' | 'quarantine' | 'speed_up' | 'split' | 'remove_wait' | 'none';

export type OptimizationImpact = 'high' | 'medium' | 'low';

export interface OptimizationEntry {
    testTitle: string;
    duration: number;
    flakiness: number;
    impact: OptimizationImpact;
    action: string;
    reason: string;
}

export interface OptimizationResult {
    optimizations: OptimizationEntry[];
    totalTests: number;
    totalDuration: number;
    potentialSavings: number;
    slowThreshold: number;
    flakyThreshold: number;
    timestamp: string;
}

function toFinite(value: unknown, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;
}

const DEFAULT_SLOW_THRESHOLD = 5;
const DEFAULT_FLAKY_THRESHOLD = 0.3;
const SPLIT_MULTIPLIER = 3;
const PARALLELIZE_MULTIPLIER = 2;
const REMOVE_WAIT_MULTIPLIER = 1.5;
const REMOVE_WAIT_FLAKINESS_CAP = 0.1;

export function analyzeSuiteOptimization(
    tests: Array<{ title: string; duration: number; flakiness: number }>,
    slowThreshold?: number,
    flakyThreshold?: number,
): OptimizationResult {
    const safeSlow = toFinite(slowThreshold, DEFAULT_SLOW_THRESHOLD);
    const safeFlaky = toFinite(flakyThreshold, DEFAULT_FLAKY_THRESHOLD);

    const entries: OptimizationEntry[] = [];
    let totalDuration = 0;
    let potentialSavings = 0;

    for (const test of tests) {
        const duration = toFinite(test.duration, 0);
        const flakiness = toFinite(test.flakiness, 0);
        totalDuration += duration;

        let action: OptimizationAction;
        let reason: string;

        if (flakiness > safeFlaky) {
            action = 'quarantine';
            reason = `Flakiness ${(flakiness * 100).toFixed(0)}% exceeds threshold of ${(safeFlaky * 100).toFixed(0)}%`;
        } else if (duration > safeSlow * SPLIT_MULTIPLIER) {
            action = 'split';
            reason = `Duration ${duration.toFixed(1)}s is ${(duration / safeSlow).toFixed(1)}x over ${safeSlow}s threshold — consider splitting`;
        } else if (duration > safeSlow * PARALLELIZE_MULTIPLIER) {
            action = 'parallelize';
            reason = `Duration ${duration.toFixed(1)}s is ${(duration / safeSlow).toFixed(1)}x over ${safeSlow}s threshold — candidate for parallel execution`;
        } else if (duration > safeSlow * REMOVE_WAIT_MULTIPLIER && flakiness < REMOVE_WAIT_FLAKINESS_CAP) {
            action = 'remove_wait';
            reason = `Duration ${duration.toFixed(1)}s is ${(duration / safeSlow).toFixed(1)}x over ${safeSlow}s threshold with low flakiness — likely unnecessary waits`;
        } else if (duration > safeSlow) {
            action = 'speed_up';
            reason = `Duration ${duration.toFixed(1)}s exceeds ${safeSlow}s threshold — needs optimization`;
        } else {
            action = 'none';
            reason = 'Within acceptable thresholds';
        }

        let impact: 'high' | 'medium' | 'low';
        if (duration > safeSlow * SPLIT_MULTIPLIER || flakiness > safeFlaky) {
            impact = 'high';
        } else if (duration > safeSlow) {
            impact = 'medium';
        } else {
            impact = 'low';
        }

        if (action !== 'none') {
            potentialSavings += Math.max(0, duration - safeSlow);
        }

        entries.push({
            testTitle: test.title,
            duration,
            flakiness,
            impact,
            action,
            reason,
        });
    }

    const impactOrder: Record<'high' | 'medium' | 'low', number> = { high: 3, medium: 2, low: 1 };
    entries.sort((a, b) => {
        const orderDiff = impactOrder[b.impact] - impactOrder[a.impact];
        if (orderDiff !== 0) return orderDiff;
        return b.duration - a.duration;
    });

    return {
        optimizations: entries,
        totalTests: tests.length,
        totalDuration,
        potentialSavings,
        slowThreshold: safeSlow,
        flakyThreshold: safeFlaky,
        timestamp: new Date().toISOString(),
    };
}

export function generateOptimizationHtml(result: OptimizationResult, title?: string): string {
    const pageTitle = title || 'Suite Optimization Report';
    const actionable = result.optimizations.filter((e) => e.action !== 'none');

    const customCss = [
        '.impact-high td:first-child{border-left:4px solid var(--color-error)}',
        '.impact-medium td:first-child{border-left:4px solid var(--color-warn)}',
        '.impact-low td:first-child{border-left:4px solid var(--color-success)}',
        '.clean-state{text-align:center;padding:40px 20px;color:var(--color-text-muted)}',
        '.clean-state .icon{font-size:2.5rem;margin-bottom:12px;opacity:0.6}',
    ].join('');

    const styles = buildCss() + customCss;

    const summaryCards = MetricGrid({
        children:
            MetricCard({ label: 'Total Tests', value: String(result.totalTests), severity: 'info' }) +
            MetricCard({ label: 'Total Duration', value: `${result.totalDuration.toFixed(1)}s`, severity: 'info' }) +
            MetricCard({
                label: 'Potential Savings',
                value: `${result.potentialSavings.toFixed(1)}s`,
                severity: result.potentialSavings > 0 ? 'success' : 'default',
            }),
    });

    let tableOrClean: string;

    if (actionable.length === 0) {
        tableOrClean =
            '<div class="clean-state"><div class="icon">✓</div><p>All tests are within acceptable thresholds — no optimizations needed.</p></div>';
    } else {
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
            { key: 'flakiness', label: 'Flakiness', align: 'right' },
            { key: 'action', label: 'Action' },
            { key: 'impact', label: 'Impact' },
            { key: 'reason', label: 'Reason' },
        ];

        const rows: TableRow[] = actionable.map((entry) => ({
            key: sanitizeHtml(entry.testTitle),
            class: `impact-${entry.impact}`,
            cells: {
                test: sanitizeHtml(entry.testTitle),
                duration: entry.duration.toFixed(1),
                flakiness: `${(entry.flakiness * 100).toFixed(0)}%`,
                action: Badge({
                    variant: actionVariant[entry.action] ?? 'default',
                    children: entry.action.replace(/_/g, ' '),
                }),
                impact: SeverityBadge({ severity: entry.impact, children: entry.impact }),
                reason: sanitizeHtml(entry.reason),
            },
        }));

        tableOrClean = DataTable({ columns, rows });
    }

    const bodyContent = Container({
        children: Section({
            title: sanitizeHtml(pageTitle),
            children: summaryCards + tableOrClean,
        }),
    });

    try {
        return buildHtmlPage({
            title: pageTitle,
            styles,
            bodyContent,
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
