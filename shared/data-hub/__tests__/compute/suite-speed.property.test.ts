import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { PipelineJob } from '../../../types/ci-cd.js';
import { calcSuiteSpeedP95 } from '../../compute/suite-speed.js';

const PipelineJobArb: fc.Arbitrary<PipelineJob> = fc.record({
    id: fc.nat({ max: 10000 }),
    name: fc.constant('test'),
    stage: fc.constant('test'),
    status: fc.constant('success'),
    duration: fc.float({ min: 0, max: 3600, noNaN: true }),
});

describe('Compute/suite-speed — property-based', () => {
    it('p95 of pipeline jobs is always >= 0', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(
                fc.array(fc.array(PipelineJobArb, { minLength: 0, maxLength: 20 }), { maxLength: 10 }),
                (jobArrays) => {
                    const map = new Map(jobArrays.map((jobs, i) => [i, jobs]));
                    const result = calcSuiteSpeedP95(map);

                    expect(result).toBeGreaterThanOrEqual(0);
                },
            ),
            { numRuns: 100 },
        );
    });

    it('p95 is always <= max duration in the dataset', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(fc.array(PipelineJobArb, { minLength: 1, maxLength: 20 }), (jobs) => {
                const map = new Map([[1, jobs]]);
                const p95 = calcSuiteSpeedP95(map);
                const maxDuration = Math.max(
                    ...jobs.filter((j) => j.duration != null && j.duration > 0).map((j) => (j.duration ?? 0) * 1000),
                );
                const boundedMax = maxDuration > 0 ? maxDuration : Infinity;

                expect(p95).toBeGreaterThanOrEqual(0);
                expect(p95).toBeLessThanOrEqual(boundedMax);
            }),
            { numRuns: 100 },
        );
    });
});
