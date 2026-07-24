/**
 * Traceability Matrix — HTML rendering layer.
 *
 * Receives computed TraceabilityResult and produces a complete HTML page.
 * This module has NO business logic — only presentation.
 *
 * @module traceability-renderer
 */

import { rootLogger } from '../logger.js';
import { sanitizeHtml } from '../escape.js';
import { buildHtmlPage, buildErrorPage } from './html-factory.js';
import { buildCss } from './report-styles.js';
import { MetricCard, MetricGrid, Section, EmptyState, RecommendedActions } from '../primitives/index.js';
import type { TraceabilityResult, TraceabilityNode, TraceabilityAwareness } from './traceability-matrix.js';

function buildStatusBadge(status: 'passed' | 'failed' | 'skipped'): string {
    const label = status.charAt(0).toUpperCase() + status.slice(1);
    let variant: string;
    if (status === 'passed') {
        variant = 'pass';
    } else if (status === 'failed') {
        variant = 'fail';
    } else {
        variant = 'skip';
    }
    return `<span data-component="badge" data-variant="${variant}" class="status-${status}">${label}</span>`;
}

function buildHealthBar(value: number): string {
    const pct = Math.min(100, Math.max(0, value));
    let color: string;
    if (pct >= 80) {
        color = 'var(--color-success)';
    } else if (pct >= 50) {
        color = 'var(--color-warn)';
    } else {
        color = 'var(--color-error)';
    }
    return `<div data-component="health-bar"><div data-part="fill" style="width:${pct}%;background:${color}"></div></div>`;
}

function buildTestHtml(test: TraceabilityNode['stories'][0]['tests'][0]): string {
    const flakinessPct = Math.round(test.flakiness * 100);

    let testIcon: string;
    if (test.status === 'passed') {
        testIcon = '\u2705';
    } else if (test.status === 'failed') {
        testIcon = '\u274C';
    } else {
        testIcon = '\u23F8';
    }

    return `<div class="test-row test-${test.status}" data-component="test-row" data-status="${test.status}">
        <span class="test-icon" data-part="icon">${testIcon}</span>
        <span class="test-title" data-part="title">${sanitizeHtml(test.title)}</span>
        <span class="test-meta" data-part="meta">${test.duration}ms</span>
        <span class="test-flakiness" data-part="flakiness">flak: ${flakinessPct}%</span>
        ${buildStatusBadge(test.status)}
    </div>`;
}

function buildStoryHtml(story: TraceabilityNode['stories'][0]): string {
    const testsHtml = story.tests.map((t) => buildTestHtml(t)).join('');
    return `<div class="story-node" data-component="story">
        <div class="story-header" data-part="header" onclick="this.parentElement.classList.toggle('collapsed')">
            <span class="toggle-icon" data-part="toggle-icon">&#9660;</span>
            <span class="story-key" data-part="key">${sanitizeHtml(story.key)}</span>
            <span class="stat" data-part="stat">cov: ${story.coverage}%</span>
            <span class="stat" data-part="stat">health: ${story.health}%</span>
            <span class="stat" data-part="stat">flak: ${Math.round(story.flakiness * 100)}%</span>
            ${buildHealthBar(story.health)}
        </div>
        <div class="story-tests" data-part="tests">${testsHtml}</div>
    </div>`;
}

function buildEpicNodeHtml(node: TraceabilityNode): string {
    const storiesHtml = node.stories.map((s) => buildStoryHtml(s)).join('');
    const emptyMsg =
        node.stories.length === 0
            ? EmptyState({
                  title: 'No tests linked',
                  description: `This epic (${sanitizeHtml(node.epic)}) has no linked stories or tests.`,
                  action: 'Link test cases to this epic in your test management tool to enable traceability.',
              })
            : '';

    // Highlight uncovered epics with visual indicator
    let coverageIndicator: string;
    if (node.coverage < 50) {
        coverageIndicator = ' \u{1F534}';
    } else if (node.coverage < 80) {
        coverageIndicator = ' \u{1F7E1}';
    } else {
        coverageIndicator = '';
    }

    return `<div class="epic-node" data-component="epic">
        <div class="epic-header" data-part="header" onclick="this.parentElement.classList.toggle('collapsed')">
            <span class="toggle-icon" data-part="toggle-icon">&#9660;</span>
            <span class="epic-key" data-part="key">${sanitizeHtml(node.epic)}${coverageIndicator}</span>
            <span class="stat" data-part="stat">cov: ${node.coverage}%</span>
            <span class="stat" data-part="stat">health: ${node.health}%</span>
            <span class="stat" data-part="stat">flak: ${Math.round(node.flakiness * 100)}%</span>
            ${buildHealthBar(node.health)}
        </div>
        <div class="epic-stories" data-part="stories">${storiesHtml}${emptyMsg}</div>
    </div>`;
}

function buildAwarenessHtml(awareness: TraceabilityAwareness): string {
    if (!awareness.categories.length) {
        return '';
    }
    const rows = awareness.categories
        .map((c) => {
            const entities = c.entities
                .map((e) => {
                    const conf = e.confidence == null ? 'n/a' : Math.round(e.confidence * 100) + '%';
                    const flag = !e.valid ? ' ⚠ invalid' : '';
                    return `<li data-component="entity">${sanitizeHtml(e.id)} <span data-part="confidence">${conf}</span>${flag}</li>`;
                })
                .join('');
            return `<div data-component="awareness-category" data-section="${sanitizeHtml(c.category)}"><span data-part="category-name">${sanitizeHtml(c.category)}</span> (${c.entities.length})<ul>${entities}</ul></div>`;
        })
        .join('');
    const minLine =
        awareness.minConfidence == null
            ? ''
            : `<div data-part="min-confidence">min confidence: ${Math.round(awareness.minConfidence * 100)}%</div>`;
    return `<section data-section="awareness"><h2>Cross-References &amp; Data Quality</h2>${rows}${minLine}</section>`;
}

export function generateTraceabilityHtml(result: TraceabilityResult | null | undefined, title?: string): string {
    try {
        if (!result) {
            rootLogger.error('Traceability result is null or undefined');
            return buildErrorPage('Error generating traceability matrix', 'Error generating traceability matrix');
        }
        const pageTitle = title || 'Traceability Matrix';

        let coverageSeverity: 'success' | 'warn' | 'error';
        if (result.overallCoverage >= 80) {
            coverageSeverity = 'success';
        } else if (result.overallCoverage >= 50) {
            coverageSeverity = 'warn';
        } else {
            coverageSeverity = 'error';
        }

        // Calculate total flakiness across all epics
        const totalFlakiness =
            result.nodes.length > 0
                ? Math.round((result.nodes.reduce((sum, n) => sum + n.flakiness, 0) / result.nodes.length) * 100)
                : 0;

        // Count uncovered epics
        const uncoveredEpics = result.nodes.filter((n) => n.stories.length === 0);
        const coveredEpics = result.totalEpics - uncoveredEpics.length;

        const summaryCards = Section({
            dataSection: 'summary',
            title: 'Summary',
            children: MetricGrid({
                children:
                    MetricCard({ label: 'Total Epics', value: String(result.totalEpics) }) +
                    MetricCard({ label: 'Total Tests', value: String(result.totalTests) }) +
                    MetricCard({ label: 'Covered Epics', value: `${coveredEpics}/${result.totalEpics}` }) +
                    MetricCard({
                        label: 'Overall Test Pass Rate',
                        value: result.overallCoverage + '%',
                        severity: coverageSeverity,
                    }) +
                    MetricCard({ label: 'Avg Flakiness', value: `${totalFlakiness}%` }),
            }),
        });

        const treeHtml =
            result.nodes.length > 0
                ? Section({
                      dataSection: 'tree',
                      children:
                          '<div data-component="tree">' +
                          result.nodes.map((n) => buildEpicNodeHtml(n)).join('') +
                          '</div>',
                  })
                : EmptyState({
                      title: 'No traceability data available',
                      description:
                          'The traceability matrix requires epic-to-test mappings. No nodes were found to display.',
                      action: 'Configure test-to-requirement links in your test management tool and re-run the traceability analysis.',
                  });

        const bodyContent = wrapContainer(
            pageTitle,
            `<div data-part="timestamp">${sanitizeHtml(result.timestamp)}</div>` +
                summaryCards +
                treeHtml +
                buildAwarenessHtml(result.awareness) +
                buildRecommendedActions(result),
        );

        return buildHtmlPage({
            title: pageTitle,
            styles: buildCss(),
            theme: 'system',
            bodyContent,
            footer: 'Generated by QA Tools — Traceability Matrix',
        });
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        rootLogger.error('Failed to generate traceability HTML: ' + msg);
        return buildErrorPage('Error generating traceability matrix', 'Error generating traceability matrix');
    }
}

function wrapContainer(pageTitle: string, children: string): string {
    return `<div data-component="container" data-dashboard="traceability">
        <h1>${sanitizeHtml(pageTitle)}</h1>
        ${children}
    </div>`;
}

function buildRecommendedActions(result: TraceabilityResult): string {
    const actions: Array<{ severity: 'error' | 'warn' | 'info'; text: string }> = [];

    // Action 1: Low coverage
    if (result.overallCoverage < 50) {
        actions.push({
            severity: 'error',
            text: `Test coverage is ${result.overallCoverage}% — critically low. Increase test coverage for critical paths immediately.`,
        });
    }

    // Action 2: Medium coverage
    if (result.overallCoverage < 80 && result.overallCoverage >= 50) {
        actions.push({
            severity: 'warn',
            text: `Test coverage is ${result.overallCoverage}%. Consider adding tests for uncovered epics to reach the 80% target.`,
        });
    }

    // Action 3: Uncovered epics with names
    const uncoveredEpics = result.nodes.filter((n) => n.stories.length === 0);
    if (uncoveredEpics.length > 0) {
        const epicNames = uncoveredEpics
            .slice(0, 3)
            .map((n) => sanitizeHtml(n.epic))
            .join(', ');
        const moreText = uncoveredEpics.length > 3 ? ` and ${uncoveredEpics.length - 3} more` : '';
        actions.push({
            severity: 'warn',
            text: `${uncoveredEpics.length} epic(s) have no linked tests: ${epicNames}${moreText}. Add test cases to improve traceability.`,
        });
    }

    // Default action if no issues found
    if (actions.length === 0) {
        actions.push({
            severity: 'info',
            text: 'Traceability coverage is adequate. Continue maintaining test-to-requirement links.',
        });
    }

    return Section({
        dataSection: 'actions',
        title: 'Recommended Actions',
        children: RecommendedActions({ actions }),
    });
}
