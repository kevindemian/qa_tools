import { describe, it, expect } from 'vitest';
import type { PipelineRun } from '../../../types/ci-cd.js';
import type { MetricsRun } from '../../../metrics.js';
import { calcTrendsFromPipelineRuns, calcTrendsFromMetricsRuns } from '../../compute/trends.js';

function makePipelineRun(id: number, branch: string, conclusion?: 'success' | 'failure'): PipelineRun {
    const run: PipelineRun = { id, head_branch: branch, created_at: '2026-07-01T10:00:00Z' };
    if (conclusion !== undefined) run.conclusion = conclusion;
    return run;
}

describe('Compute/trends', () => {
    describe('CalcTrendsFromPipelineRuns', () => {
        it('returns empty for no runs', () => {
            expect.hasAssertions();
            expect(calcTrendsFromPipelineRuns([])).toStrictEqual([]);
        });

        it('returns single trend point', () => {
            expect.hasAssertions();

            const runs = [makePipelineRun(1, 'main', 'success')];
            const result = calcTrendsFromPipelineRuns(runs);

            expect(result).toHaveLength(1);
            expect(result[0]?.passRate).toBe(100);
        });

        it('respects windowSize', () => {
            expect.hasAssertions();

            const runs = Array.from({ length: 20 }, (_, i) => makePipelineRun(i, 'main', 'success'));
            const result = calcTrendsFromPipelineRuns(runs, 5);

            expect(result).toHaveLength(5);
        });

        it('calculates mixed pass rates', () => {
            expect.hasAssertions();

            const runs = [makePipelineRun(1, 'main', 'success'), makePipelineRun(2, 'main', 'failure')];
            const result = calcTrendsFromPipelineRuns(runs, 10);

            expect(result).toHaveLength(2);
            expect(result[0]?.passRate).toBe(100);
            expect(result[1]?.passRate).toBe(0);
        });
    });

    describe('CalcTrendsFromMetricsRuns', () => {
        it('returns empty for no runs', () => {
            expect.hasAssertions();
            expect(calcTrendsFromMetricsRuns([])).toStrictEqual([]);
        });

        it('returns single trend point', () => {
            expect.hasAssertions();

            const runs: MetricsRun[] = [
                {
                    timestamp: '2026-07-01T10:00:00Z',
                    project: 'p',
                    total: 10,
                    passed: 8,
                    failed: 2,
                    skipped: 0,
                    duration: 60,
                    tests: [],
                },
            ];
            const result = calcTrendsFromMetricsRuns(runs);

            expect(result).toHaveLength(1);
            expect(result[0]?.passRate).toBe(80);
            expect(result[0]?.count).toBe(10);
        });

        it('respects windowSize', () => {
            expect.hasAssertions();

            const runs: MetricsRun[] = Array.from({ length: 20 }, (_, i) => ({
                timestamp: `2026-07-${String(i + 1).padStart(2, '0')}T10:00:00Z`,
                project: 'p',
                total: 10,
                passed: 8,
                failed: 2,
                skipped: 0,
                duration: 60,
                tests: [],
            }));
            const result = calcTrendsFromMetricsRuns(runs, 5);

            expect(result).toHaveLength(5);
        });

        it('handles zero executed tests', () => {
            expect.hasAssertions();

            const runs: MetricsRun[] = [
                {
                    timestamp: '2026-07-01',
                    project: 'p',
                    total: 0,
                    passed: 0,
                    failed: 0,
                    skipped: 0,
                    duration: 0,
                    tests: [],
                },
            ];
            const result = calcTrendsFromMetricsRuns(runs);

            expect(result[0]?.passRate).toBe(0);
        });
    });
});
