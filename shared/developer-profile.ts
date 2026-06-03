import { rootLogger } from './logger';
import { sanitizeHtml } from './escape';
import { buildHtmlPage, buildErrorPage } from './html-factory';
import { buildCss } from './report-styles';
import { MetricCard, MetricGrid, Badge } from './primitives';

export interface AuthorStat {
    author: string;
    totalFailures: number;
    categories: Record<string, number>;
    testsTouched: number;
    failureRate: number;
    topFailureCategory: string;
}

export interface DeveloperProfileResult {
    authors: AuthorStat[];
    totalAuthors: number;
    totalFailures: number;
    topContributor: string;
    topFailureAuthor: string;
    timestamp: string;
}

export function buildDeveloperProfile(
    failures:
        | Array<{
              testTitle: string;
              category: string;
              timestamp: string;
              author?: string;
          }>
        | null
        | undefined,
): DeveloperProfileResult {
    if (!failures) {
        return {
            authors: [],
            totalAuthors: 0,
            totalFailures: 0,
            topContributor: '',
            topFailureAuthor: '',
            timestamp: new Date().toISOString(),
        };
    }
    try {
        const authorMap = new Map<
            string,
            {
                totalFailures: number;
                categories: Record<string, number>;
                testsTouched: Set<string>;
            }
        >();

        for (const f of failures) {
            const author = f.author || 'Unknown';
            if (!authorMap.has(author)) {
                authorMap.set(author, { totalFailures: 0, categories: {}, testsTouched: new Set() });
            }
            const entry =
                authorMap.get(author) ??
                (() => {
                    throw new Error('author not found after set');
                })();
            entry.totalFailures++;
            entry.categories[f.category] = (entry.categories[f.category] ?? 0) + 1;
            entry.testsTouched.add(f.testTitle);
        }

        const authors: AuthorStat[] = [];
        let totalFailures = 0;
        let topContributor = '';
        let maxTestsTouched = 0;
        let topFailureAuthor = '';
        let maxFailures = 0;

        for (const [author, data] of authorMap) {
            const testsTouched = data.testsTouched.size;
            const failureRate = testsTouched > 0 ? (data.totalFailures / testsTouched) * 100 : 0;

            let topCategory = '';
            let topCount = 0;
            for (const [cat, count] of Object.entries(data.categories)) {
                if (count > topCount) {
                    topCount = count;
                    topCategory = cat;
                }
            }

            authors.push({
                author,
                totalFailures: data.totalFailures,
                categories: { ...data.categories },
                testsTouched,
                failureRate,
                topFailureCategory: topCategory,
            });

            totalFailures += data.totalFailures;

            if (testsTouched > maxTestsTouched) {
                maxTestsTouched = testsTouched;
                topContributor = author;
            }

            if (data.totalFailures > maxFailures) {
                maxFailures = data.totalFailures;
                topFailureAuthor = author;
            }
        }

        return {
            authors,
            totalAuthors: authors.length,
            totalFailures,
            topContributor,
            topFailureAuthor,
            timestamp: new Date().toISOString(),
        };
    } catch (err) {
        rootLogger.error('Failed to build developer profile: ' + (err as Error).message);
        return {
            authors: [],
            totalAuthors: 0,
            totalFailures: 0,
            topContributor: '',
            topFailureAuthor: '',
            timestamp: new Date().toISOString(),
        };
    }
}

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

function buildSeverityBadge(rate: number): string {
    if (rate >= 50) return Badge({ variant: 'fail', children: `${rate.toFixed(1)}%` });
    if (rate >= 20) return Badge({ variant: 'warn', children: `${rate.toFixed(1)}%` });
    return Badge({ variant: 'pass', children: `${rate.toFixed(1)}%` });
}

function buildCategoryTable(categories: Record<string, number>): string {
    const entries = Object.entries(categories).sort((a, b) => b[1] - a[1]);
    if (entries.length === 0) return '<p style="color:var(--color-text-muted);font-size:0.8rem">No categories</p>';

    let html = '<table><thead><tr><th>Category</th><th>Failures</th></tr></thead><tbody>';
    for (const [cat, count] of entries) {
        html += `<tr><td>${sanitizeHtml(cat)}</td><td>${count}</td></tr>`;
    }
    html += '</tbody></table>';
    return html;
}

function buildAuthorSectionHtml(author: AuthorStat): string {
    const rateClass =
        author.failureRate >= 50
            ? 'severity-critical'
            : author.failureRate >= 20
              ? 'severity-high'
              : author.failureRate >= 10
                ? 'severity-medium'
                : 'severity-low';

    return `<div class="author-section">
        <div class="author-header">
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
            <h4 style="margin:0 0 8px;font-size:0.85rem;color:var(--color-text-secondary)">Category Breakdown</h4>
            ${buildCategoryTable(author.categories)}
        </div>
    </div>`;
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

        const summaryCards = MetricGrid({
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
                }),
        });

        let bodyContent = '<h1>' + sanitizeHtml(pageTitle) + '</h1>';
        bodyContent += '<div class="timestamp">' + sanitizeHtml(result.timestamp) + '</div>';
        bodyContent += summaryCards;

        if (result.authors.length === 0) {
            bodyContent +=
                '<p style="color:var(--color-text-muted);text-align:center;margin-top:40px">No developer profile data available.</p>';
        } else {
            for (const author of result.authors) {
                bodyContent += buildAuthorSectionHtml(author);
            }
        }

        return buildHtmlPage({
            title: pageTitle,
            styles: buildCss() + DEVELOPER_PROFILE_CSS,
            theme: 'system',
            bodyContent,
            footer: 'Generated by QA Tools — Developer Profile Dashboard',
        });
    } catch (err) {
        rootLogger.error('Failed to generate developer profile HTML: ' + (err as Error).message);
        return buildErrorPage('Error generating developer profile', 'Error generating developer profile');
    }
}
