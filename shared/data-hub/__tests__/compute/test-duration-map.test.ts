import { describe, it, expect } from 'vitest';
import { calcTestDurationMap } from '../../compute/test-duration-map.js';
import type { MetricsRun, FlatTest } from '../../../types/data-hub.js';

function makeTest(title: string, duration: number, state: 'passed' | 'failed' | 'skipped' = 'passed'): FlatTest {
    return { title, state, duration };
}

function makeRun(tests: FlatTest[]): MetricsRun {
    return {
        timestamp: '2026-07-08T10:00:00Z',
        project: 'test-project',
        total: tests.length,
        passed: tests.filter((t) => t.state === 'passed').length,
        failed: tests.filter((t) => t.state === 'failed').length,
        skipped: tests.filter((t) => t.state === 'skipped').length,
        duration: tests.reduce((sum, t) => sum + t.duration, 0),
        tests,
    };
}

function toPlain(obj: Record<string, unknown[]>): Record<string, unknown[]> {
    return Object.assign({}, obj);
}

describe('Compute/test-duration-map', () => {
    describe('CalcTestDurationMap', () => {
        it('returns empty object for empty runs', () => {
            expect.hasAssertions();
            expect(toPlain(calcTestDurationMap([]))).toStrictEqual({});
        });

        it('maps single test to its duration', () => {
            expect.hasAssertions();

            const runs = [makeRun([makeTest('test-A', 100)])];

            expect(toPlain(calcTestDurationMap(runs))).toStrictEqual({ 'test-A': [100] });
        });

        it('aggregates durations across runs', () => {
            expect.hasAssertions();

            const runs = [
                makeRun([makeTest('test-A', 100), makeTest('test-B', 200)]),
                makeRun([makeTest('test-A', 150), makeTest('test-B', 250)]),
            ];
            const result = toPlain(calcTestDurationMap(runs));

            expect(result['test-A']).toStrictEqual([100, 150]);
            expect(result['test-B']).toStrictEqual([200, 250]);
        });

        it('excludes skipped tests', () => {
            expect.hasAssertions();

            const runs = [
                makeRun([makeTest('test-A', 100), makeTest('test-B', 0, 'skipped'), makeTest('test-C', 300)]),
            ];
            const result = toPlain(calcTestDurationMap(runs));

            expect(result['test-A']).toStrictEqual([100]);
            expect(result['test-B']).toBeUndefined();
            expect(result['test-C']).toStrictEqual([300]);
        });

        it('excludes zero and negative durations', () => {
            expect.hasAssertions();

            const runs = [makeRun([makeTest('test-A', 100), makeTest('test-B', 0), makeTest('test-C', -50)])];
            const result = toPlain(calcTestDurationMap(runs));

            expect(result['test-A']).toStrictEqual([100]);
            expect(result['test-B']).toBeUndefined();
            expect(result['test-C']).toBeUndefined();
        });

        it('handles all skipped tests', () => {
            expect.hasAssertions();

            const runs = [makeRun([makeTest('test-A', 0, 'skipped'), makeTest('test-B', 0, 'skipped')])];

            expect(toPlain(calcTestDurationMap(runs))).toStrictEqual({});
        });
    });
});
