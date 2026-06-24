/**
 * Property-based tests — Defect Trend HTML (FT-20)
 *
 * Invariants:
 * - generateDefectTrendHtml always produces valid HTML
 * - All categories appear in output
 * - All dates appear in output
 * - Empty trends always show no-data message
 */
import fc from 'fast-check';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { aggregateDefectTrends, generateDefectTrendHtml } from '../defect-trend.js';
import type { FailureClassification } from '../metrics.js';

vi.mock('../logger.js', () => ({
    rootLogger: { error: vi.fn(), info: vi.fn(), child: vi.fn().mockReturnThis() },
}));

vi.mock('../config.js', () => ({
    default: { get: vi.fn(() => '') },
    get: vi.fn(() => ''),
}));

const safeCat = fc.string({ minLength: 1, maxLength: 10 }).map((s) => s.replace(/[^a-zA-Z0-9 _.-]/g, '_'));

const dateArb = fc.date({ min: new Date('2020-01-01'), max: new Date('2026-12-31') }).map((d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
});

const classArb: fc.Arbitrary<FailureClassification> = fc
    .record({
        timestamp: dateArb.map((d) => d + 'T00:00:00Z'),
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

describe('GenerateDefectTrendHtml — property-based', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('always produces valid HTML', () => {
        fc.assert(
            fc.property(fc.array(classArb, { minLength: 0, maxLength: 10 }), (classes) => {
                const result = aggregateDefectTrends(classes);
                const html = generateDefectTrendHtml(result);

                expect(html).toContain('<!DOCTYPE html>');
                expect(html).toContain('</html>');
            }),
            { numRuns: 50 },
        );
    });

    it('contains all trend categories in output', () => {
        fc.assert(
            fc.property(fc.array(classArb, { minLength: 1, maxLength: 10 }), (classes) => {
                const result = aggregateDefectTrends(classes);
                const html = generateDefectTrendHtml(result);
                const allCats = new Set(classes.map((c) => c.category));
                for (const cat of allCats) {
                    expect(html).toContain(cat);
                }
            }),
            { numRuns: 50 },
        );
    });

    it('contains all trend dates in output', () => {
        fc.assert(
            fc.property(fc.array(classArb, { minLength: 1, maxLength: 10 }), (classes) => {
                const result = aggregateDefectTrends(classes);
                const html = generateDefectTrendHtml(result);
                const allDates = new Set(classes.map((c) => c.timestamp.slice(0, 10)));
                for (const date of allDates) {
                    expect(html).toContain(date);
                }
            }),
            { numRuns: 50 },
        );
    });

    it('shows no-data message when trends empty', () => {
        fc.assert(
            fc.property(fc.array(classArb, { minLength: 0, maxLength: 0 }), (classes) => {
                const result = aggregateDefectTrends(classes);
                const html = generateDefectTrendHtml(result);

                expect(html).toContain('No defect data available.');
            }),
            { numRuns: 50 },
        );
    });
});
