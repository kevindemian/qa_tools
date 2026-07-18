/**
 * Cross-Squad Benchmark — compares health scores across projects/squads.
 *
 * Produces a leaderboard with top/bottom squads, average, std deviation,
 * and trend indicators. Generates an HTML report with summary cards and
 * a color-coded leaderboard table.
 *
 * @module cross-squad-benchmark
 */

import { sanitizeHtml } from '../sanitize.js';
import { buildHtmlPage, buildErrorPage } from '../report/html-factory.js';
import { buildCss } from '../report/report-styles.js';
import { formatDateISO } from '../date-utils.js';
import { Card, MetricCard, MetricGrid, Badge, DataTable } from '../primitives/index.js';
import type { TableColumn, TableRow } from '../primitives/index.js';
import { rootLogger } from '../logger.js';

/**
 * Dimension 5 Provenance — documents the source and justification for benchmark methodology.
 * @reference DORA / Internal cross-team benchmarking best practice
 */
export const BENCHMARK_PROVENANCE = {
    methodology: {
        source: 'Cross-team benchmarking best practice',
        standard: 'DORA / Internal',
    },
} as const;

type Trend = 'up' | 'down' | 'stable';

export interface SquadBenchmark {
    project: string;
    healthScore: number;
    grade: string;
    passRate: number;
    flakyRate: number;
    coveragePct: number;
    runCount: number;
    trend: Trend;
}

export interface CrossSquadResult {
    benchmarks: SquadBenchmark[];
    topSquad: string;
    bottomSquad: string;
    averageScore: number;
    stdDev: number;
    timestamp: string;
}

function _determineTrend(current: number, previous?: number): 'up' | 'down' | 'stable' {
    if (previous === undefined || Number.isNaN(previous)) return 'stable';
    if (current > previous) return 'up';
    if (current < previous) return 'down';
    return 'stable';
}

export function computeCrossSquadBenchmark(
    projects:
        | Array<{
              name: string;
              healthScore: number;
              grade: string;
              passRate: number;
              flakyRate: number;
              coveragePct: number;
              runCount: number;
              previousScore?: number;
          }>
        | null
        | undefined,
): CrossSquadResult {
    if (!Array.isArray(projects)) {
        rootLogger.warn(
            'Cross-squad benchmark: projects parameter is not an array — returning empty result. Verify that the caller passes a valid array of project data.',
        );
        return {
            benchmarks: [],
            topSquad: '',
            bottomSquad: '',
            averageScore: 0,
            stdDev: 0,
            timestamp: new Date().toISOString(),
        };
    }
    const valid = projects.filter((p) => {
        if (
            Number.isNaN(p.healthScore) ||
            Number.isNaN(p.passRate) ||
            Number.isNaN(p.flakyRate) ||
            Number.isNaN(p.coveragePct) ||
            Number.isNaN(p.runCount) ||
            p.passRate < 0 ||
            p.flakyRate < 0 ||
            p.coveragePct < 0 ||
            p.runCount < 0
        ) {
            rootLogger.warn(
                `Cross-squad benchmark: excluding project "${p.name}" — invalid numeric fields. Verify that healthScore, passRate, flakyRate, coveragePct, and runCount are finite numbers >= 0.`,
            );
            return false;
        }
        return true;
    });

    const sorted = [...valid].sort((a, b) => b.healthScore - a.healthScore);

    const benchmarks: SquadBenchmark[] = sorted.map((p) => ({
        project: p.name,
        healthScore: p.healthScore,
        grade: p.grade,
        passRate: p.passRate,
        flakyRate: p.flakyRate,
        coveragePct: p.coveragePct,
        runCount: p.runCount,
        trend: _determineTrend(p.healthScore, p.previousScore),
    }));

    const scores = benchmarks.map((b) => b.healthScore);
    const n = scores.length;
    const averageScore = n > 0 ? scores.reduce((a, b) => a + b, 0) / n : 0;

    let stdDev = 0;
    if (n > 1) {
        const variance = scores.reduce((sum, s) => sum + (s - averageScore) ** 2, 0) / n;
        stdDev = Math.sqrt(variance);
    }

    const topSquad = n > 0 ? (benchmarks[0]?.project ?? '') : '';

    let bottomSquad: string;
    if (n > 1) {
        bottomSquad = benchmarks[n - 1]?.project ?? '';
    } else if (n > 0) {
        bottomSquad = benchmarks[0]?.project ?? '';
    } else {
        bottomSquad = '';
    }

    return {
        benchmarks,
        topSquad,
        bottomSquad,
        averageScore,
        stdDev,
        timestamp: new Date().toISOString(),
    };
}

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
    return MetricGrid({
        children:
            MetricCard({
                label: 'Average Score',
                value: hasData ? result.averageScore.toFixed(1) : '—',
                severity: 'info',
            }) +
            MetricCard({
                label: 'Std Deviation',
                value: hasData ? result.stdDev.toFixed(2) : '—',
                severity: 'default',
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
    });
}

function _buildLeaderboard(result: CrossSquadResult): string {
    if (result.benchmarks.length === 0) {
        return Card({
            variant: 'bordered',
            severity: 'info',
            children:
                '<div style="text-align:center;padding:20px;color:var(--color-text-muted)">No squad data available</div>',
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

    return DataTable({
        columns,
        rows,
        compact: false,
        ariaLabel: 'Squad leaderboard',
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
            '<h1>' +
            sanitizeHtml(reportTitle) +
            '</h1>' +
            _buildSummaryCards(result) +
            '<h2>Leaderboard</h2>' +
            _buildLeaderboard(result) +
            '<p style="font-size:0.8rem;color:var(--color-text-muted);margin-top:8px">' +
            'Generated by QA Tools \u00B7 ' +
            formatDateISO() +
            '</p>';

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
