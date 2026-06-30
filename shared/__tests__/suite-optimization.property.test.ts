import fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';
import { analyzeSuiteOptimization, generateOptimizationHtml } from '../suite-optimization.js';

vi.mock('../logger', () => ({
    rootLogger: { error: vi.fn(), info: vi.fn(), child: vi.fn().mockReturnThis() },
}));

vi.mock('../config', () => ({
    default: { get: vi.fn(() => '') },
    get: vi.fn(() => ''),
}));

const testArb = fc.record({
    title: fc.stringMatching(/^[a-zA-Z0-9 _-]{1,20}$/),
    duration: fc.float({ min: 0, max: 60 }),
    flakiness: fc.float({ min: 0, max: 1 }),
});

const DEFAULT_SLOW = 5;
const DEFAULT_FLAKY = 0.3;

describe('AnalyzeSuiteOptimization — property-based', () => {
    it('totalTests matches input length', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(fc.array(testArb, { minLength: 0, maxLength: 15 }), (tests) => {
                const result = analyzeSuiteOptimization(tests);

                expect(result.totalTests).toBe(tests.length);
            }),
            { numRuns: 50 },
        );
    });

    it('totalDuration sums all durations with safe defaults', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(fc.array(testArb, { minLength: 0, maxLength: 15 }), (tests) => {
                const result = analyzeSuiteOptimization(tests);
                const expected = tests.reduce(
                    (s, t) =>
                        s +
                        (typeof t.duration === 'number' && Number.isFinite(t.duration) && t.duration >= 0
                            ? t.duration
                            : 0),
                    0,
                );

                expect(result.totalDuration).toBeCloseTo(expected, 5);
            }),
            { numRuns: 50 },
        );
    });

    it('sorts by impact descending then duration descending', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(fc.array(testArb, { minLength: 0, maxLength: 15 }), (tests) => {
                const result = analyzeSuiteOptimization(tests);
                const entries = result.optimizations;
                const impactOrder: Record<string, number> = { high: 3, medium: 2, low: 1 };
                for (let i = 1; i < entries.length; i++) {
                    const prevEntry: unknown = Reflect.get(entries, i - 1);
                    const currEntry: unknown = Reflect.get(entries, i);
                    if (prevEntry === undefined || prevEntry === null || currEntry === undefined || currEntry === null)
                        return;
                    const prevImpact = (prevEntry as { impact: string }).impact;
                    const currImpact = (currEntry as { impact: string }).impact;
                    const prev: unknown = Reflect.get(impactOrder, prevImpact);
                    const curr: unknown = Reflect.get(impactOrder, currImpact);
                    if (prev === undefined || prev === null || curr === undefined || curr === null) return;

                    expect(prev as number).toBeGreaterThanOrEqual(curr as number);

                    const pEntry = prevEntry as { duration: number };
                    const cEntry = currEntry as { duration: number };

                    expect(pEntry.duration).toBeGreaterThanOrEqual(
                        (prev as number) === (curr as number) ? cEntry.duration : pEntry.duration,
                    );
                }
            }),
            { numRuns: 50 },
        );
    });

    it('quarantine action for flakiness exceeding threshold', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(fc.array(testArb, { minLength: 1, maxLength: 10 }), (tests) => {
                const result = analyzeSuiteOptimization(tests);
                for (const entry of result.optimizations) {
                    expect(entry.flakiness > DEFAULT_FLAKY ? entry.action : 'quarantine').toBe('quarantine');
                    expect(entry.flakiness > DEFAULT_FLAKY ? entry.impact : 'high').toBe('high');
                }
            }),
            { numRuns: 50 },
        );
    });

    it('potentialSavings is bounded by totalDuration', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(fc.array(testArb, { minLength: 0, maxLength: 15 }), (tests) => {
                const result = analyzeSuiteOptimization(tests);

                expect(result.potentialSavings).toBeGreaterThanOrEqual(0);
                expect(result.potentialSavings).toBeLessThanOrEqual(result.totalDuration);
            }),
            { numRuns: 50 },
        );
    });

    it('zero potentialSavings when all tests are within thresholds', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(fc.array(testArb, { minLength: 0, maxLength: 10 }), (tests) => {
                const filtered = tests.filter((t) => {
                    const dur =
                        typeof t.duration === 'number' && Number.isFinite(t.duration) && t.duration >= 0
                            ? t.duration
                            : 0;
                    const flk =
                        typeof t.flakiness === 'number' && Number.isFinite(t.flakiness) && t.flakiness >= 0
                            ? t.flakiness
                            : 0;
                    return dur <= DEFAULT_SLOW && flk <= DEFAULT_FLAKY;
                });
                const result = analyzeSuiteOptimization(filtered);

                expect(result.potentialSavings).toBe(0);
            }),
            { numRuns: 50 },
        );
    });

    it('handles NaN, negative and infinite values as 0', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(
                fc.array(
                    fc.record({
                        title: fc.stringMatching(/^[a-zA-Z0-9 _-]{1,10}$/),
                        duration: fc.constantFrom(NaN, -1, -Infinity, Infinity),
                        flakiness: fc.constantFrom(NaN, -1, -Infinity, Infinity),
                    }),
                    { minLength: 0, maxLength: 5 },
                ),
                (tests) => {
                    const result = analyzeSuiteOptimization(tests);

                    expect(result.totalDuration).toBe(0);
                },
            ),
            { numRuns: 50 },
        );
    });
});

describe('GenerateOptimizationHtml — property-based', () => {
    it('always produces valid HTML', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(fc.array(testArb, { minLength: 0, maxLength: 10 }), (tests) => {
                const result = analyzeSuiteOptimization(tests);
                const html = generateOptimizationHtml(result, 'PBT');

                expect(html).toContain('<!DOCTYPE html>');
                expect(html).toContain('</html>');
            }),
            { numRuns: 50 },
        );
    });

    it('contains all test titles with non-none actions', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(fc.array(testArb, { minLength: 0, maxLength: 10 }), (tests) => {
                const result = analyzeSuiteOptimization(tests);
                const html = generateOptimizationHtml(result);
                for (const entry of result.optimizations) {
                    expect(html).toContain(entry.action !== 'none' ? entry.testTitle : '');
                }
            }),
            { numRuns: 50 },
        );
    });

    it('contains Total Tests metric card', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(fc.array(testArb, { minLength: 0, maxLength: 10 }), (tests) => {
                const result = analyzeSuiteOptimization(tests);
                const html = generateOptimizationHtml(result);

                expect(html).toContain('Total Tests');
                expect(html).toContain(String(result.totalTests));
            }),
            { numRuns: 50 },
        );
    });
});
