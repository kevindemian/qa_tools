import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { MetricsRun, FlatTest } from '../../../types/data-hub.js';
import { calcTestDurationP95 } from '../../compute/test-duration-p95.js';

function makeTest(title: string, duration: number, state: 'passed' | 'failed' | 'skipped' = 'passed'): FlatTest {
    return { title, state, duration };
}

function makeRunWithDurations(durations: number[]): MetricsRun {
    const tests = durations.map((d, i) => makeTest(`test-${i}`, d));
    return {
        timestamp: '2026-07-08T10:00:00Z',
        project: 'test-project',
        total: tests.length,
        passed: tests.length,
        failed: 0,
        skipped: 0,
        duration: durations.reduce((s, d) => s + d, 0),
        tests,
    };
}

describe('Compute/test-duration-p95 — property-based', () => {
    it('p95 is always >= 0', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(fc.array(fc.nat({ max: 100000 }), { maxLength: 50 }), (durations) => {
                const runs = durations.length > 0 ? [makeRunWithDurations(durations)] : [];
                const result = calcTestDurationP95(runs);

                expect(result).toBeGreaterThanOrEqual(0);
            }),
            { numRuns: 100 },
        );
    });

    it('p95 is never greater than max duration', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(fc.array(fc.nat({ max: 100000 }), { minLength: 1, maxLength: 50 }), (durations) => {
                const maxDuration = Math.max(...durations);
                const result = calcTestDurationP95([makeRunWithDurations(durations)]);

                expect(result).toBeLessThanOrEqual(maxDuration);
            }),
            { numRuns: 100 },
        );
    });

    it('p95 is at least the minimum duration', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(fc.array(fc.integer({ min: 1, max: 100000 }), { minLength: 1, maxLength: 50 }), (durations) => {
                const minDuration = Math.min(...durations);
                const result = calcTestDurationP95([makeRunWithDurations(durations)]);

                expect(result).toBeGreaterThanOrEqual(minDuration);
            }),
            { numRuns: 100 },
        );
    });

    it('single duration always returns that duration', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(fc.nat({ max: 100000 }), (d) => {
                expect(calcTestDurationP95([makeRunWithDurations([d])])).toBe(d);
            }),
            { numRuns: 50 },
        );
    });
});
