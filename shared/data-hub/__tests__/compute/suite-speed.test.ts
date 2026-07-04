import { describe, it, expect } from 'vitest';
import type { PipelineJob } from '../../../types/ci-cd.js';
import type { MetricsRun } from '../../../metrics.js';
import { calcSuiteSpeedP95, calcTestSuiteSpeed } from '../../compute/suite-speed.js';

function makeJob(duration: number): PipelineJob {
    return { id: 1, name: 'test', stage: 'test', status: 'success', duration };
}

describe('Compute/suite-speed', () => {
    describe('CalcSuiteSpeedP95', () => {
        it('returns 0 for empty map', () => {
            expect.hasAssertions();
            expect(calcSuiteSpeedP95(new Map())).toBe(0);
        });

        it('returns 0 when no jobs have duration', () => {
            expect.hasAssertions();

            const map = new Map([[1, [{ id: 1, name: 'test', stage: 'test', status: 'success' }]]]);

            expect(calcSuiteSpeedP95(map)).toBe(0);
        });

        it('returns single job duration in ms', () => {
            expect.hasAssertions();

            const map = new Map([[1, [makeJob(120)]]]);

            expect(calcSuiteSpeedP95(map)).toBe(120000);
        });

        it('calculates P95 correctly', () => {
            expect.hasAssertions();

            const jobs = Array.from({ length: 20 }, (_, i) => makeJob(i + 1));
            const map = new Map([[1, jobs]]);
            const result = calcSuiteSpeedP95(map);

            expect(result).toBe(19000);
        });

        it('ignores jobs with duration 0', () => {
            expect.hasAssertions();

            const map = new Map([[1, [makeJob(0), makeJob(100)]]]);

            expect(calcSuiteSpeedP95(map)).toBe(100000);
        });

        it('handles multiple runs', () => {
            expect.hasAssertions();

            const map = new Map([
                [1, [makeJob(100)]],
                [2, [makeJob(200)]],
            ]);
            const result = calcSuiteSpeedP95(map);

            expect(result).toBe(200000);
        });
    });

    describe('CalcTestSuiteSpeed', () => {
        it('returns 0 for empty runs', () => {
            expect.hasAssertions();
            expect(calcTestSuiteSpeed([])).toBe(0);
        });

        it('returns 0 when no tests have duration', () => {
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
                    tests: [{ title: 't', state: 'passed', duration: 0 }],
                },
            ];

            expect(calcTestSuiteSpeed(runs)).toBe(0);
        });

        it('calculates P95 of test durations', () => {
            expect.hasAssertions();

            const tests = Array.from({ length: 20 }, (_, i) => ({
                title: `test-${i}`,
                state: 'passed' as const,
                duration: (i + 1) * 10,
            }));
            const runs: MetricsRun[] = [
                {
                    timestamp: '2026-07-01',
                    project: 'p',
                    total: 20,
                    passed: 20,
                    failed: 0,
                    skipped: 0,
                    duration: 100,
                    tests,
                },
            ];
            const result = calcTestSuiteSpeed(runs);

            expect(result).toBe(190);
        });
    });
});
