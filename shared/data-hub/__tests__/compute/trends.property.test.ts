import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { MetricsRun } from '../../../metrics.js';
import { calcTrendsFromPipelineRuns, calcTrendsFromMetricsRuns } from '../../compute/trends.js';

describe('Compute/trends — property-based', () => {
    it('pipeline trends pass rates are always 0-100', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(
                fc.array(
                    fc.record({
                        id: fc.nat({ max: 10000 }),
                        conclusion: fc.constantFrom('success' as const, 'failure' as const),
                        head_branch: fc.constant('main'),
                        created_at: fc.constant('2026-07-01T10:00:00Z'),
                    }),
                    { minLength: 0, maxLength: 20 },
                ),
                (runs) => {
                    const result = calcTrendsFromPipelineRuns(runs, 10);
                    for (const point of result) {
                        expect(point.passRate).toBeGreaterThanOrEqual(0);
                        expect(point.passRate).toBeLessThanOrEqual(100);
                    }
                },
            ),
            { numRuns: 100 },
        );
    });

    it('pipeline trends count is always 1', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(
                fc.array(
                    fc.record({
                        id: fc.nat({ max: 10000 }),
                        conclusion: fc.constant('success' as const),
                        head_branch: fc.constant('main'),
                        created_at: fc.constant('2026-07-01'),
                    }),
                    { minLength: 1, maxLength: 10 },
                ),
                (runs) => {
                    const result = calcTrendsFromPipelineRuns(runs);
                    for (const point of result) {
                        expect(point.count).toBe(1);
                    }
                },
            ),
            { numRuns: 50 },
        );
    });

    it('metrics trends pass rates are always 0-100', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(
                fc.tuple(fc.nat({ max: 100 }), fc.nat({ max: 100 }), fc.nat({ max: 100 })),
                ([total, passed, failed]) => {
                    const runs: MetricsRun[] = [
                        {
                            timestamp: '2026-07-01',
                            project: 'test',
                            total,
                            passed,
                            failed,
                            skipped: 0,
                            duration: 10,
                            tests: [],
                        },
                    ];
                    const result = calcTrendsFromMetricsRuns(runs, 10);
                    for (const point of result) {
                        expect(point.passRate).toBeGreaterThanOrEqual(0);
                        expect(point.passRate).toBeLessThanOrEqual(100);
                    }
                },
            ),
            { numRuns: 100 },
        );
    });

    it('metrics trends count equals passed + failed', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(fc.nat({ max: 50 }), fc.nat({ max: 50 }), (passed, failed) => {
                const runs: MetricsRun[] = [
                    {
                        timestamp: '2026-07-01',
                        project: 'test',
                        total: passed + failed,
                        passed,
                        failed,
                        skipped: 0,
                        duration: 10,
                        tests: [],
                    },
                ];
                const result = calcTrendsFromMetricsRuns(runs);

                expect(result[0]?.count).toBe(passed + failed);
            }),
            { numRuns: 100 },
        );
    });
});
