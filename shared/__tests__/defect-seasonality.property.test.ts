import fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';
import { aggregateDefectSeasonality, generateSeasonalityHtml } from '../defect-seasonality.js';
import type { FailureClassification } from '../metrics.js';

vi.mock('../logger.js', () => ({
    rootLogger: { error: vi.fn(), info: vi.fn(), child: vi.fn().mockReturnThis() },
}));

vi.mock('../config.js', () => ({
    default: { get: vi.fn(() => '') },
    get: vi.fn(() => ''),
}));

const safeCat = fc.string({ minLength: 1, maxLength: 10 }).map((s) => s.replace(/[^a-zA-Z0-9 _.-]/g, '_'));

const dateArb = fc
    .date({ min: new Date('2020-01-01'), max: new Date('2026-12-31') })
    .filter((d) => !isNaN(d.getTime()))
    .map((d) => {
        const y = d.getUTCFullYear();
        const m = String(d.getUTCMonth() + 1).padStart(2, '0');
        const day = String(d.getUTCDate()).padStart(2, '0');
        const h = String(d.getUTCHours()).padStart(2, '0');
        const min = String(d.getUTCMinutes()).padStart(2, '0');
        const s = String(d.getUTCSeconds()).padStart(2, '0');
        return `${y}-${m}-${day}T${h}:${min}:${s}Z`;
    });

const classArb: fc.Arbitrary<FailureClassification> = fc
    .record({
        timestamp: dateArb,
        testTitle: safeCat,
        category: safeCat,
        project: safeCat,
    })
    .map((r) => ({
        timestamp: r.timestamp,
        testTitle: r.testTitle,
        category: r.category,
        project: r.project,
    }));

describe('AggregateDefectSeasonality — property-based', () => {
    it('totalRecords matches classification count', () => {
        fc.assert(
            fc.property(fc.array(classArb, { minLength: 0, maxLength: 20 }), (classes) => {
                const result = aggregateDefectSeasonality(classes);

                expect(result.totalRecords).toBe(classes.length);
            }),
            { numRuns: 50 },
        );
    });

    it('always returns 7 days and 24 hours', () => {
        fc.assert(
            fc.property(fc.array(classArb, { minLength: 0, maxLength: 20 }), (classes) => {
                const result = aggregateDefectSeasonality(classes);

                expect(result.byDayOfWeek).toHaveLength(7);
                expect(result.byHour).toHaveLength(24);
            }),
            { numRuns: 50 },
        );
    });

    it('day totals sum to totalRecords', () => {
        fc.assert(
            fc.property(fc.array(classArb, { minLength: 0, maxLength: 20 }), (classes) => {
                const result = aggregateDefectSeasonality(classes);
                const daySum = result.byDayOfWeek.reduce((s, d) => s + d.total, 0);

                expect(daySum).toBe(result.totalRecords);
            }),
            { numRuns: 50 },
        );
    });

    it('hour totals sum to totalRecords', () => {
        fc.assert(
            fc.property(fc.array(classArb, { minLength: 0, maxLength: 20 }), (classes) => {
                const result = aggregateDefectSeasonality(classes);
                const hourSum = result.byHour.reduce((s, h) => s + h.total, 0);

                expect(hourSum).toBe(result.totalRecords);
            }),
            { numRuns: 50 },
        );
    });

    it('peakDay matches the day with highest total', () => {
        fc.assert(
            fc.property(fc.array(classArb, { minLength: 1, maxLength: 20 }), (classes) => {
                const result = aggregateDefectSeasonality(classes);
                const maxTotal = Math.max(...result.byDayOfWeek.map((d) => d.total));
                const peakDayEntry = result.byDayOfWeek.find((d) => d.total === maxTotal);
                if (result.totalRecords > 0) {
                    if (peakDayEntry === undefined) return;

                    expect(result.peakDay).toBe(peakDayEntry.dayOfWeek);
                }
            }),
            { numRuns: 50 },
        );
    });

    it('peakHour matches the hour with highest total', () => {
        fc.assert(
            fc.property(fc.array(classArb, { minLength: 1, maxLength: 20 }), (classes) => {
                const result = aggregateDefectSeasonality(classes);
                const maxTotal = Math.max(...result.byHour.map((h) => h.total));
                const peakHourEntry = result.byHour.find((h) => h.total === maxTotal);
                if (result.totalRecords > 0) {
                    if (peakHourEntry === undefined) return;

                    expect(result.peakHour).toBe(peakHourEntry.hour);
                }
            }),
            { numRuns: 50 },
        );
    });

    it('generateSeasonalityHtml produces valid HTML', () => {
        fc.assert(
            fc.property(fc.array(classArb, { minLength: 0, maxLength: 10 }), (classes) => {
                const result = aggregateDefectSeasonality(classes);
                const html = generateSeasonalityHtml(result);

                expect(html).toContain('<!DOCTYPE html>');
                expect(html).toContain('</html>');
            }),
            { numRuns: 50 },
        );
    });
});
