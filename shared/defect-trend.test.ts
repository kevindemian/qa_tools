/**
 * Tests for defect-trend — Defect Trend Dashboard aggregator and HTML generator.
 */

import { aggregateDefectTrends, generateDefectTrendHtml } from './defect-trend.js';
import type { FailureClassification } from './metrics.js';

describe('aggregateDefectTrends', () => {
    it('returns empty result for empty array', async () => {
        const result = aggregateDefectTrends([]);
        expect(result.trends).toEqual([]);
        expect(result.topCategories).toEqual([]);
        expect(result.period).toEqual({ from: '', to: '' });
    });

    it('returns empty result for null/undefined', async () => {
        const r1 = aggregateDefectTrends(null);
        expect(r1.trends).toEqual([]);
        expect(r1.topCategories).toEqual([]);

        const r2 = aggregateDefectTrends(undefined);
        expect(r2.trends).toEqual([]);
    });

    it('groups single day with multiple categories', async () => {
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

    it('handles multiple days with same category', async () => {
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

    it('sorts by date ascending', async () => {
        const input: FailureClassification[] = [
            { timestamp: '2026-06-03T00:00:00Z', testTitle: 't1', category: 'A', project: 'p' },
            { timestamp: '2026-06-01T00:00:00Z', testTitle: 't2', category: 'B', project: 'p' },
            { timestamp: '2026-06-02T00:00:00Z', testTitle: 't3', category: 'C', project: 'p' },
        ];

        const result = aggregateDefectTrends(input);
        expect(result.trends.map((t) => t.date)).toEqual(['2026-06-01', '2026-06-02', '2026-06-03']);
    });

    it('computes topCategories sorted by count descending', async () => {
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

describe('generateDefectTrendHtml', () => {
    it('shows no-data message for empty trends', async () => {
        const result = aggregateDefectTrends([]);
        const html = generateDefectTrendHtml(result);
        expect(html).toContain('<!DOCTYPE html>');
        expect(html).toContain('No defect data available.');
    });

    it('shows no-data message for null/undefined result trends', async () => {
        const html = generateDefectTrendHtml({ trends: [], topCategories: [], period: { from: '', to: '' } });
        expect(html).toContain('No defect data available.');
    });

    it('includes table and category names in HTML', async () => {
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

    it('renders metric cards for top categories', async () => {
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

    it('supports custom title', async () => {
        const result = aggregateDefectTrends([]);
        const html = generateDefectTrendHtml(result, 'Sprint 10 Defects');
        expect(html).toContain('Sprint 10 Defects');
    });

    it('escapes HTML in category names', async () => {
        const input: FailureClassification[] = [
            { timestamp: '2026-06-01T00:00:00Z', testTitle: 't1', category: '<script>alert(1)</script>', project: 'p' },
        ];
        const result = aggregateDefectTrends(input);
        const html = generateDefectTrendHtml(result);
        expect(html).toContain('&lt;script&gt;');
        expect(html).not.toContain('<script>alert');
    });

    it('includes theme toggle script', async () => {
        const result = aggregateDefectTrends([]);
        const html = generateDefectTrendHtml(result);
        expect(html).toContain('qa-report-theme');
        expect(html).toContain('prefers-color-scheme');
    });

    it('includes CSS variables from design tokens', async () => {
        const result = aggregateDefectTrends([]);
        const html = generateDefectTrendHtml(result);
        expect(html).toContain('--color-surface-page');
        expect(html).toContain('html.dark');
    });

    it('shows period range in heading', async () => {
        const input: FailureClassification[] = [
            { timestamp: '2026-06-01T00:00:00Z', testTitle: 't1', category: 'ASSERTION', project: 'p' },
            { timestamp: '2026-06-03T00:00:00Z', testTitle: 't2', category: 'TIMEOUT', project: 'p' },
        ];
        const result = aggregateDefectTrends(input);
        const html = generateDefectTrendHtml(result);
        expect(html).toContain('2026-06-01');
        expect(html).toContain('2026-06-03');
    });

    it('handles NaN in total gracefully', async () => {
        const result = {
            trends: [{ date: '2026-06-01', categories: { ASSERTION: NaN }, total: NaN }],
            topCategories: [{ category: 'ASSERTION', count: NaN }],
            period: { from: '2026-06-01', to: '2026-06-01' },
        };
        const html = generateDefectTrendHtml(result);
        expect(html).toContain('NaN');
    });
});
