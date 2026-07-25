/**
 * Cross-Squad Benchmark — HTML rendering layer.
 *
 * Extracted from cross-squad-benchmark.ts (compute) to separate concerns.
 * This module handles ONLY HTML generation; all business logic remains in cross-squad-benchmark.ts.
 *
 * @module cross-squad-benchmark-renderer
 */

import { sanitizeHtml } from '../sanitize.js';
import { buildHtmlPage, buildErrorPage } from '../report/html-factory.js';
import { buildCss } from '../report/report-styles.js';
import { formatDateISO } from '../date-utils.js';
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
import { rootLogger } from '../logger.js';
import type { CrossSquadResult } from './cross-squad-benchmark.js';

const BOTTOM_SQUAD_SCORE_ERROR = 60;
const STD_DEV_WARN = 20;
const TOP_SQUAD_SCORE_INFO = 80;

const _gradeVariant: Record<string, 'pass' | 'fail' | 'skip' | 'info' | 'warn'> = {
    A: 'pass',
    B: 'info',
    C: 'warn',
    D: 'fail',
    F: 'fail',
};

function _badgeForGrade(grade: string): string {
    const g = grade.toUpperCase();
    const variant = Object.entries(_gradeVariant).find(([k]) => k === g)?.[1] || 'default';
    return Badge({ variant, children: grade });
}

function _trendIcon(trend: 'up' | 'down' | 'stable'): string {
    if (trend === 'up') return Badge({ variant: 'pass', children: '\u2191 Up' });
    if (trend === 'down') return Badge({ variant: 'fail', children: '\u2193 Down' });
    return Badge({ variant: 'default', children: '\u2192 Stable' });
}

function _buildSummaryCards(result: CrossSquadResult): string {
    const hasData = result.benchmarks.length > 0;

    // Calculate score range
    const scores = result.benchmarks.map((b) => b.healthScore);
    const minScore = hasData ? Math.min(...scores).toFixed(1) : '—';
    const maxScore = hasData ? Math.max(...scores).toFixed(1) : '—';

    return Section({
        dataSection: 'summary',
        title: 'Summary',
        children: MetricGrid({
            children:
                MetricCard({
                    label: 'Average Score',
                    value: hasData ? result.averageScore.toFixed(1) : '—',
                    severity: 'info',
                }) +
                MetricCard({
                    label: 'Score Range',
                    value: `${minScore} \u2014 ${maxScore}`,
                    severity: 'default',
                }) +
                MetricCard({
                    label: 'Std Deviation',
                    value: hasData ? result.stdDev.toFixed(2) : '—',
                    severity: result.stdDev > STD_DEV_WARN ? 'warn' : 'default',
                    target: `target: <${STD_DEV_WARN}`,
                }) +
                MetricCard({
                    label: 'Top Squad',
                    value: result.topSquad ? sanitizeHtml(result.topSquad) : '—',
                    severity: 'success',
                }) +
                MetricCard({
                    label: 'Bottom Squad',
                    value: result.bottomSquad ? sanitizeHtml(result.bottomSquad) : '—',
                    severity: result.topSquad === result.bottomSquad ? 'default' : 'error',
                }),
        }),
    });
}

function _buildLeaderboard(result: CrossSquadResult): string {
    if (result.benchmarks.length === 0) {
        return EmptyState({
            title: 'No squad data available',
            description: 'No squad benchmark data is available for comparison.',
            action: 'Run health score calculations to generate benchmark data.',
            icon: '\u{1F3C6}',
        });
    }

    const columns: TableColumn[] = [
        { key: 'rank', label: '#', width: '40px', align: 'center' },
        { key: 'project', label: 'Squad' },
        { key: 'score', label: 'Score', align: 'center' },
        { key: 'grade', label: 'Grade', align: 'center' },
        { key: 'passRate', label: 'Pass Rate', align: 'center' },
        { key: 'flakyRate', label: 'Flaky', align: 'center' },
        { key: 'coverage', label: 'Coverage', align: 'center' },
        { key: 'runs', label: 'Runs', align: 'center' },
        { key: 'trend', label: 'Trend', align: 'center' },
    ];

    const rows: TableRow[] = result.benchmarks.map((b, i) => ({
        key: `squad-${i}`,
        cells: {
            rank: String(i + 1),
            project: sanitizeHtml(b.project),
            score: b.healthScore.toFixed(1),
            grade: _badgeForGrade(b.grade),
            passRate: b.passRate.toFixed(1) + '%',
            flakyRate: b.flakyRate.toFixed(1) + '%',
            coverage: b.coveragePct.toFixed(1) + '%',
            runs: String(b.runCount),
            trend: _trendIcon(b.trend),
        },
    }));

    return Section({
        dataSection: 'leaderboard',
        title: 'Leaderboard',
        children: DataTable({
            columns,
            rows,
            compact: false,
            ariaLabel: 'Squad leaderboard',
        }),
    });
}

function _buildRecommendedActions(result: CrossSquadResult): string {
    const actions: Array<{ severity: 'error' | 'warn' | 'info'; text: string }> = [];

    if (result.benchmarks.length > 0) {
        // Action 1: Bottom squad with low score
        const bottomSquad = result.benchmarks[result.benchmarks.length - 1];
        if (bottomSquad && bottomSquad.healthScore < BOTTOM_SQUAD_SCORE_ERROR) {
            actions.push({
                severity: 'error',
                text: `Squad "${sanitizeHtml(bottomSquad.project)}" has a health score of ${bottomSquad.healthScore.toFixed(1)} (below ${BOTTOM_SQUAD_SCORE_ERROR}). Immediate attention required to improve test quality.`,
            });
        }

        // Action 2: High standard deviation
        if (result.stdDev > STD_DEV_WARN) {
            actions.push({
                severity: 'warn',
                text: `High standard deviation (${result.stdDev.toFixed(1)}) indicates significant quality gaps between squads. Consider cross-squad knowledge sharing and standardized practices.`,
            });
        }

        // Action 3: Top squad best practices
        const topSquad = result.benchmarks[0];
        if (topSquad && topSquad.healthScore > TOP_SQUAD_SCORE_INFO) {
            actions.push({
                severity: 'info',
                text: `Squad "${sanitizeHtml(topSquad.project)}" leads with a score of ${topSquad.healthScore.toFixed(1)}. Consider adopting their practices across other squads.`,
            });
        }
    }

    if (actions.length === 0) {
        actions.push({
            severity: 'info',
            text: 'Squad health scores are within acceptable ranges. Continue monitoring.',
        });
    }

    return Section({
        dataSection: 'actions',
        title: 'Recommended Actions',
        children: RecommendedActions({ actions }),
    });
}

export function generateBenchmarkHtml(result: CrossSquadResult | null | undefined, title?: string): string {
    if (result == null) {
        rootLogger.warn(
            'Cross-squad benchmark: result parameter is null or undefined — returning error page. Verify that the caller passes a valid CrossSquadResult.',
        );
        return buildErrorPage(
            'Error generating benchmark report',
            'Failed to generate benchmark report: no result data provided. Verify that computeCrossSquadBenchmark returned a valid result.',
        );
    }
    try {
        const reportTitle = title || 'Cross-Squad Benchmark';
        const bodyContent =
            `<div data-dashboard="cross-squad-benchmark">` +
            `<h1>${sanitizeHtml(reportTitle)}</h1>` +
            `<div data-part="timestamp">${sanitizeHtml(new Date().toISOString())}</div>` +
            _buildSummaryCards(result) +
            _buildLeaderboard(result) +
            _buildRecommendedActions(result) +
            `<p class="footer-note">` +
            `Generated by QA Tools \u00B7 ${formatDateISO()}` +
            `</p>` +
            `</div>`;

        return buildHtmlPage({
            title: reportTitle,
            styles: buildCss(),
            theme: 'system',
            bodyContent,
        });
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        rootLogger.error(
            'Failed to generate benchmark HTML: ' +
                msg +
                '. Verify that all dependencies (html-factory, report-styles, date-utils) and input data are valid.',
        );
        return buildErrorPage(
            'Error generating benchmark report',
            'Failed to generate benchmark report. Verify that all dependencies (html-factory, report-styles, date-utils) are available and the input data is valid.',
        );
    }
}
