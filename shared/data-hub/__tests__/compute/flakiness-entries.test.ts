/**
 * Unit tests for flakiness-entries compute module.
 *
 * Tests calcFlakinessEntries() and calculateFlakyTestRate().
 */
import { describe, it, expect } from 'vitest';
import { calcFlakinessEntries, calculateFlakyTestRate } from '../../compute/flakiness-entries.js';
import type { MetricsRun } from '../../../types/data-hub.js';

function makeMetricsRun(overrides?: Partial<MetricsRun>): MetricsRun {
    return {
        timestamp: '2026-01-01T10:00:00Z',
        project: 'test',
        total: 10,
        passed: 8,
        failed: 2,
        skipped: 0,
        duration: 1000,
        tests: [],
        ...overrides,
    };
}

function makeTest(title: string, state: 'passed' | 'failed' | 'skipped') {
    return { title, state, duration: 100 };
}

describe('FlakinessEntries', () => {
    describe('CalcFlakinessEntries', () => {
        it('returns empty for no runs', () => {
            expect.hasAssertions();
            expect(calcFlakinessEntries([])).toStrictEqual([]);
        });

        it('returns empty when all tests are consistent', () => {
            expect.hasAssertions();

            const runs = [
                makeMetricsRun({ tests: [makeTest('test A', 'passed'), makeTest('test B', 'passed')] }),
                makeMetricsRun({ tests: [makeTest('test A', 'passed'), makeTest('test B', 'passed')] }),
            ];

            expect(calcFlakinessEntries(runs)).toStrictEqual([]);
        });

        it('detects flaky test with mixed pass/fail', () => {
            expect.hasAssertions();

            const runs = [
                makeMetricsRun({ tests: [makeTest('flaky', 'passed')] }),
                makeMetricsRun({ tests: [makeTest('flaky', 'failed')] }),
                makeMetricsRun({ tests: [makeTest('flaky', 'passed')] }),
            ];

            const result = calcFlakinessEntries(runs);

            expect(result).toHaveLength(1);
            expect(result[0]?.title).toBe('flaky');
            expect(result[0]?.passCount).toBe(2);
            expect(result[0]?.failCount).toBe(1);
            expect(result[0]?.totalRuns).toBe(3);
        });

        it('respects minRuns parameter', () => {
            expect.hasAssertions();

            const runs = [
                makeMetricsRun({ tests: [makeTest('flaky', 'passed')] }),
                makeMetricsRun({ tests: [makeTest('flaky', 'failed')] }),
            ];

            // Default minRuns=2, test has 2 runs
            expect(calcFlakinessEntries(runs)).toHaveLength(1);

            // minRuns=3, test has only 2 runs
            expect(calcFlakinessEntries(runs, 3)).toHaveLength(0);
        });

        it('ignores tests that only pass or only fail', () => {
            expect.hasAssertions();

            const runs = [
                makeMetricsRun({ tests: [makeTest('always-pass', 'passed')] }),
                makeMetricsRun({ tests: [makeTest('always-pass', 'passed')] }),
                makeMetricsRun({ tests: [makeTest('always-fail', 'failed')] }),
                makeMetricsRun({ tests: [makeTest('always-fail', 'failed')] }),
            ];

            expect(calcFlakinessEntries(runs)).toHaveLength(0);
        });

        it('sorts by rate descending', () => {
            expect.hasAssertions();

            const runs = [
                makeMetricsRun({ tests: [makeTest('low-flaky', 'passed'), makeTest('high-flaky', 'passed')] }),
                makeMetricsRun({ tests: [makeTest('low-flaky', 'passed'), makeTest('high-flaky', 'failed')] }),
                makeMetricsRun({ tests: [makeTest('low-flaky', 'failed'), makeTest('high-flaky', 'failed')] }),
            ];

            const result = calcFlakinessEntries(runs);

            expect(result).toHaveLength(2);
            expect(result[0]?.title).toBe('high-flaky');
            expect(result[1]?.title).toBe('low-flaky');
        });
    });

    describe('CalculateFlakyTestRate', () => {
        it('returns 0 for no runs', () => {
            expect.hasAssertions();
            expect(calculateFlakyTestRate([])).toBe(0);
        });

        it('returns 0 when no flaky tests', () => {
            expect.hasAssertions();

            const runs = [
                makeMetricsRun({ tests: [makeTest('stable', 'passed')] }),
                makeMetricsRun({ tests: [makeTest('stable', 'passed')] }),
            ];

            expect(calculateFlakyTestRate(runs)).toBe(0);
        });

        it('returns 100 when all qualifying tests are flaky', () => {
            expect.hasAssertions();

            const runs = [
                makeMetricsRun({ tests: [makeTest('flaky A', 'passed'), makeTest('flaky B', 'passed')] }),
                makeMetricsRun({ tests: [makeTest('flaky A', 'failed'), makeTest('flaky B', 'failed')] }),
            ];

            expect(calculateFlakyTestRate(runs)).toBe(100);
        });

        it('calculates correct percentage with mixed tests', () => {
            expect.hasAssertions();

            // 1 flaky test, 1 stable test (always passes)
            // Both tests qualify (executed 2 times >= minRuns)
            // Only 1 is flaky = 1/2 = 50%
            const runs = [
                makeMetricsRun({ tests: [makeTest('flaky', 'passed'), makeTest('stable', 'passed')] }),
                makeMetricsRun({ tests: [makeTest('flaky', 'failed'), makeTest('stable', 'passed')] }),
            ];

            // flaky: pass=1, fail=1, executed=2 → qualifies (flaky)
            // stable: pass=2, fail=0, executed=2 → qualifies (not flaky, but has enough runs)
            // Qualifying tests = 2 (both have >= 2 runs)
            // Flaky tests = 1
            // Rate = 1/2 = 50%
            expect(calculateFlakyTestRate(runs)).toBe(50);
        });

        it('respects minRuns parameter', () => {
            expect.hasAssertions();

            const runs = [
                makeMetricsRun({ tests: [makeTest('flaky', 'passed')] }),
                makeMetricsRun({ tests: [makeTest('flaky', 'failed')] }),
            ];

            // Default minRuns=2, test qualifies
            expect(calculateFlakyTestRate(runs)).toBe(100);

            // minRuns=3, test doesn't qualify
            expect(calculateFlakyTestRate(runs, 3)).toBe(0);
        });
    });
});
