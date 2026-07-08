import { describe, it, expect } from 'vitest';
import { calcRunFailureRate } from '../../compute/run-failure-rate.js';
import type { MetricsRun, FlatTest } from '../../../types/data-hub.js';

function makeRun(failed: number, total: number): MetricsRun {
    const passed = total - failed;
    const tests: FlatTest[] = Array.from({ length: total }, (_, i) => ({
        title: `test-${i}`,
        state: i < passed ? 'passed' : 'failed',
        duration: 100,
    }));
    return {
        timestamp: '2026-07-08T10:00:00Z',
        project: 'test-project',
        total,
        passed,
        failed,
        skipped: 0,
        duration: total * 100,
        tests,
    };
}

describe('Compute/run-failure-rate', () => {
    describe('CalcRunFailureRate', () => {
        it('returns 0 for empty runs', () => {
            expect.hasAssertions();
            expect(calcRunFailureRate([])).toBe(0);
        });

        it('returns 0 when no run has failures', () => {
            expect.hasAssertions();

            const runs = [makeRun(0, 10), makeRun(0, 5), makeRun(0, 8)];

            expect(calcRunFailureRate(runs)).toBe(0);
        });

        it('returns 100 when every run has failures', () => {
            expect.hasAssertions();

            const runs = [makeRun(1, 10), makeRun(2, 5), makeRun(1, 8)];

            expect(calcRunFailureRate(runs)).toBe(100);
        });

        it('calculates correct percentage for mixed results', () => {
            expect.hasAssertions();

            // 4 runs: 2 with failures, 2 without
            const runs = [makeRun(1, 10), makeRun(0, 10), makeRun(1, 5), makeRun(0, 8)];

            expect(calcRunFailureRate(runs)).toBe(50);
        });

        it('counts a run as failed if it has even 1 failure', () => {
            expect.hasAssertions();

            const runs = [makeRun(1, 100), makeRun(0, 100)];

            expect(calcRunFailureRate(runs)).toBe(50);
        });

        it('handles single run with failure', () => {
            expect.hasAssertions();
            expect(calcRunFailureRate([makeRun(1, 10)])).toBe(100);
        });

        it('handles single run without failure', () => {
            expect.hasAssertions();
            expect(calcRunFailureRate([makeRun(0, 10)])).toBe(0);
        });

        it('rounds to 2 decimal places', () => {
            expect.hasAssertions();

            // 1 out of 3 runs has failures → 33.33%
            const runs = [makeRun(1, 10), makeRun(0, 10), makeRun(0, 10)];

            expect(calcRunFailureRate(runs)).toBeCloseTo(33.33, 1);
        });
    });
});
