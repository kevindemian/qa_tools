import { describe, it, expect } from 'vitest';
import type { PipelineRun, PipelineJob } from '../../../types/ci-cd.js';
import type { MetricsRun } from '../../../metrics.js';
import { calcFlakyFromPipelineRuns, calcFlakyFromMetricsRuns, calcFlakyPercentage } from '../../compute/flaky-rate.js';

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
    });

    describe('CalcFlakyFromMetricsRuns', () => {
        it('returns empty for no runs', () => {
            expect.hasAssertions();
            expect(calcFlakyFromMetricsRuns([])).toStrictEqual([]);
        });

        it('returns empty when all tests have consistent results', () => {
            expect.hasAssertions();

            const runs: MetricsRun[] = [
                {
                    timestamp: '2026-07-01',
                    project: 'p',
                    total: 1,
                    passed: 1,
                    failed: 0,
                    skipped: 0,
                    duration: 10,
                    tests: [{ title: 'a', state: 'passed', duration: 1 }],
                },
                {
                    timestamp: '2026-07-02',
                    project: 'p',
                    total: 1,
                    passed: 1,
                    failed: 0,
                    skipped: 0,
                    duration: 10,
                    tests: [{ title: 'a', state: 'passed', duration: 1 }],
                },
            ];

            expect(calcFlakyFromMetricsRuns(runs)).toStrictEqual([]);
        });

        it('detects flaky test with mixed results', () => {
            expect.hasAssertions();

            const runs: MetricsRun[] = [
                {
                    timestamp: '2026-07-01',
                    project: 'p',
                    total: 1,
                    passed: 1,
                    failed: 0,
                    skipped: 0,
                    duration: 10,
                    tests: [{ title: 'flaky', state: 'passed', duration: 1 }],
                },
                {
                    timestamp: '2026-07-02',
                    project: 'p',
                    total: 1,
                    passed: 0,
                    failed: 1,
                    skipped: 0,
                    duration: 10,
                    tests: [{ title: 'flaky', state: 'failed', duration: 1 }],
                },
                {
                    timestamp: '2026-07-03',
                    project: 'p',
                    total: 1,
                    passed: 1,
                    failed: 0,
                    skipped: 0,
                    duration: 10,
                    tests: [{ title: 'flaky', state: 'passed', duration: 1 }],
                },
            ];
            const result = calcFlakyFromMetricsRuns(runs);

            expect(result).toHaveLength(1);
            expect(result[0]?.title).toBe('flaky');
            expect(result[0]?.rate).toBeGreaterThanOrEqual(33.32);
            expect(result[0]?.rate).toBeLessThanOrEqual(33.34);
        });

        it('respects minRuns config', () => {
            expect.hasAssertions();

            const runs: MetricsRun[] = [
                {
                    timestamp: '2026-07-01',
                    project: 'p',
                    total: 1,
                    passed: 1,
                    failed: 0,
                    skipped: 0,
                    duration: 10,
                    tests: [{ title: 'a', state: 'passed', duration: 1 }],
                },
                {
                    timestamp: '2026-07-02',
                    project: 'p',
                    total: 1,
                    passed: 0,
                    failed: 1,
                    skipped: 0,
                    duration: 10,
                    tests: [{ title: 'a', state: 'failed', duration: 1 }],
                },
            ];
            const result = calcFlakyFromMetricsRuns(runs, { minRuns: 3, quarantineThreshold: 30 });

            expect(result).toStrictEqual([]);
        });

        it('ignores skipped tests', () => {
            expect.hasAssertions();

            const runs: MetricsRun[] = [
                {
                    timestamp: '2026-07-01',
                    project: 'p',
                    total: 1,
                    passed: 1,
                    failed: 0,
                    skipped: 0,
                    duration: 10,
                    tests: [{ title: 'a', state: 'skipped', duration: 0 }],
                },
            ];

            expect(calcFlakyFromMetricsRuns(runs)).toStrictEqual([]);
        });
    });

    describe('CalcFlakyPercentage', () => {
        it('returns 0 for empty flaky results', () => {
            expect.hasAssertions();
            expect(calcFlakyPercentage([], 100)).toBe(0);
        });

        it('returns 0 for 0 qualifying items', () => {
            expect.hasAssertions();
            expect(calcFlakyPercentage([{ title: 'a', rate: 50, runs: 3 }], 0)).toBe(0);
        });

        it('calculates correct percentage', () => {
            expect.hasAssertions();
            expect(calcFlakyPercentage([{ title: 'a', rate: 50, runs: 3 }], 10)).toBe(10);
        });

        it('returns 100 when all qualifying items are flaky', () => {
            expect.hasAssertions();

            const flaky = [
                { title: 'a', rate: 50, runs: 3 },
                { title: 'b', rate: 60, runs: 4 },
            ];

            expect(calcFlakyPercentage(flaky, 2)).toBe(100);
        });
    });
});
