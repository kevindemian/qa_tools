/**
 * Developer Profile Dashboard — HTML renderer.
 *
 * Extracted from developer-profile.ts (compute) to separate concerns.
 * This module handles ONLY HTML generation; all business logic remains in developer-profile.ts.
 *
 * @module developer-profile-renderer
 */

import { rootLogger } from '../logger.js';
import { sanitizeHtml } from '../escape.js';
import { buildHtmlPage, buildErrorPage } from '../report/html-factory.js';
import { buildCss } from '../report/report-styles.js';
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
import type { AuthorStat, DeveloperProfileResult } from './developer-profile.js';

const DEVELOPER_PROFILE_CSS = `
.author-section{margin-bottom:20px;background:var(--color-surface-card);border-radius:8px;box-shadow:0 1px 3px rgba(0,0,0,0.1);overflow:hidden}
.author-header{padding:12px 16px;background:var(--color-surface-elevated);font-size:1rem;font-weight:600;display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.author-stats{display:flex;gap:16px;padding:12px 16px;flex-wrap:wrap;font-size:0.85rem}
.author-stat{display:flex;flex-direction:column;gap:2px}
.author-stat-label{font-size:0.7rem;text-transform:uppercase;color:var(--color-text-secondary)}
.author-stat-value{font-size:1rem;font-weight:600;color:var(--color-text-primary)}
.category-breakdown{padding:0 16px 12px}
.category-breakdown table{width:100%;border-collapse:collapse;font-size:0.825rem}
.category-breakdown th{padding:6px 8px;text-align:left;color:var(--color-text-secondary);text-transform:uppercase;font-size:0.7rem;border-bottom:1px solid var(--color-border-subtle)}
.category-breakdown td{padding:6px 8px;border-bottom:1px solid var(--color-border-subtle);color:var(--color-text-primary)}
.severity-critical{color:var(--color-error);font-weight:700}
.severity-high{color:var(--color-error)}
.severity-medium{color:var(--color-warn)}
.severity-low{color:var(--color-success)}
.timestamp{font-size:0.75rem;color:var(--color-text-muted);margin-bottom:16px}
`;

const RATE_THRESHOLD_HIGH = 50;
const RATE_THRESHOLD_MEDIUM = 20;
const RATE_THRESHOLD_LOW = 10;

function buildSeverityBadge(rate: number): string {
    if (rate >= RATE_THRESHOLD_HIGH) return Badge({ variant: 'fail', children: `${rate.toFixed(1)}%` });
    if (rate >= RATE_THRESHOLD_MEDIUM) return Badge({ variant: 'warn', children: `${rate.toFixed(1)}%` });
    return Badge({ variant: 'pass', children: `${rate.toFixed(1)}%` });
}

function buildCategoryTable(categories: Record<string, number>): string {
    const entries = Object.entries(categories).sort((a, b) => b[1] - a[1]);
    if (entries.length === 0) {
        return EmptyState({
            title: 'No categories',
            description: 'No failure categories recorded for this developer.',
            icon: '\u{1F4CB}',
        });
    }

    const columns: TableColumn[] = [
        { key: 'category', label: 'Category' },
        { key: 'failures', label: 'Failures', align: 'right' },
    ];

    const rows: TableRow[] = entries.map(([cat, count]) => ({
        key: cat,
        cells: {
            category: sanitizeHtml(cat),
            failures: String(count),
        },
    }));

    return DataTable({ columns, rows, caption: 'Failure categories' });
}

function buildAuthorSectionHtml(author: AuthorStat, rank: number): string {
    let rateClass: string;
    if (author.failureRate >= RATE_THRESHOLD_HIGH) {
        rateClass = 'severity-critical';
    } else if (author.failureRate >= RATE_THRESHOLD_MEDIUM) {
        rateClass = 'severity-high';
    } else if (author.failureRate >= RATE_THRESHOLD_LOW) {
        rateClass = 'severity-medium';
    } else {
        rateClass = 'severity-low';
    }

    return `<div class="author-section" data-component="author-card">
        <div class="author-header">
            <span data-part="rank">#${rank}</span>
            <span>${sanitizeHtml(author.author)}</span>
            ${buildSeverityBadge(author.failureRate)}
        </div>
        <div class="author-stats">
            <div class="author-stat">
                <span class="author-stat-label">Total Failures</span>
                <span class="author-stat-value">${author.totalFailures}</span>
            </div>
            <div class="author-stat">
                <span class="author-stat-label">Tests Touched</span>
                <span class="author-stat-value">${author.testsTouched}</span>
            </div>
            <div class="author-stat">
                <span class="author-stat-label">Failure Rate</span>
                <span class="author-stat-value ${rateClass}">${author.failureRate.toFixed(1)}%</span>
            </div>
            <div class="author-stat">
                <span class="author-stat-label">Top Category</span>
                <span class="author-stat-value">${sanitizeHtml(author.topFailureCategory) || '\u2014'}</span>
            </div>
        </div>
        <div class="category-breakdown">
            <h4>Category Breakdown</h4>
            ${buildCategoryTable(author.categories)}
        </div>
    </div>`;
}

function buildRecommendedActions(result: DeveloperProfileResult): string {
    const actions: Array<{ severity: 'error' | 'warn' | 'info'; text: string }> = [];

    // Action 1: High failure rate developers
    const highRateAuthors = result.authors.filter((a) => a.failureRate >= RATE_THRESHOLD_MEDIUM);
    if (highRateAuthors.length > 0) {
        actions.push({
            severity: 'error',
            text: `${highRateAuthors.length} developer(s) have failure rates above ${RATE_THRESHOLD_MEDIUM}%. Consider pair programming or code review focus: ${highRateAuthors.map((a) => sanitizeHtml(a.author)).join(', ')}.`,
        });
    }

    // Action 2: Top failure author
    if (result.totalFailures > 0 && result.topFailureAuthor) {
        actions.push({
            severity: 'warn',
            text: `Top failure author: ${sanitizeHtml(result.topFailureAuthor)} with ${result.totalFailures} total failures. Investigate common failure patterns.`,
        });
    }

    // Action 3: Top category
    const categoryMap = new Map<string, number>();
    for (const author of result.authors) {
        for (const [cat, count] of Object.entries(author.categories)) {
            categoryMap.set(cat, (categoryMap.get(cat) || 0) + count);
        }
    }
    const topCategory = Array.from(categoryMap.entries()).sort((a, b) => b[1] - a[1])[0];
    if (topCategory && topCategory[1] > 5) {
        actions.push({
            severity: 'warn',
            text: `Most common failure category: "${sanitizeHtml(topCategory[0])}" (${topCategory[1]} failures). Focus testing improvements here.`,
        });
    }

    if (actions.length === 0) {
        actions.push({
            severity: 'info',
            text: 'Developer failure rates are within acceptable ranges. Continue monitoring.',
        });
    }

    return Section({
        dataSection: 'actions',
        title: 'Recommended Actions',
        children: RecommendedActions({ actions }),
    });
}

export function generateDeveloperProfileHtml(
    result: DeveloperProfileResult | null | undefined,
    title?: string,
): string {
    try {
        if (!result) {
            rootLogger.error('Failed to generate developer profile HTML: result is null or undefined');
            return buildErrorPage('Error generating developer profile', 'Error generating developer profile');
        }
        const pageTitle = title || 'Developer Profile Dashboard';

        let bodyContent =
            `<div data-dashboard="developer-profile">` +
            `<h1>${sanitizeHtml(pageTitle)}</h1>` +
            `<div class="timestamp" data-part="timestamp">${sanitizeHtml(result.timestamp)}</div>` +
            Section({
                dataSection: 'summary',
                title: 'Summary',
                children: MetricGrid({
                    children:
                        MetricCard({ label: 'Total Authors', value: String(result.totalAuthors) }) +
                        MetricCard({ label: 'Total Failures', value: String(result.totalFailures) }) +
                        MetricCard({
                            label: 'Top Contributor',
                            value: sanitizeHtml(result.topContributor) || '\u2014',
                        }) +
                        MetricCard({
                            label: 'Top Failure Author',
                            value: sanitizeHtml(result.topFailureAuthor) || '\u2014',
                            severity: result.totalFailures > 0 ? 'error' : 'default',
                            target: 'target: 0',
                        }),
                }),
            });

        if (result.authors.length === 0) {
            bodyContent += EmptyState({
                title: 'No developer profile data available',
                description: 'No failure data is available for developer profiling.',
                action: 'Run test suite to generate failure data.',
                icon: '\u{1F464}',
            });
        } else {
            // Sort authors by failure rate (highest first) for ranking
            const sorted = [...result.authors].sort((a, b) => b.failureRate - a.failureRate);
            bodyContent += Section({
                dataSection: 'authors',
                title: 'Developer Profiles',
                children: sorted.map((author, i) => buildAuthorSectionHtml(author, i + 1)).join(''),
            });
        }

        bodyContent += buildRecommendedActions(result) + `</div>`;

        return buildHtmlPage({
            title: pageTitle,
            styles: buildCss() + DEVELOPER_PROFILE_CSS,
            theme: 'system',
            bodyContent,
            footer: 'Generated by QA Tools — Developer Profile Dashboard',
        });
    } catch (err) {
        const _msg2 = String(err);
        rootLogger.error('Failed to generate developer profile HTML: ' + _msg2 + '. Check result data and try again.');
        return buildErrorPage('Error generating developer profile', 'Error generating developer profile');
    }
}
