/**
 * Defect Aggregation — Testes robustos.
 *
 * Testa aggregateDefectTrends e aggregateDefectSeasonality com PBT,
 * edge cases e testes negativos. Fluxo real — zero mocks internos.
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { aggregateDefectTrends, aggregateDefectSeasonality } from '../data-hub/compute/defect-aggregation.js';
import type { FailureClassification } from '../types/data-hub.js';

// ─── Arbitraries ────────────────────────────────────────────────────

const CategoryArb = fc.constantFrom('REVERT', 'FLAKY', 'REGRESSION', 'TIMEOUT', 'ENVIRONMENT', 'ASSERTION');

const FailureRecordArb: fc.Arbitrary<FailureClassification> = fc.record({
    timestamp: fc.constant('2026-03-15T14:30:00Z'),
    testTitle: fc.string({ minLength: 1, maxLength: 20 }),
    category: CategoryArb,
    project: fc.constant('qa_tools'),
});

function makeRecord(overrides: Partial<FailureClassification>): FailureClassification {
    return {
        timestamp: '2026-03-15T14:30:00Z',
        testTitle: 'test',
        category: 'REVERT',
        project: 'qa_tools',
        ...overrides,
    };
}

// ─── aggregateDefectTrends ──────────────────────────────────────────

describe('AggregateDefectTrends', () => {
    describe('Empty input', () => {
        it('returns empty result for empty array', () => {
            expect.hasAssertions();

            const r = aggregateDefectTrends([]);

            expect(r.trends).toHaveLength(0);
            expect(r.topCategories).toHaveLength(0);
            expect(r.totalRecords).toBe(0);
            expect(r.period.from).toBe('');
            expect(r.period.to).toBe('');
        });
    });

    describe('Mathematical invariants (PBT)', () => {
        it('totalRecords equals input length', () => {
            expect.hasAssertions();

            fc.assert(
                fc.property(fc.array(FailureRecordArb, { maxLength: 50 }), (records) => {
                    expect(aggregateDefectTrends(records).totalRecords).toBe(records.length);
                }),
                { numRuns: 100 },
            );
        });

        it('topCategories sorted by count descending', () => {
            expect.hasAssertions();

            fc.assert(
                fc.property(fc.array(FailureRecordArb, { minLength: 1, maxLength: 50 }), (records) => {
                    const r = aggregateDefectTrends(records);
                    for (let i = 1; i < r.topCategories.length; i++) {
                        const prevCount = r.topCategories[i - 1]?.count ?? 0;
                        const currCount = r.topCategories[i]?.count ?? 0;

                        expect(prevCount).toBeGreaterThanOrEqual(currCount);
                    }
                }),
                { numRuns: 100 },
            );
        });

        it('trends sorted by date ascending', () => {
            expect.hasAssertions();

            fc.assert(
                fc.property(fc.array(FailureRecordArb, { minLength: 1, maxLength: 30 }), (records) => {
                    const r = aggregateDefectTrends(records);

                    expect(r.trends.length).toBeGreaterThanOrEqual(0);

                    for (let i = 1; i < r.trends.length; i++) {
                        expect(r.trends[i - 1]?.date.localeCompare(r.trends[i]?.date ?? '')).toBeLessThanOrEqual(0);
                    }
                }),
                { numRuns: 100 },
            );
        });

        it('sum of trend totals equals number of valid records', () => {
            expect.hasAssertions();

            fc.assert(
                fc.property(fc.array(FailureRecordArb, { maxLength: 50 }), (records) => {
                    const r = aggregateDefectTrends(records);
                    const trendSum = r.trends.reduce((s, t) => s + t.total, 0);
                    const validCount = records.filter((rec) => {
                        const match = /^(\d{4}-\d{2}-\d{2})/.exec(rec.timestamp);
                        return match !== null;
                    }).length;

                    expect(trendSum).toBe(validCount);
                }),
                { numRuns: 100 },
            );
        });

        it('sum of topCategories count equals valid record count', () => {
            expect.hasAssertions();

            fc.assert(
                fc.property(fc.array(FailureRecordArb, { maxLength: 50 }), (records) => {
                    const r = aggregateDefectTrends(records);
                    const catSum = r.topCategories.reduce((s, c) => s + c.count, 0);
                    const validCount = records.filter((rec) => {
                        const match = /^(\d{4}-\d{2}-\d{2})/.exec(rec.timestamp);
                        return match !== null;
                    }).length;

                    expect(catSum).toBe(validCount);
                }),
                { numRuns: 100 },
            );
        });
    });

    describe('Single record', () => {
        it('single record produces single trend entry', () => {
            expect.hasAssertions();

            const records = [makeRecord({ timestamp: '2026-03-15T10:00:00Z', category: 'FLAKY' })];
            const r = aggregateDefectTrends(records);

            expect(r.trends).toHaveLength(1);
            expect(r.trends[0]?.date).toBe('2026-03-15');
            expect(r.trends[0]?.total).toBe(1);
            expect(r.trends[0]?.categories['FLAKY']).toBe(1);
        });

        it('single category in topCategories', () => {
            expect.hasAssertions();

            const records = [makeRecord({ category: 'REGRESSION' })];
            const r = aggregateDefectTrends(records);

            expect(r.topCategories).toHaveLength(1);
            expect(r.topCategories[0]?.category).toBe('REGRESSION');
            expect(r.topCategories[0]?.count).toBe(1);
        });
    });

    describe('Edge cases', () => {
        it('multiple records same date → aggregated trend', () => {
            expect.hasAssertions();

            const records = [
                makeRecord({ timestamp: '2026-03-15T10:00:00Z', category: 'FLAKY' }),
                makeRecord({ timestamp: '2026-03-15T14:00:00Z', category: 'REVERT' }),
            ];
            const r = aggregateDefectTrends(records);

            expect(r.trends).toHaveLength(1);
            expect(r.trends[0]?.total).toBe(2);
            expect(r.trends[0]?.categories['FLAKY']).toBe(1);
            expect(r.trends[0]?.categories['REVERT']).toBe(1);
        });

        it('period shows correct date range', () => {
            expect.hasAssertions();

            const records = [
                makeRecord({ timestamp: '2026-01-01T10:00:00Z' }),
                makeRecord({ timestamp: '2026-12-31T10:00:00Z' }),
            ];
            const r = aggregateDefectTrends(records);

            expect(r.period.from).toBe('2026-01-01');
            expect(r.period.to).toBe('2026-12-31');
        });
    });

    describe('Negative cases', () => {
        it('record with invalid timestamp is skipped', () => {
            expect.hasAssertions();

            const records = [
                makeRecord({ timestamp: 'not-a-date' }),
                makeRecord({ timestamp: '2026-03-15T10:00:00Z' }),
            ];
            const r = aggregateDefectTrends(records);

            expect(r.totalRecords).toBe(2);
            expect(r.trends).toHaveLength(1);
            expect(r.trends[0]?.total).toBe(1);
        });
    });
});

// ─── aggregateDefectSeasonality ─────────────────────────────────────

describe('AggregateDefectSeasonality', () => {
    describe('Empty input', () => {
        it('returns empty structure for empty array', () => {
            expect.hasAssertions();

            const r = aggregateDefectSeasonality([]);

            expect(r.byDayOfWeek).toHaveLength(7);
            expect(r.byHour).toHaveLength(24);
            expect(r.peakDay).toBe('');
            expect(r.peakHour).toBe(-1);
            expect(r.totalRecords).toBe(0);
        });
    });

    describe('Mathematical invariants (PBT)', () => {
        it('totalRecords equals input length', () => {
            expect.hasAssertions();

            fc.assert(
                fc.property(fc.array(FailureRecordArb, { maxLength: 50 }), (records) => {
                    expect(aggregateDefectSeasonality(records).totalRecords).toBe(records.length);
                }),
                { numRuns: 100 },
            );
        });

        it('byDayOfWeek always has 7 entries', () => {
            expect.hasAssertions();

            fc.assert(
                fc.property(fc.array(FailureRecordArb, { maxLength: 30 }), (records) => {
                    expect(aggregateDefectSeasonality(records).byDayOfWeek).toHaveLength(7);
                }),
                { numRuns: 50 },
            );
        });

        it('byHour always has 24 entries', () => {
            expect.hasAssertions();

            fc.assert(
                fc.property(fc.array(FailureRecordArb, { maxLength: 30 }), (records) => {
                    expect(aggregateDefectSeasonality(records).byHour).toHaveLength(24);
                }),
                { numRuns: 50 },
            );
        });

        it('sum of day totals + sum of hour totals > 0 when records exist', () => {
            expect.hasAssertions();

            fc.assert(
                fc.property(fc.array(FailureRecordArb, { minLength: 1, maxLength: 30 }), (records) => {
                    const r = aggregateDefectSeasonality(records);
                    const daySum = r.byDayOfWeek.reduce((s, d) => s + d.total, 0);
                    const hourSum = r.byHour.reduce((s, h) => s + h.total, 0);

                    expect(daySum).toBeGreaterThan(0);
                    expect(hourSum).toBeGreaterThan(0);
                }),
                { numRuns: 50 },
            );
        });
    });

    describe('Peak detection', () => {
        it('peakDay matches day with highest total', () => {
            expect.hasAssertions();

            const records = [
                makeRecord({ timestamp: '2026-03-16T10:00:00Z' }), // Tuesday
                makeRecord({ timestamp: '2026-03-16T11:00:00Z' }), // Tuesday
                makeRecord({ timestamp: '2026-03-17T10:00:00Z' }), // Wednesday
            ];
            const r = aggregateDefectSeasonality(records);

            expect(r.peakDay).toBe('Monday');
        });

        it('peakHour matches hour with highest total', () => {
            expect.hasAssertions();

            const records = [
                makeRecord({ timestamp: '2026-03-15T14:00:00Z' }),
                makeRecord({ timestamp: '2026-03-15T14:00:00Z' }),
                makeRecord({ timestamp: '2026-03-15T10:00:00Z' }),
            ];
            const r = aggregateDefectSeasonality(records);

            expect(r.peakHour).toBe(14);
        });
    });

    describe('Negative cases', () => {
        it('records with invalid timestamps are skipped', () => {
            expect.hasAssertions();

            const records = [makeRecord({ timestamp: 'invalid' }), makeRecord({ timestamp: '2026-03-15T14:00:00Z' })];
            const r = aggregateDefectSeasonality(records);

            expect(r.totalRecords).toBe(2);
            expect(r.byHour[14]?.total).toBe(1);
        });
    });
});
