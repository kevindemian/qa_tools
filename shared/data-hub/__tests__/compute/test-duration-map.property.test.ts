import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { MetricsRun, FlatTest } from '../../../types/data-hub.js';
import { calcTestDurationMap } from '../../compute/test-duration-map.js';

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

describe('Compute/test-duration-map — property-based', () => {
    it('all output durations are positive', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(
                fc.array(
                    fc.record({
                        title: fc.string({ minLength: 1, maxLength: 20 }),
                        duration: fc.nat({ max: 100000 }),
                    }),
                    { maxLength: 20 },
                ),
                (testData) => {
                    const tests = testData.map((t) => makeTest(t.title, t.duration));
                    const runs = [makeRun(tests)];
                    const result = calcTestDurationMap(runs);

                    for (const durations of Object.values(result)) {
                        for (const d of durations) {
                            expect(d).toBeGreaterThan(0);
                        }
                    }
                },
            ),
            { numRuns: 100 },
        );
    });

    it('no skipped tests in output', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(
                fc.array(
                    fc.record({
                        title: fc.string({ minLength: 1, maxLength: 20 }),
                        duration: fc.nat({ max: 100000 }),
                    }),
                    { maxLength: 20 },
                ),
                (testData) => {
                    const tests = testData.map((t) => makeTest(t.title, t.duration, 'skipped'));
                    const runs = [makeRun(tests)];
                    const result = calcTestDurationMap(runs);

                    expect(Object.keys(result)).toHaveLength(0);
                },
            ),
            { numRuns: 50 },
        );
    });

    it('output keys are a subset of input test titles', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(
                fc.array(
                    fc.record({
                        title: fc.string({ minLength: 1, maxLength: 20 }),
                        duration: fc.nat({ max: 100000 }),
                        state: fc.constantFrom('passed' as const, 'failed' as const, 'skipped' as const),
                    }),
                    { maxLength: 20 },
                ),
                (testData) => {
                    const tests = testData.map((t) => makeTest(t.title, t.duration, t.state));
                    const runs = [makeRun(tests)];
                    const result = calcTestDurationMap(runs);
                    const inputTitles = new Set(tests.filter((t) => t.state !== 'skipped').map((t) => t.title));

                    for (const key of Object.keys(result)) {
                        expect(inputTitles.has(key)).toBeTruthy();
                    }
                },
            ),
            { numRuns: 100 },
        );
    });
});
