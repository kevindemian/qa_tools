/**
 * Tests for defect-trend — Defect Trend Dashboard aggregator and HTML generator.
 */

import { aggregateDefectTrends, generateDefectTrendHtml, sanitizeTrendResult } from './defect-trend.js';
import type { FailureClassification } from './metrics.js';

describe('aggregateDefectTrends', () => {
    it('returns empty result for empty array', () => {
        const result = aggregateDefectTrends([]);
        expect(result.trends).toEqual([]);
        expect(result.topCategories).toEqual([]);
        expect(result.period).toEqual({ from: '', to: '' });
    });

    it('preserves prototype-polluting category name', () => {
        const poison = String.fromCharCode(95, 95, 112, 114, 111, 116, 111, 95, 95);
        const input: FailureClassification[] = [
            { timestamp: '2026-06-01T10:00:00Z', testTitle: 't1', category: poison, project: 'p' },
            { timestamp: '2026-06-01T11:00:00Z', testTitle: 't2', category: 'NORMAL', project: 'p' },
        ];
        const result = aggregateDefectTrends(input);
        const topCats = result.topCategories.map((c) => c.category);
        expect(topCats).toContain(poison);
        expect(topCats).toContain('NORMAL');
        expect(result.trends).toHaveLength(1);
        expect(result.trends[0]).toBeDefined();
        const cats = result.trends[0]?.categories ?? {};
        expect(Object.keys(cats)).toContain(poison);
        expect(Object.keys(cats)).toContain('NORMAL');
    });

    it('returns empty result for null/undefined', () => {
        const r1 = aggregateDefectTrends(null);
        expect(r1.trends).toEqual([]);
        expect(r1.topCategories).toEqual([]);

        const r2 = aggregateDefectTrends(undefined);
        expect(r2.trends).toEqual([]);
    });

    it('groups single day with multiple categories', () => {
        const input: FailureClassification[] = [
            { timestamp: '2026-06-01T10:00:00Z', testTitle: 't1', category: 'ASSERTION', project: 'proj' },
            { timestamp: '2026-06-01T11:00:00Z', testTitle: 't2', category: 'TIMEOUT', project: 'proj' },
            { timestamp: '2026-06-01T12:00:00Z', testTitle: 't3', category: 'ASSERTION', project: 'proj' },
        ];

        const result = aggregateDefectTrends(input);
        expect(result.trends).toHaveLength(1);
        expect(result.trends[0]?.date).toBe('2026-06-01');
        expect(result.trends[0]?.categories).toEqual({ ASSERTION: 2, TIMEOUT: 1 });
        expect(result.trends[0]?.total).toBe(3);
        expect(result.period).toEqual({ from: '2026-06-01', to: '2026-06-01' });
    });

    it('handles multiple days with same category', () => {
        const input: FailureClassification[] = [
            { timestamp: '2026-05-31T08:00:00Z', testTitle: 't1', category: 'ASSERTION', project: 'p' },
            { timestamp: '2026-06-01T09:00:00Z', testTitle: 't2', category: 'ASSERTION', project: 'p' },
            { timestamp: '2026-06-01T10:00:00Z', testTitle: 't3', category: 'ASSERTION', project: 'p' },
            { timestamp: '2026-06-02T11:00:00Z', testTitle: 't4', category: 'TIMEOUT', project: 'p' },
        ];

        const result = aggregateDefectTrends(input);
        expect(result.trends).toHaveLength(3);
        expect(result.trends[0]?.date).toBe('2026-05-31');
        expect(result.trends[0]?.categories).toEqual({ ASSERTION: 1 });
        expect(result.trends[0]?.total).toBe(1);
        expect(result.trends[1]?.date).toBe('2026-06-01');
        expect(result.trends[1]?.categories).toEqual({ ASSERTION: 2 });
        expect(result.trends[1]?.total).toBe(2);
        expect(result.trends[2]?.date).toBe('2026-06-02');
        expect(result.trends[2]?.categories).toEqual({ TIMEOUT: 1 });
        expect(result.trends[2]?.total).toBe(1);
    });

    it('sorts by date ascending', () => {
        const input: FailureClassification[] = [
            { timestamp: '2026-06-03T00:00:00Z', testTitle: 't1', category: 'A', project: 'p' },
            { timestamp: '2026-06-01T00:00:00Z', testTitle: 't2', category: 'B', project: 'p' },
            { timestamp: '2026-06-02T00:00:00Z', testTitle: 't3', category: 'C', project: 'p' },
        ];

        const result = aggregateDefectTrends(input);
        expect(result.trends.map((t) => t.date)).toEqual(['2026-06-01', '2026-06-02', '2026-06-03']);
    });

    it('computes topCategories sorted by count descending', () => {
        const input: FailureClassification[] = [
            { timestamp: '2026-06-01T00:00:00Z', testTitle: 't1', category: 'TIMEOUT', project: 'p' },
            { timestamp: '2026-06-01T01:00:00Z', testTitle: 't2', category: 'ASSERTION', project: 'p' },
            { timestamp: '2026-06-01T02:00:00Z', testTitle: 't3', category: 'TIMEOUT', project: 'p' },
            { timestamp: '2026-06-01T03:00:00Z', testTitle: 't4', category: 'ENV', project: 'p' },
            { timestamp: '2026-06-01T04:00:00Z', testTitle: 't5', category: 'ASSERTION', project: 'p' },
            { timestamp: '2026-06-01T05:00:00Z', testTitle: 't6', category: 'ASSERTION', project: 'p' },
        ];

        const result = aggregateDefectTrends(input);
        expect(result.topCategories).toHaveLength(3);
        expect(result.topCategories[0]).toEqual({ category: 'ASSERTION', count: 3 });
        expect(result.topCategories[1]).toEqual({ category: 'TIMEOUT', count: 2 });
        expect(result.topCategories[2]).toEqual({ category: 'ENV', count: 1 });
    });
});

describe('sanitizeTrendResult', () => {
    it('converts NaN to zero', () => {
        const input = {
            trends: [{ date: '2026-01-01', categories: { A: NaN }, total: NaN }],
            topCategories: [{ category: 'A', count: NaN }],
            period: { from: '2026-01-01', to: '2026-01-01' },
        };
        const result = sanitizeTrendResult(input);
        expect(result.trends[0]?.total).toBe(0);
        expect(result.trends[0]?.categories['A']).toBe(0);
        expect(result.topCategories[0]?.count).toBe(0);
    });

    it('converts Infinity to zero', () => {
        const input = {
            trends: [
                { date: '2026-01-01', categories: { A: Number.POSITIVE_INFINITY }, total: Number.NEGATIVE_INFINITY },
            ],
            topCategories: [{ category: 'A', count: Number.POSITIVE_INFINITY }],
            period: { from: '2026-01-01', to: '2026-01-01' },
        };
        const result = sanitizeTrendResult(input);
        expect(result.trends[0]?.total).toBe(0);
        expect(result.trends[0]?.categories['A']).toBe(0);
        expect(result.topCategories[0]?.count).toBe(0);
    });

    it('preserves valid finite numbers', () => {
        const input = {
            trends: [{ date: '2026-01-01', categories: { A: 5 }, total: 10 }],
            topCategories: [{ category: 'A', count: 5 }],
            period: { from: '2026-01-01', to: '2026-01-01' },
        };
        const result = sanitizeTrendResult(input);
        expect(result.trends[0]?.total).toBe(10);
        expect(result.trends[0]?.categories['A']).toBe(5);
        expect(result.topCategories[0]?.count).toBe(5);
    });

    it('preserves rest structure', () => {
        const input = {
            trends: [],
            topCategories: [],
            period: { from: '2026-01-01', to: '2026-01-10' },
        };
        const result = sanitizeTrendResult(input);
        expect(result.period).toEqual({ from: '2026-01-01', to: '2026-01-10' });
    });
});

describe('generateDefectTrendHtml', () => {
    it('shows no-data message for empty trends', () => {
        const result = aggregateDefectTrends([]);
        const html = generateDefectTrendHtml(result);
        expect(html).toContain('<!DOCTYPE html>');
        expect(html).toContain('No defect data available.');
    });

    it('shows no-data message for null/undefined result trends', () => {
        const html = generateDefectTrendHtml({ trends: [], topCategories: [], period: { from: '', to: '' } });
        expect(html).toContain('No defect data available.');
    });

    it('includes table and category names in HTML', () => {
        const input: FailureClassification[] = [
            { timestamp: '2026-06-01T10:00:00Z', testTitle: 't1', category: 'ASSERTION', project: 'p' },
            { timestamp: '2026-06-01T11:00:00Z', testTitle: 't2', category: 'TIMEOUT', project: 'p' },
        ];
        const result = aggregateDefectTrends(input);
        const html = generateDefectTrendHtml(result);

        expect(html).toContain('<!DOCTYPE html>');
        expect(html).toContain('<table');
        expect(html).toContain('ASSERTION');
        expect(html).toContain('TIMEOUT');
        expect(html).toContain('2026-06-01');
        expect(html).toContain('Defect Trend Dashboard');
    });

    it('renders metric cards for top categories', () => {
        const input: FailureClassification[] = [
            { timestamp: '2026-06-01T00:00:00Z', testTitle: 't1', category: 'ASSERTION', project: 'p' },
            { timestamp: '2026-06-01T01:00:00Z', testTitle: 't2', category: 'TIMEOUT', project: 'p' },
        ];
        const result = aggregateDefectTrends(input);
        const html = generateDefectTrendHtml(result);

        expect(html).toContain('data-component="metric-card"');
        expect(html).toContain('ASSERTION');
        expect(html).toContain('TIMEOUT');
    });

    it('supports custom title', () => {
        const result = aggregateDefectTrends([]);
        const html = generateDefectTrendHtml(result, 'Sprint 10 Defects');
        expect(html).toContain('Sprint 10 Defects');
    });

    it('escapes HTML in category names', () => {
        const input: FailureClassification[] = [
            { timestamp: '2026-06-01T00:00:00Z', testTitle: 't1', category: '<script>alert(1)</script>', project: 'p' },
        ];
        const result = aggregateDefectTrends(input);
        const html = generateDefectTrendHtml(result);
        expect(html).toContain('&lt;script&gt;');
        expect(html).not.toContain('<script>alert');
    });

    it('includes theme toggle script', () => {
        const result = aggregateDefectTrends([]);
        const html = generateDefectTrendHtml(result);
        expect(html).toContain('qa-report-theme');
        expect(html).toContain('prefers-color-scheme');
    });

    it('includes CSS variables from design tokens', () => {
        const result = aggregateDefectTrends([]);
        const html = generateDefectTrendHtml(result);
        expect(html).toContain('--color-surface-page');
        expect(html).toContain('html.dark');
    });

    it('shows period range in heading', () => {
        const input: FailureClassification[] = [
            { timestamp: '2026-06-01T00:00:00Z', testTitle: 't1', category: 'ASSERTION', project: 'p' },
            { timestamp: '2026-06-03T00:00:00Z', testTitle: 't2', category: 'TIMEOUT', project: 'p' },
        ];
        const result = aggregateDefectTrends(input);
        const html = generateDefectTrendHtml(result);
        expect(html).toContain('2026-06-01');
        expect(html).toContain('2026-06-03');
    });

    it('sanitizes NaN and Infinity to zero in output', () => {
        const result = {
            trends: [
                {
                    date: '2026-06-01',
                    categories: { ASSERTION: NaN, TIMEOUT: Number.POSITIVE_INFINITY, ENV: 3 },
                    total: NaN,
                },
            ],
            topCategories: [
                { category: 'ASSERTION', count: NaN },
                { category: 'TIMEOUT', count: Number.POSITIVE_INFINITY },
                { category: 'ENV', count: 3 },
            ],
            period: { from: '2026-06-01', to: '2026-06-01' },
        };
        const html = generateDefectTrendHtml(result);
        expect(html).not.toContain('NaN');
        expect(html).not.toContain('Infinity');
        expect(html).toContain('>0<');
        expect(html).toContain('>3<');
    });
});
