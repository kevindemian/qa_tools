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

        it('uses run_duration_ms / jobCount for success jobs', () => {
            expect.hasAssertions();

            const jobs: PipelineJob[] = [
                { id: 1, name: 'a', stage: 't', status: 'success', duration: 0 },
                { id: 2, name: 'b', stage: 't', status: 'success', duration: 0 },
            ];
            const map = new Map([[1, jobs]]);
            const timing = new Map<number, WorkflowRunTiming>([[1, { run_duration_ms: 1000 }]]);

            // 1000ms / 2 jobs = 500ms per job, both counted → P95 = 500
            expect(calcSuiteSpeedP95(map, timing)).toBe(500);
        });

        it('counts failure jobs in the timing path', () => {
            expect.hasAssertions();

            const jobs: PipelineJob[] = [
                { id: 1, name: 'a', stage: 't', status: 'failure', duration: 0 },
                { id: 2, name: 'b', stage: 't', status: 'success', duration: 0 },
            ];
            const map = new Map([[1, jobs]]);
            const timing = new Map<number, WorkflowRunTiming>([[1, { run_duration_ms: 600 }]]);

            expect(calcSuiteSpeedP95(map, timing)).toBe(300);
        });

        it('ignores skipped/pending jobs in the timing path', () => {
            expect.hasAssertions();

            const jobs: PipelineJob[] = [
                { id: 1, name: 'a', stage: 't', status: 'skipped', duration: 0 },
                { id: 2, name: 'b', stage: 't', status: 'success', duration: 0 },
            ];
            const map = new Map([[1, jobs]]);
            const timing = new Map<number, WorkflowRunTiming>([[1, { run_duration_ms: 800 }]]);

            // only the success job (1 of 2) counts → 800 / 2 = 400
            expect(calcSuiteSpeedP95(map, timing)).toBe(400);
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
