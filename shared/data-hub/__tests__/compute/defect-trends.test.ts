/**
 * Unit tests for Defect Trends compute function.
 *
 * Tests the pure aggregation of failure classifications.
 */
import { describe, it, expect } from 'vitest';
import { calcDefectTrends } from '../../compute/defect-trends.js';
import type { FailureClassification } from '../../../metrics.js';

/* ── Helpers ────────────────────────────────────────────────────────────── */

function makeClassification(overrides?: Partial<FailureClassification>): FailureClassification {
    return {
        timestamp: '2026-01-01T10:00:00Z',
        testTitle: 'test example',
        category: 'unit',
        project: 'test-project',
        ...overrides,
    };
}

/* ── Tests ──────────────────────────────────────────────────────────────── */

describe('Compute/defect-trends', () => {
    it('returns empty result for empty classifications', () => {
        const result = calcDefectTrends([]);

        expect(result.trends).toHaveLength(0);
        expect(result.topCategories).toHaveLength(0);
    });

    it('groups classifications by date', () => {
        const classifications = [
            makeClassification({ timestamp: '2026-01-01T10:00:00Z', category: 'unit' }),
            makeClassification({ timestamp: '2026-01-01T14:00:00Z', category: 'e2e' }),
            makeClassification({ timestamp: '2026-01-02T10:00:00Z', category: 'unit' }),
        ];

        const result = calcDefectTrends(classifications);

        expect(result.trends).toHaveLength(2);

        const firstTrend = result.trends[0];

        expect(firstTrend?.date).toBe('2026-01-01');
        expect(firstTrend?.total).toBe(2);

        const secondTrend = result.trends[1];

        expect(secondTrend?.date).toBe('2026-01-02');
        expect(secondTrend?.total).toBe(1);
    });

    it('counts categories correctly', () => {
        const classifications = [
            makeClassification({ timestamp: '2026-01-01T10:00:00Z', category: 'unit' }),
            makeClassification({ timestamp: '2026-01-01T11:00:00Z', category: 'unit' }),
            makeClassification({ timestamp: '2026-01-01T12:00:00Z', category: 'integration' }),
        ];

        const result = calcDefectTrends(classifications);

        const trend = result.trends[0];

        expect(trend?.categories['unit']).toBe(2);
        expect(trend?.categories['integration']).toBe(1);
    });

    it('sorts top categories by count descending', () => {
        const classifications = [
            makeClassification({ category: 'unit' }),
            makeClassification({ category: 'unit' }),
            makeClassification({ category: 'unit' }),
            makeClassification({ category: 'e2e' }),
            makeClassification({ category: 'e2e' }),
            makeClassification({ category: 'integration' }),
        ];

        const result = calcDefectTrends(classifications);

        expect(result.topCategories).toHaveLength(3);

        const first = result.topCategories[0];

        expect(first?.category).toBe('unit');
        expect(first?.count).toBe(3);

        const second = result.topCategories[1];

        expect(second?.category).toBe('e2e');
        expect(second?.count).toBe(2);

        const third = result.topCategories[2];

        expect(third?.category).toBe('integration');
        expect(third?.count).toBe(1);
    });

    it('handles single classification', () => {
        const classifications = [makeClassification({ timestamp: '2026-01-01T10:00:00Z', category: 'flaky' })];

        const result = calcDefectTrends(classifications);

        expect(result.trends).toHaveLength(1);

        const trend = result.trends[0];

        expect(trend?.total).toBe(1);

        expect(result.topCategories).toHaveLength(1);
    });
});
