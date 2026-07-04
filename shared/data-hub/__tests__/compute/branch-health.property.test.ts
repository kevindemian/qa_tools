import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { PipelineRun, PipelineJob } from '../../../types/ci-cd.js';
import { calcBranchBreakdown, calcTopFailingJobs } from '../../compute/branch-health.js';

describe('Compute/branch-health — property-based', () => {
    it('branch pass rates are always 0-100', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(
                fc.array(
                    fc.record({
                        id: fc.nat({ max: 10000 }),
                        conclusion: fc.constantFrom('success' as const, 'failure' as const),
                        head_branch: fc.constantFrom('main', 'dev', 'feature'),
                    }),
                    { minLength: 0, maxLength: 20 },
                ),
                (runs) => {
                    const result = calcBranchBreakdown(runs);
                    for (const branch of Object.values(result)) {
                        expect(branch.passRate).toBeGreaterThanOrEqual(0);
                        expect(branch.passRate).toBeLessThanOrEqual(100);
                    }
                },
            ),
            { numRuns: 100 },
        );
    });

    it('top failing jobs always <= 10', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(fc.nat({ max: 30 }), (n) => {
                const runs: PipelineRun[] = Array.from({ length: n }, (_, i) => ({
                    id: i,
                    conclusion: 'success' as const,
                    head_branch: 'main',
                }));
                const jobsMap = new Map<number, PipelineJob[]>();
                for (let i = 0; i < n; i++) {
                    jobsMap.set(i, [{ id: 1, name: `job-${i}`, stage: 'test', status: 'failure' }]);
                }
                const result = calcTopFailingJobs(runs, jobsMap);

                expect(result.length).toBeLessThanOrEqual(10);
            }),
            { numRuns: 100 },
        );
    });

    it('failing job failure rates are always 0-100', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(
                fc.array(
                    fc.record({
                        id: fc.nat({ max: 10000 }),
                        conclusion: fc.constant('success' as const),
                        head_branch: fc.constant('main'),
                    }),
                    { minLength: 1, maxLength: 10 },
                ),
                fc.constantFrom('success', 'failure'),
                (runs, jobStatus) => {
                    const jobsMap = new Map(
                        runs.map((r) => [r.id, [{ id: 1, name: 'test', stage: 'test', status: jobStatus }]]),
                    );
                    const result = calcTopFailingJobs(runs, jobsMap);
                    for (const job of result) {
                        expect(job.failureRate).toBeGreaterThanOrEqual(0);
                        expect(job.failureRate).toBeLessThanOrEqual(100);
                    }
                },
            ),
            { numRuns: 100 },
        );
    });
});
