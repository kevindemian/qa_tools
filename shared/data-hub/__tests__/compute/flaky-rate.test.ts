import { describe, it, expect } from 'vitest';
import type { PipelineRun, PipelineJob } from '../../../types/ci-cd.js';
import { calcFlakyFromPipelineRuns } from '../../compute/flaky-rate.js';

function makePipelineRun(id: number): PipelineRun {
    return { id, conclusion: 'success', head_branch: 'main' };
}

function makeJob(name: string, status: string): PipelineJob {
    return { id: 1, name, stage: 'test', status };
}

describe('Compute/flaky-rate', () => {
    describe('CalcFlakyFromPipelineRuns', () => {
        it('returns empty for no runs', () => {
            expect.hasAssertions();
            expect(calcFlakyFromPipelineRuns([], new Map())).toStrictEqual([]);
        });

        it('returns empty when all jobs have consistent status', () => {
            expect.hasAssertions();

            const runs = [makePipelineRun(1), makePipelineRun(2)];
            const jobsMap = new Map([
                [1, [makeJob('test', 'success')]],
                [2, [makeJob('test', 'success')]],
            ]);

            expect(calcFlakyFromPipelineRuns(runs, jobsMap)).toStrictEqual([]);
        });

        it('detects flaky job with mixed status', () => {
            expect.hasAssertions();

            const runs = [makePipelineRun(1), makePipelineRun(2), makePipelineRun(3)];
            const jobsMap = new Map([
                [1, [makeJob('test', 'success')]],
                [2, [makeJob('test', 'failure')]],
                [3, [makeJob('test', 'success')]],
            ]);
            const result = calcFlakyFromPipelineRuns(runs, jobsMap);

            expect(result).toHaveLength(1);
            expect(result[0]?.title).toBe('test');
            expect(result[0]?.rate).toBeGreaterThanOrEqual(33.32);
            expect(result[0]?.rate).toBeLessThanOrEqual(33.34);
            expect(result[0]?.runs).toBe(3);
        });

        it('ignores jobs with only 1 run', () => {
            expect.hasAssertions();

            const runs = [makePipelineRun(1)];
            const jobsMap = new Map([[1, [makeJob('test', 'failure')]]]);

            expect(calcFlakyFromPipelineRuns(runs, jobsMap)).toStrictEqual([]);
        });

        it('detects multiple flaky jobs', () => {
            expect.hasAssertions();

            const runs = [makePipelineRun(1), makePipelineRun(2)];
            const jobsMap = new Map([
                [1, [makeJob('a', 'success'), makeJob('b', 'failure')]],
                [2, [makeJob('a', 'failure'), makeJob('b', 'success')]],
            ]);
            const result = calcFlakyFromPipelineRuns(runs, jobsMap);

            expect(result).toHaveLength(2);
        });

        it('sorts by rate descending', () => {
            expect.hasAssertions();

            const runs = [makePipelineRun(1), makePipelineRun(2), makePipelineRun(3)];
            const jobsMap = new Map([
                [1, [makeJob('low', 'success'), makeJob('high', 'failure')]],
                [2, [makeJob('low', 'success'), makeJob('high', 'success')]],
                [3, [makeJob('low', 'failure'), makeJob('high', 'failure')]],
            ]);
            const result = calcFlakyFromPipelineRuns(runs, jobsMap);

            expect(result[0]?.title).toBe('high');
        });

        it('filters by branch when branch param provided (Gap 3)', () => {
            expect.hasAssertions();

            const mainRun1 = { ...makePipelineRun(1), head_branch: 'main' };
            const mainRun2 = { ...makePipelineRun(2), head_branch: 'main' };
            const featureRun1 = { ...makePipelineRun(3), head_branch: 'feature/x' };
            const featureRun2 = { ...makePipelineRun(4), head_branch: 'feature/x' };
            const jobsMap = new Map([
                [1, [makeJob('test', 'success')]],
                [2, [makeJob('test', 'success')]],
                [3, [makeJob('test', 'success')]],
                [4, [makeJob('test', 'failure')]],
            ]);

            // main: 'test' consistent (success, success) → not flaky.
            const mainOnly = calcFlakyFromPipelineRuns([mainRun1, mainRun2], jobsMap, 'main');
            // feature/x: 'test' mixed (success, failure) → flaky.
            const featureOnly = calcFlakyFromPipelineRuns([featureRun1, featureRun2], jobsMap, 'feature/x');

            expect(mainOnly).toStrictEqual([]);

            expect(featureOnly).toHaveLength(1);
        });
    });
});
