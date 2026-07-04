import { describe, it, expect } from 'vitest';
import type { PipelineRun, PipelineJob } from '../../../types/ci-cd.js';
import { calcBranchBreakdown, calcTopFailingJobs } from '../../compute/branch-health.js';

function makeRun(id: number, branch: string, conclusion?: 'success' | 'failure'): PipelineRun {
    const run: PipelineRun = { id, head_branch: branch };
    if (conclusion !== undefined) run.conclusion = conclusion;
    return run;
}

function makeJob(name: string, status: string): PipelineJob {
    return { id: 1, name, stage: 'test', status };
}

describe('Compute/branch-health', () => {
    describe('CalcBranchBreakdown', () => {
        it('returns empty for no runs', () => {
            expect.hasAssertions();
            expect(calcBranchBreakdown([])).toStrictEqual({});
        });

        it('calculates single branch', () => {
            expect.hasAssertions();

            const runs = [makeRun(1, 'main', 'success'), makeRun(2, 'main', 'failure')];
            const result = calcBranchBreakdown(runs);

            expect(result['main']?.passRate).toBe(50);
            expect(result['main']?.count).toBe(2);
        });

        it('separates branches', () => {
            expect.hasAssertions();

            const runs = [
                makeRun(1, 'main', 'success'),
                makeRun(2, 'main', 'success'),
                makeRun(3, 'feature', 'failure'),
            ];
            const result = calcBranchBreakdown(runs);

            expect(result['main']?.passRate).toBe(100);
            expect(result['feature']?.passRate).toBe(0);
        });

        it('uses ref as fallback when head_branch is null', () => {
            expect.hasAssertions();

            const runs: PipelineRun[] = [{ id: 1, conclusion: 'success', ref: 'develop' }];
            const result = calcBranchBreakdown(runs);

            expect(result['develop']).toBeDefined();
            expect(result['develop']?.count).toBe(1);
        });

        it('uses unknown when both head_branch and ref are missing', () => {
            expect.hasAssertions();

            const runs: PipelineRun[] = [{ id: 1, conclusion: 'success' }];
            const result = calcBranchBreakdown(runs);

            expect(result['unknown']).toBeDefined();
        });
    });

    describe('CalcTopFailingJobs', () => {
        it('returns empty for no runs', () => {
            expect.hasAssertions();
            expect(calcTopFailingJobs([], new Map())).toStrictEqual([]);
        });

        it('returns empty when no jobs in map', () => {
            expect.hasAssertions();

            const runs = [makeRun(1, 'main')];

            expect(calcTopFailingJobs(runs, new Map())).toStrictEqual([]);
        });

        it('calculates failure rates', () => {
            expect.hasAssertions();

            const runs = [makeRun(1, 'main'), makeRun(2, 'main')];
            const jobsMap = new Map([
                [1, [makeJob('test', 'failure')]],
                [2, [makeJob('test', 'success')]],
            ]);
            const result = calcTopFailingJobs(runs, jobsMap);

            expect(result).toHaveLength(1);
            expect(result[0]?.name).toBe('test');
            expect(result[0]?.failureRate).toBe(50);
            expect(result[0]?.count).toBe(1);
        });

        it('returns max 10 results', () => {
            expect.hasAssertions();

            const runs = Array.from({ length: 15 }, (_, i) => makeRun(i, 'main'));
            const jobsMap = new Map<number, PipelineJob[]>();
            for (let i = 0; i < 15; i++) {
                jobsMap.set(i, [makeJob(`job-${i}`, 'failure')]);
            }
            const result = calcTopFailingJobs(runs, jobsMap);

            expect(result.length).toBeLessThanOrEqual(10);
        });

        it('sorts by failureRate descending', () => {
            expect.hasAssertions();

            const runs = [makeRun(1, 'main'), makeRun(2, 'main'), makeRun(3, 'main')];
            const jobsMap = new Map([
                [1, [makeJob('low', 'success'), makeJob('high', 'failure')]],
                [2, [makeJob('low', 'failure'), makeJob('high', 'failure')]],
                [3, [makeJob('low', 'success'), makeJob('high', 'failure')]],
            ]);
            const result = calcTopFailingJobs(runs, jobsMap);

            expect(result[0]?.name).toBe('high');
            expect(result[0]?.failureRate).toBe(100);
        });
    });
});
