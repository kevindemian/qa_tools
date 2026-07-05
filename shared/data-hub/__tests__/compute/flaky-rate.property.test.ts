import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { PipelineRun, PipelineJob } from '../../../types/ci-cd.js';
import { calcFlakyFromPipelineRuns } from '../../compute/flaky-rate.js';

describe('Compute/flaky-rate — property-based', () => {
    it('pipeline flaky results always have rate 0-100', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(fc.integer({ min: 2, max: 10 }), fc.integer({ min: 0, max: 3 }), (numRuns, seed) => {
                const runs: PipelineRun[] = Array.from({ length: numRuns }, (_, i) => ({
                    id: i,
                    conclusion: 'success' as const,
                    head_branch: 'main',
                }));
                const jobsMap = new Map<number, PipelineJob[]>();
                for (let i = 0; i < numRuns; i++) {
                    const status = (seed + i) % 2 === 0 ? 'success' : 'failure';
                    jobsMap.set(i, [{ id: 1, name: 'test-job', stage: 'test', status }]);
                }
                const result = calcFlakyFromPipelineRuns(runs, jobsMap);
                for (const item of result) {
                    expect(item.rate).toBeGreaterThanOrEqual(0);
                    expect(item.rate).toBeLessThanOrEqual(100);
                }
            }),
            { numRuns: 100 },
        );
    });

    it('pipeline empty runs returns empty', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(fc.integer({ min: 0, max: 5 }), (n) => {
                const runs: PipelineRun[] = Array.from({ length: n }, (_, i) => ({
                    id: i,
                    conclusion: 'success' as const,
                    head_branch: 'main',
                }));
                const result = calcFlakyFromPipelineRuns(runs, new Map());

                expect(result).toStrictEqual([]);
            }),
            { numRuns: 50 },
        );
    });
});
