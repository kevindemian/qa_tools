/**
 * Cross-Squad Benchmark — compares health scores across projects/squads.
 *
 * Produces a leaderboard with top/bottom squads, average, std deviation,
 * and trend indicators. Generates an HTML report with summary cards and
 * a color-coded leaderboard table.
 *
 * @module cross-squad-benchmark
 */

import { sanitizeHtml } from './sanitize';
import { buildHtmlPage, buildErrorPage } from './html-factory';
import { buildCss } from './report-styles';
import { formatDateISO } from './date-utils';
import { Card, MetricCard, MetricGrid, Badge, DataTable } from './primitives';
import type { TableColumn, TableRow } from './primitives';
import { rootLogger } from './logger';

export interface SquadBenchmark {
    project: string;
    healthScore: number;
    grade: string;
    passRate: number;
    flakyRate: number;
    coveragePct: number;
    runCount: number;
    trend: 'up' | 'down' | 'stable';
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
    if (previous === undefined) return 'stable';
    if (current > previous) return 'up';
    if (current < previous) return 'down';
    return 'stable';
}

export function computeCrossSquadBenchmark(
    projects: Array<{
        name: string;
        healthScore: number;
        grade: string;
        passRate: number;
        flakyRate: number;
        coveragePct: number;
        runCount: number;
        previousScore?: number;
    }>,
): CrossSquadResult {
    const sorted = [...projects].sort((a, b) => b.healthScore - a.healthScore);

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
    const bottomSquad = n > 1 ? (benchmarks[n - 1]?.project ?? '') : n > 0 ? (benchmarks[0]?.project ?? '') : '';

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
    const variant = _gradeVariant[g] || 'default';
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

export function generateBenchmarkHtml(result: CrossSquadResult, title?: string): string {
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
        rootLogger.error('Failed to generate benchmark HTML: ' + (err as Error).message);
        return buildErrorPage('Error generating benchmark report', 'Error generating benchmark report');
    }
}
