/**
 * Property-based tests for Defect Trends compute function.
 *
 * Invariants:
 * - Dates are always sorted ascending
 * - Counts are always >= 0
 * - Total equals sum of category counts
 * - Empty input always returns empty result
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { calcDefectTrends } from '../../compute/defect-trends.js';

/* ── Tests ──────────────────────────────────────────────────────────────── */

describe('Compute/defect-trends (PBT)', () => {
    it('dates are always sorted ascending', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(
                fc.array(
                    fc.record({
                        timestamp: fc.constant('2026-01-01T00:00:00Z'),
                        testTitle: fc.constant('test'),
                        category: fc.constant('unit'),
                        project: fc.constant('test'),
                    }),
                ),
                (classifications) => {
                    const result = calcDefectTrends(classifications);
                    const dates = result.trends.map((t) => t.date);
                    const sorted = [...dates].sort((a, b) => a.localeCompare(b));

                    expect(dates).toStrictEqual(sorted);
                },
            ),
            { numRuns: 100 },
        );
    });

    it('counts are always >= 0', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(
                fc.array(
                    fc.record({
                        timestamp: fc.constant('2026-01-01T00:00:00Z'),
                        testTitle: fc.constant('test'),
                        category: fc.constant('unit'),
                        project: fc.constant('test'),
                    }),
                ),
                (classifications) => {
                    const result = calcDefectTrends(classifications);
                    for (const trend of result.trends) {
                        expect(trend.total).toBeGreaterThanOrEqual(0);
                    }
                },
            ),
            { numRuns: 100 },
        );
    });

    it('total equals sum of category counts', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(
                fc.array(
                    fc.record({
                        timestamp: fc.constant('2026-01-01T00:00:00Z'),
                        testTitle: fc.constant('test'),
                        category: fc.constant('unit'),
                        project: fc.constant('test'),
                    }),
                ),
                (classifications) => {
                    const result = calcDefectTrends(classifications);
                    for (const trend of result.trends) {
                        const categorySum = Object.values(trend.categories).reduce((s, v) => s + v, 0);

                        expect(categorySum).toBe(trend.total);
                    }
                },
            ),
            { numRuns: 100 },
        );
    });

    it('empty input always returns empty result', () => {
        const result = calcDefectTrends([]);

        expect(result.trends).toHaveLength(0);
        expect(result.topCategories).toHaveLength(0);
    });
});
