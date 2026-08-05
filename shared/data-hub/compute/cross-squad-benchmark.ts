/**
 * Compute: Cross-Squad Benchmark — compares health scores across projects/squads.
 *
 * Pure compute layer: produces a leaderboard with top/bottom squads, average,
 * std deviation, and trend indicators. No presentation logic.
 * Render layer: shared/quality/cross-squad-benchmark-renderer.ts (deleted in a
 * later phase).
 *
 * @module cross-squad-benchmark
 */

import { rootLogger } from '../../logger.js';

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
    dataHub?: import('../../types/data-hub.js').DataHub,
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
            timestamp: dataHub?.timestamp.toISOString() ?? new Date().toISOString(),
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
        timestamp: dataHub?.timestamp.toISOString() ?? new Date().toISOString(),
    };
}
