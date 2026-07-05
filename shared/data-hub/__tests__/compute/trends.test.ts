import { describe, it, expect } from 'vitest';
import type { PipelineRun } from '../../../types/ci-cd.js';
import { calcTrendsFromPipelineRuns } from '../../compute/trends.js';

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
});
