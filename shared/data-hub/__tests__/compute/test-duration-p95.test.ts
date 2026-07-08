import { describe, it, expect } from 'vitest';
import { calcTestDurationP95 } from '../../compute/test-duration-p95.js';
import type { MetricsRun, FlatTest } from '../../../types/data-hub.js';

function makeTest(overrides?: Partial<FlatTest>): FlatTest {
    return {
        title: 'test-A',
        state: 'passed',
        duration: 100,
        ...overrides,
    };
}

function makeRun(tests: FlatTest[], overrides?: Partial<MetricsRun>): MetricsRun {
    return {
        timestamp: '2026-07-08T10:00:00Z',
        project: 'test-project',
        total: tests.length,
        passed: tests.filter((t) => t.state === 'passed').length,
        failed: tests.filter((t) => t.state === 'failed').length,
        skipped: tests.filter((t) => t.state === 'skipped').length,
        duration: tests.reduce((sum, t) => sum + t.duration, 0),
        tests,
        ...overrides,
    };
}

describe('Compute/test-duration-p95', () => {
    describe('CalcTestDurationP95', () => {
        it('returns 0 for empty runs', () => {
            expect.hasAssertions();
            expect(calcTestDurationP95([])).toBe(0);
        });

        it('returns 0 when all tests are skipped', () => {
            expect.hasAssertions();

            const runs = [
                makeRun([makeTest({ state: 'skipped', duration: 0 }), makeTest({ state: 'skipped', duration: 0 })]),
            ];

            expect(calcTestDurationP95(runs)).toBe(0);
        });

        it('returns the single duration for one test', () => {
            expect.hasAssertions();

            const runs = [makeRun([makeTest({ duration: 500 })])];

            expect(calcTestDurationP95(runs)).toBe(500);
        });

        it('calculates correct P95 for sorted data', () => {
            expect.hasAssertions();

            // 10 tests, durations 10-100ms. P95 index = ceil(10*0.95)-1 = 9 (0-indexed)
            const tests = Array.from({ length: 10 }, (_, i) =>
                makeTest({ title: `test-${i}`, duration: (i + 1) * 10 }),
            );
            const runs = [makeRun(tests)];

            expect(calcTestDurationP95(runs)).toBe(100);
        });

        it('handles multiple runs by flattening durations', () => {
            expect.hasAssertions();

            const run1 = makeRun([makeTest({ duration: 100 }), makeTest({ title: 'test-b', duration: 200 })]);
            const run2 = makeRun([makeTest({ duration: 150 }), makeTest({ title: 'test-b', duration: 250 })]);
            const p95 = calcTestDurationP95([run1, run2]);

            // 4 durations: [100, 150, 200, 250]. P95 idx = ceil(4*0.95)-1 = 3
            expect(p95).toBe(250);
        });

        it('ignores skipped tests', () => {
            expect.hasAssertions();

            const tests = [
                makeTest({ duration: 100 }),
                makeTest({ title: 'test-b', state: 'skipped', duration: 0 }),
                makeTest({ title: 'test-c', duration: 200 }),
            ];
            const runs = [makeRun(tests)];

            // 2 non-skipped durations: [100, 200]. P95 idx = ceil(2*0.95)-1 = 1
            expect(calcTestDurationP95(runs)).toBe(200);
        });

        it('ignores zero and negative durations', () => {
            expect.hasAssertions();

            const tests = [
                makeTest({ duration: 100 }),
                makeTest({ title: 'test-b', duration: 0 }),
                makeTest({ title: 'test-c', duration: -50 }),
                makeTest({ title: 'test-d', duration: 200 }),
            ];
            const runs = [makeRun(tests)];

            expect(calcTestDurationP95(runs)).toBe(200);
        });
    });
});
