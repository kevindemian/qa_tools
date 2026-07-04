import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { PipelineRun, PipelineJob } from '../../../types/ci-cd.js';
import type { MetricsRun } from '../../../metrics.js';
import { calcFlakyFromPipelineRuns, calcFlakyFromMetricsRuns, calcFlakyPercentage } from '../../compute/flaky-rate.js';

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

    it('metrics flaky rate always returns array', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(fc.nat({ max: 50 }), (n) => {
                const runs: MetricsRun[] = Array.from({ length: n }, (_, i) => ({
                    timestamp: `2026-07-${String(i + 1).padStart(2, '0')}`,
                    project: 'test',
                    total: 1,
                    passed: 1,
                    failed: 0,
                    skipped: 0,
                    duration: 10,
                    tests: [{ title: 'test-a', state: 'passed' as const, duration: 1 }],
                }));
                const result = calcFlakyFromMetricsRuns(runs);

                expect(Array.isArray(result)).toBeTruthy();
            }),
            { numRuns: 50 },
        );
    });

    it('flaky percentage is always 0-100', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(fc.nat({ max: 20 }), fc.nat({ max: 100 }), (flakyCount, totalQualifying) => {
                const flaky = Array.from({ length: flakyCount }, (_, i) => ({
                    title: `test-${i}`,
                    rate: 50,
                    runs: 3,
                }));
                const result = calcFlakyPercentage(flaky, totalQualifying);

                expect(result).toBeGreaterThanOrEqual(0);
                expect(result).toBeLessThanOrEqual(100);
            }),
            { numRuns: 100 },
        );
    });

    it('metrics flaky results always have rate 0-100', () => {
        expect.hasAssertions();

        const makeRun = (): import('../../../metrics.js').MetricsRun => ({
            timestamp: '2026-07-01',
            project: 'test',
            total: 2,
            passed: 1,
            failed: 1,
            skipped: 0,
            duration: 10,
            tests: [
                { title: 'test-x', state: 'passed', duration: 1 },
                { title: 'test-x', state: 'failed', duration: 1 },
            ],
        });
        fc.assert(
            fc.property(fc.integer({ min: 3, max: 10 }), (n) => {
                const runs = Array.from({ length: n }, makeRun);
                const result = calcFlakyFromMetricsRuns(runs);
                for (const item of result) {
                    expect(item.rate).toBeGreaterThanOrEqual(0);
                    expect(item.rate).toBeLessThanOrEqual(100);
                }
            }),
            { numRuns: 50 },
        );
    });
});
