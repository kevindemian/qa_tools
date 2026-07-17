import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FailureClassification } from '../../types/data-hub.js';
import type { SeasonalityResult } from '../../defect-seasonality.js';
import * as reportStyles from '../../report-styles.js';

vi.mock('../../logger.js', () => ({
    rootLogger: { error: vi.fn(), info: vi.fn(), child: vi.fn().mockReturnThis() },
}));

vi.mock('../../config-accessor.js', () => ({
    default: { get: vi.fn(() => '') },
    get: vi.fn(() => ''),
}));

function makeClassifications(): FailureClassification[] {
    return [
        { timestamp: '2026-06-01T10:00:00Z', testTitle: 't1', category: 'ASSERTION', project: 'p1' },
        { timestamp: '2026-06-01T10:30:00Z', testTitle: 't2', category: 'TIMEOUT', project: 'p1' },
        { timestamp: '2026-06-01T15:00:00Z', testTitle: 't3', category: 'ASSERTION', project: 'p1' },
        { timestamp: '2026-06-02T09:00:00Z', testTitle: 't4', category: 'ENVIRONMENT', project: 'p1' },
    ];
}

describe('Integration: Defect Seasonality (FT-21)', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    describe('FT-21a: aggregateDefectSeasonality with data', () => {
        it('groups by day and hour', async () => {
            expect.hasAssertions();

            const { aggregateDefectSeasonality } = await import('../../defect-seasonality.js');
            const result = aggregateDefectSeasonality(makeClassifications());

            expect(result.totalRecords).toBe(4);
            expect(result.peakDay).toBe('Mon');
            expect(result.peakHour).toBe(10);
            expect(result.byDayOfWeek).toHaveLength(7);
            expect(result.byHour).toHaveLength(24);
        });

        it('returns correct day distribution', async () => {
            expect.hasAssertions();

            const { aggregateDefectSeasonality } = await import('../../defect-seasonality.js');
            const result = aggregateDefectSeasonality(makeClassifications());
            const monday = result.byDayOfWeek.find((d) => d.dayOfWeek === 'Mon');
            if (monday === undefined) throw new Error('Monday not found');

            expect(monday.total).toBe(3);

            const tuesday = result.byDayOfWeek.find((d) => d.dayOfWeek === 'Tue');
            if (tuesday === undefined) throw new Error('Tuesday not found');

            expect(tuesday.total).toBe(1);
        });
    });

    describe('FT-21b: empty data', () => {
        it('returns zero-filled result for empty array', async () => {
            expect.hasAssertions();

            const { aggregateDefectSeasonality } = await import('../../defect-seasonality.js');
            const result = aggregateDefectSeasonality([]);

            expect(result.totalRecords).toBe(0);
            expect(result.peakDay).toBe('N/A');
            expect(result.peakHour).toBe(-1);
            expect(result.byDayOfWeek.every((d) => d.total === 0)).toBeTruthy();
            expect(result.byHour.every((h) => h.total === 0)).toBeTruthy();
        });

        it('returns zero-filled result for null', async () => {
            expect.hasAssertions();

            const { aggregateDefectSeasonality } = await import('../../defect-seasonality.js');
            const result = aggregateDefectSeasonality(null);

            expect(result.totalRecords).toBe(0);
        });

        it('returns zero-filled result for undefined', async () => {
            expect.hasAssertions();

            const { aggregateDefectSeasonality } = await import('../../defect-seasonality.js');
            const result = aggregateDefectSeasonality(undefined);

            expect(result.totalRecords).toBe(0);
        });
    });

    describe('FT-21c: generateSeasonalityHtml', () => {
        it('produces complete HTML with data', async () => {
            expect.hasAssertions();

            const { aggregateDefectSeasonality, generateSeasonalityHtml } = await import('../../defect-seasonality.js');
            const result = aggregateDefectSeasonality(makeClassifications());
            const html = generateSeasonalityHtml(result, 'Seasonality Report');

            expect(html).toContain('<!DOCTYPE html>');
            expect(html).toContain('Seasonality Report');
            expect(html).toContain('Mon');
            expect(html).toContain('10:00');
            expect(html).toContain('data-component="metric-card"');
        });

        it('shows no-data message when totalRecords is 0', async () => {
            expect.hasAssertions();

            const { generateSeasonalityHtml } = await import('../../defect-seasonality.js');
            const emptyResult: SeasonalityResult = {
                byDayOfWeek: [],
                byHour: [],
                peakDay: 'N/A',
                peakHour: -1,
                totalRecords: 0,
                period: { from: '', to: '' },
                timestamp: '2026-06-01T00:00:00Z',
            };
            const html = generateSeasonalityHtml(emptyResult);

            expect(html).toContain('No defect data available.');
        });
    });

    describe('FT-21d: null handling', () => {
        it('returns zero-filled result when aggregation receives null', async () => {
            expect.hasAssertions();

            const { aggregateDefectSeasonality } = await import('../../defect-seasonality.js');
            const result = aggregateDefectSeasonality(null);

            expect(result.byDayOfWeek).toHaveLength(7);
            expect(result.byHour).toHaveLength(24);
            expect(result.totalRecords).toBe(0);
            expect(result.peakDay).toBe('N/A');
            expect(result.peakHour).toBe(-1);
        });
    });

    describe('FT-21e: error fallback', () => {
        it('returns error page when buildCss throws', async () => {
            expect.hasAssertions();

            const spy = vi.spyOn(reportStyles, 'buildCss').mockImplementation(() => {
                throw new Error('CSS failure');
            });
            const { aggregateDefectSeasonality, generateSeasonalityHtml } = await import('../../defect-seasonality.js');
            const input: FailureClassification[] = [
                { timestamp: '2026-06-01T10:00:00Z', testTitle: 't1', category: 'ASSERTION', project: 'p1' },
            ];
            const result = aggregateDefectSeasonality(input);
            const html = generateSeasonalityHtml(result);

            expect(html).toContain('Error generating dashboard');

            spy.mockRestore();
        });
    });
});
