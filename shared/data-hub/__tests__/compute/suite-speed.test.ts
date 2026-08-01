import { describe, it, expect } from 'vitest';
import type { PipelineJob } from '../../../types/ci-cd.js';
import type { WorkflowRunTiming } from '../../../types/data-hub.js';
import { calcSuiteSpeedP95 } from '../../compute/suite-speed.js';

function makeJob(duration: number): PipelineJob {
    return { id: 1, name: 'test', stage: 'test', status: 'success', duration };
}

describe('Compute/Suite-speed', () => {
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

    describe('CalcSuiteSpeedP95 — timing path', () => {
        it('returns 0 when timing present but no jobs match a run', () => {
            expect.hasAssertions();

            const map = new Map<number, PipelineJob[]>([[1, []]]);
            const timing = new Map<number, WorkflowRunTiming>([[1, { run_duration_ms: 1000 }]]);

            expect(calcSuiteSpeedP95(map, timing)).toBe(0);
        });

        it.each<[string, Array<[string, PipelineJob['status']]>, number, number]>([
            [
                'uses run_duration_ms / jobCount for success jobs',
                [
                    ['a', 'success'],
                    ['b', 'success'],
                ],
                1000,
                500,
            ],
            [
                'counts failure jobs in the timing path',
                [
                    ['a', 'failure'],
                    ['b', 'success'],
                ],
                600,
                300,
            ],
            [
                'ignores skipped/pending jobs in the timing path',
                [
                    ['a', 'skipped'],
                    ['b', 'success'],
                ],
                800,
                400,
            ],
        ])('%s', (_name, jobSpecs, runDurationMs, expected) => {
            expect.hasAssertions();

            const jobs: PipelineJob[] = jobSpecs.map(([name, status], idx) => ({
                id: idx + 1,
                name,
                stage: 't',
                status,
                duration: 0,
            }));
            const map = new Map([[1, jobs]]);
            const timing = new Map<number, WorkflowRunTiming>([[1, { run_duration_ms: runDurationMs }]]);

            expect(calcSuiteSpeedP95(map, timing)).toBe(expected);
        });

        it('uses timing path (zero durations) even when job.duration is available', () => {
            expect.hasAssertions();

            const jobs: PipelineJob[] = [{ id: 1, name: 'a', stage: 't', status: 'success', duration: 5 }];
            const map = new Map([[1, jobs]]);
            const timing = new Map<number, WorkflowRunTiming>([[1, { run_duration_ms: 0 }]]);

            // timing path produces [0] for the success job and takes precedence over job.duration
            expect(calcSuiteSpeedP95(map, timing)).toBe(0);
        });
    });
});
