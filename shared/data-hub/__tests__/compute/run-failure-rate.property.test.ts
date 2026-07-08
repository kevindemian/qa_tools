import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { MetricsRun, FlatTest } from '../../../types/data-hub.js';
import { calcRunFailureRate } from '../../compute/run-failure-rate.js';

function makeRunWithFailures(failedCount: number, totalCount: number): MetricsRun {
    const passed = totalCount - failedCount;
    const tests: FlatTest[] = Array.from({ length: totalCount }, (_, i) => ({
        title: `test-${i}`,
        state: i < passed ? 'passed' : 'failed',
        duration: 100,
    }));
    return {
        timestamp: '2026-07-08T10:00:00Z',
        project: 'test-project',
        total: totalCount,
        passed,
        failed: failedCount,
        skipped: 0,
        duration: totalCount * 100,
        tests,
    };
}

describe('Compute/run-failure-rate — property-based', () => {
    it('failure rate is always between 0 and 100', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(fc.nat({ max: 100 }), fc.nat({ max: 100 }), (failedRuns, totalRuns) => {
                const runs = Array.from({ length: totalRuns }, (_, i) =>
                    makeRunWithFailures(i < failedRuns ? 1 : 0, 5),
                );
                const result = calcRunFailureRate(runs);

                expect(result).toBeGreaterThanOrEqual(0);
                expect(result).toBeLessThanOrEqual(100);
            }),
            { numRuns: 100 },
        );
    });

    it('empty runs always returns 0', () => {
        expect.hasAssertions();
        expect(calcRunFailureRate([])).toBe(0);
    });

    it('all failed runs returns 100', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(fc.integer({ min: 1, max: 20 }), (n) => {
                const runs = Array.from({ length: n }, () => makeRunWithFailures(1, 5));

                expect(calcRunFailureRate(runs)).toBe(100);
            }),
            { numRuns: 30 },
        );
    });
});
