import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { PipelineRun } from '../../../types/ci-cd.js';
import type { MetricsRun } from '../../../metrics.js';
import {
    calcPipelinePassRate,
    calcPipelineFailRate,
    calcTestPassRate,
    calcExecutionRate,
} from '../../compute/pass-rate.js';

const PipelineRunArb: fc.Arbitrary<PipelineRun> = fc.record({
    id: fc.nat({ max: 10000 }),
    conclusion: fc.constantFrom('success' as const, 'failure' as const, 'cancelled' as const, 'skipped' as const),
    head_branch: fc.constant('main'),
});

describe('Compute/pass-rate — property-based', () => {
    it('pipeline pass rate is always between 0 and 100', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(fc.array(PipelineRunArb, { minLength: 0, maxLength: 20 }), (runs) => {
                const result = calcPipelinePassRate(runs);

                expect(result).toBeGreaterThanOrEqual(0);
                expect(result).toBeLessThanOrEqual(100);
            }),
            { numRuns: 100 },
        );
    });

    it('pipeline fail rate is always between 0 and 100', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(fc.array(PipelineRunArb, { minLength: 0, maxLength: 20 }), (runs) => {
                const result = calcPipelineFailRate(runs);

                expect(result).toBeGreaterThanOrEqual(0);
                expect(result).toBeLessThanOrEqual(100);
            }),
            { numRuns: 100 },
        );
    });

    it('pipeline pass rate + fail rate always sums to 100', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(fc.array(PipelineRunArb, { minLength: 1, maxLength: 20 }), (runs) => {
                const pass = calcPipelinePassRate(runs);
                const fail = calcPipelineFailRate(runs);

                expect(Math.round((pass + fail) * 100) / 100).toBe(100);
            }),
            { numRuns: 100 },
        );
    });

    it('empty runs always returns 0', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(fc.array(PipelineRunArb, { maxLength: 0 }), (runs) => {
                expect(calcPipelinePassRate(runs)).toBe(0);
            }),
            { numRuns: 50 },
        );
    });

    it('all success returns 100', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(fc.nat({ max: 50 }), (n) => {
                const runs = Array.from({ length: n + 1 }, (_, i) => ({
                    id: i,
                    conclusion: 'success' as const,
                    head_branch: 'main',
                }));

                expect(calcPipelinePassRate(runs)).toBe(100);
            }),
            { numRuns: 50 },
        );
    });

    it('test pass rate is always between 0 and 100', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(fc.nat({ max: 200 }), fc.nat({ max: 200 }), (passed, failed) => {
                const run: MetricsRun = {
                    timestamp: '2026-07-01',
                    project: 'test',
                    total: passed + failed,
                    passed,
                    failed,
                    skipped: 0,
                    duration: 0,
                    tests: [],
                };
                const result = calcTestPassRate(run);

                expect(result).toBeGreaterThanOrEqual(0);
                expect(result).toBeLessThanOrEqual(100);
            }),
            { numRuns: 100 },
        );
    });

    it('execution rate is always between 0 and 100', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(fc.nat({ max: 200 }), fc.nat({ max: 200 }), (passed, failed) => {
                const run: MetricsRun = {
                    timestamp: '2026-07-01',
                    project: 'test',
                    total: 200,
                    passed,
                    failed,
                    skipped: 0,
                    duration: 0,
                    tests: [],
                };
                const result = calcExecutionRate(run);

                expect(result).toBeGreaterThanOrEqual(0);
                expect(result).toBeLessThanOrEqual(100);
            }),
            { numRuns: 100 },
        );
    });
});
