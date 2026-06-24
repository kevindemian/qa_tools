/**
 * Tests for defect-seasonality — Defect Seasonality Dashboard aggregator and HTML generator.
 */

import { aggregateDefectSeasonality, generateSeasonalityHtml, type SeasonalityResult } from './defect-seasonality.js';
import type { FailureClassification } from './metrics.js';
import { nonNull } from './test-utils.js';
import * as reportStyles from './report-styles.js';

const sampleClass: FailureClassification = {
    timestamp: '2026-06-01T10:00:00Z',
    testTitle: 't1',
    category: 'ASSERTION',
    project: 'proj',
};

const allCats = ['ASSERTION', 'TIMEOUT', 'ENV', 'NETWORK', 'UNKNOWN'];

function makeFC(dow: number, hour: number, cat: string): FailureClassification {
    const offset = dow >= 1 ? dow - 1 : 6;
    const dayOfMonth = 1 + offset;
    const iso = `2026-06-${String(dayOfMonth).padStart(2, '0')}T${String(hour).padStart(2, '0')}:00:00Z`;
    return { timestamp: iso, testTitle: `t_${cat}`, category: cat, project: 'p' };
}

describe('AggregateDefectSeasonality', () => {
    it('returns zero-filled structure for empty array', () => {expect.hasAssertions();

        const result = aggregateDefectSeasonality([]);

        expect(result.byDayOfWeek).toHaveLength(7);
        expect(result.byHour).toHaveLength(24);

        for (const d of result.byDayOfWeek) {
            expect(d.total).toBe(0);
            expect(d.categories).toStrictEqual({});
        }
        for (const h of result.byHour) {
            expect(h.total).toBe(0);
            expect(h.categories).toStrictEqual({});
        }

        expect(result.peakDay).toBe('N/A');
        expect(result.peakHour).toBe(-1);
        expect(result.totalRecords).toBe(0);
        expect(result.period).toStrictEqual({ from: '', to: '' });
        expect(result.timestamp).toBeTruthy();
    });

    it('returns zero-filled structure for empty input', () => {
        const result = aggregateDefectSeasonality([]);

        expect(result.totalRecords).toBe(0);
        expect(result.peakDay).toBe('N/A');
        expect(result.peakHour).toBe(-1);
    });

    it('groups single classification by day and hour', () => {
        const result = aggregateDefectSeasonality([sampleClass]);

        expect(result.totalRecords).toBe(1);

        const mon = nonNull(result.byDayOfWeek.find((d) => d.dayOfWeek === 'Mon'));

        expect(mon.total).toBe(1);
        expect(mon.categories).toStrictEqual({ ASSERTION: 1 });

        const hour10 = nonNull(result.byHour.find((h) => h.hour === 10));

        expect(hour10.total).toBe(1);
        expect(hour10.categories).toStrictEqual({ ASSERTION: 1 });

        expect(result.peakDay).toBe('Mon');
        expect(result.peakHour).toBe(10);
    });

    it('groups multiple classifications across days', () => {
        const input: FailureClassification[] = [
            makeFC(1, 10, 'ASSERTION'), // Mon
            makeFC(2, 11, 'TIMEOUT'), // Tue
            makeFC(3, 12, 'ENV'), // Wed
        ];
        const result = aggregateDefectSeasonality(input);

        expect(result.totalRecords).toBe(3);

        const mon = nonNull(result.byDayOfWeek.find((d) => d.dayOfWeek === 'Mon'));

        expect(mon.total).toBe(1);

        const tue = nonNull(result.byDayOfWeek.find((d) => d.dayOfWeek === 'Tue'));

        expect(tue.total).toBe(1);

        const wed = nonNull(result.byDayOfWeek.find((d) => d.dayOfWeek === 'Wed'));

        expect(wed.total).toBe(1);

        expect(result.peakDay).toBe('Mon');
        expect(result.peakHour).toBe(10);
    });

    it('groups multiple categories on same day and hour', () => {
        const input: FailureClassification[] = [
            { ...sampleClass, category: 'ASSERTION' },
            { ...sampleClass, category: 'TIMEOUT' },
            { ...sampleClass, category: 'ASSERTION' },
        ];
        const result = aggregateDefectSeasonality(input);

        expect(result.totalRecords).toBe(3);

        const mon = nonNull(result.byDayOfWeek.find((d) => d.dayOfWeek === 'Mon'));

        expect(mon.total).toBe(3);
        expect(mon.categories).toStrictEqual({ ASSERTION: 2, TIMEOUT: 1 });

        const hour10 = nonNull(result.byHour.find((h) => h.hour === 10));

        expect(hour10.total).toBe(3);
        expect(hour10.categories).toStrictEqual({ ASSERTION: 2, TIMEOUT: 1 });

        expect(result.peakDay).toBe('Mon');
        expect(result.peakHour).toBe(10);
    });

    it('sorts days in Mon-Sun order', () => {
        const input: FailureClassification[] = [
            makeFC(6, 10, 'A'), // Sat
            makeFC(0, 10, 'B'), // Sun
            makeFC(1, 10, 'C'), // Mon
        ];
        const result = aggregateDefectSeasonality(input);
        const dayNames = result.byDayOfWeek.map((d) => d.dayOfWeek);

        expect(dayNames).toStrictEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
    });

    it('sorts hours 0-23', () => {
        const input: FailureClassification[] = [makeFC(1, 23, 'A'), makeFC(1, 0, 'B'), makeFC(1, 12, 'C')];
        const result = aggregateDefectSeasonality(input);
        const hours = result.byHour.map((h) => h.hour);

        expect(hours).toStrictEqual(Array.from({ length: 24 }, (_, i) => i));
    });

    it('computes peak day correctly when multiple days have records', () => {
        const input: FailureClassification[] = [
            makeFC(1, 10, 'A'), // Mon
            makeFC(1, 11, 'A'), // Mon
            makeFC(2, 10, 'B'), // Tue
            makeFC(3, 10, 'C'), // Wed
            makeFC(3, 11, 'C'), // Wed
            makeFC(3, 12, 'C'), // Wed
        ];
        const result = aggregateDefectSeasonality(input);

        expect(result.peakDay).toBe('Wed');
    });

    it('computes peak hour correctly when multiple hours have records', () => {
        const input: FailureClassification[] = [
            makeFC(1, 8, 'A'),
            makeFC(1, 8, 'A'),
            makeFC(1, 8, 'A'),
            makeFC(1, 9, 'B'),
            makeFC(1, 10, 'C'),
        ];
        const result = aggregateDefectSeasonality(input);

        expect(result.peakHour).toBe(8);
    });

    it('tracks period from/to across multiple days', () => {
        const input: FailureClassification[] = [
            { ...sampleClass, timestamp: '2026-06-01T10:00:00Z' },
            { ...sampleClass, timestamp: '2026-06-03T10:00:00Z' },
        ];
        const result = aggregateDefectSeasonality(input);

        expect(result.period).toStrictEqual({ from: '2026-06-01', to: '2026-06-03' });
    });

    it('handles all days of week', () => {
        const input: FailureClassification[] = [];
        for (let d = 0; d <= 6; d++) {
            for (let h = 0; h < 24; h++) {
                input.push(makeFC(d, h, allCats[(d + h) % allCats.length] ?? 'ASSERTION'));
            }
        }
        const result = aggregateDefectSeasonality(input);

        expect(result.totalRecords).toBe(7 * 24);
        expect(result.byDayOfWeek.every((d) => d.total === 24)).toBeTruthy();
        expect(result.byHour.every((h) => h.total === 7)).toBeTruthy();
    });

    it('preserves categories per day when day is empty', () => {
        const input: FailureClassification[] = [makeFC(1, 10, 'ASSERTION')];
        const result = aggregateDefectSeasonality(input);
        const tue = nonNull(result.byDayOfWeek.find((d) => d.dayOfWeek === 'Tue'));

        expect(tue.total).toBe(0);
        expect(tue.categories).toStrictEqual({});
    });

    it('preserves categories per hour when hour is empty', () => {
        const input: FailureClassification[] = [makeFC(1, 10, 'ASSERTION')];
        const result = aggregateDefectSeasonality(input);
        const hour0 = nonNull(result.byHour.find((h) => h.hour === 0));

        expect(hour0.total).toBe(0);
        expect(hour0.categories).toStrictEqual({});
    });

    it('returns N/A peak when all totals are zero', () => {
        const input: FailureClassification[] = [];
        const result = aggregateDefectSeasonality(input);

        expect(result.peakDay).toBe('N/A');
        expect(result.peakHour).toBe(-1);
    });

    it('handles invalid timestamps gracefully', () => {
        const input: FailureClassification[] = [
            { timestamp: 'not-a-date', testTitle: 't1', category: 'ASSERTION', project: 'p' },
        ];
        const result = aggregateDefectSeasonality(input);

        expect(result.totalRecords).toBe(1);
        expect(result.peakDay).toBe('N/A');
        expect(result.peakHour).toBe(-1);
        expect(result.byDayOfWeek.every((d) => d.total === 0)).toBeTruthy();
        expect(result.byHour.every((h) => h.total === 0)).toBeTruthy();
    });

    it('returns correct peak day when tied', () => {
        const input: FailureClassification[] = [makeFC(1, 10, 'A'), makeFC(2, 10, 'B')];
        const result = aggregateDefectSeasonality(input);

        expect(result.peakDay).toBe('Mon');
    });

    it('returns correct peak hour when tied', () => {
        const input: FailureClassification[] = [makeFC(1, 10, 'A'), makeFC(2, 11, 'B')];
        const result = aggregateDefectSeasonality(input);

        expect(result.peakHour).toBe(10);
    });
});

describe('GenerateSeasonalityHtml', () => {
    it('shows no-data message for empty result', () => {
        const result = aggregateDefectSeasonality([]);
        const html = generateSeasonalityHtml(result);

        expect(html).toContain('<!DOCTYPE html>');
        expect(html).toContain('No defect data available.');
    });

    it('shows no-data message for result with zero records', () => {
        const result = aggregateDefectSeasonality([]);
        const html = generateSeasonalityHtml(result);

        expect(html).toContain('No defect data available.');
    });

    it('includes summary cards with correct values', () => {
        const input: FailureClassification[] = [sampleClass];
        const result = aggregateDefectSeasonality(input);
        const html = generateSeasonalityHtml(result);

        expect(html).toContain('Total Records');
        expect(html).toContain('1');
        expect(html).toContain('Peak Day');
        expect(html).toContain('Mon');
        expect(html).toContain('Peak Hour');
        expect(html).toContain('10:00');
    });

    it('shows N/A for peak hour when no records', () => {
        const result = aggregateDefectSeasonality([]);
        const html = generateSeasonalityHtml(result);

        expect(html).toContain('No defect data available.');
    });

    it('renders day-of-week table with data', () => {
        const input: FailureClassification[] = [makeFC(1, 10, 'ASSERTION'), makeFC(1, 11, 'TIMEOUT')];
        const result = aggregateDefectSeasonality(input);
        const html = generateSeasonalityHtml(result);

        expect(html).toContain('Day of Week Breakdown');
        expect(html).toContain('data-component="data-table"');
        expect(html).toContain('Mon');
        expect(html).toContain('Tue');
    });

    it('renders hour table with data', () => {
        const input: FailureClassification[] = [sampleClass];
        const result = aggregateDefectSeasonality(input);
        const html = generateSeasonalityHtml(result);

        expect(html).toContain('Hour Breakdown');
        expect(html).toContain('10:00');
        expect(html).toContain('0:00');
    });

    it('shows category columns in day table', () => {
        const input: FailureClassification[] = [makeFC(1, 10, 'ASSERTION'), makeFC(2, 11, 'TIMEOUT')];
        const result = aggregateDefectSeasonality(input);
        const html = generateSeasonalityHtml(result);

        expect(html).toContain('ASSERTION');
        expect(html).toContain('TIMEOUT');
    });

    it('shows category columns in hour table', () => {
        const input: FailureClassification[] = [makeFC(1, 10, 'ENV'), makeFC(1, 11, 'NETWORK')];
        const result = aggregateDefectSeasonality(input);
        const html = generateSeasonalityHtml(result);

        expect(html).toContain('ENV');
        expect(html).toContain('NETWORK');
    });

    it('supports custom title', () => {
        const result = aggregateDefectSeasonality([]);
        const html = generateSeasonalityHtml(result, 'Sprint 11 Seasonality');

        expect(html).toContain('Sprint 11 Seasonality');
    });

    it('escapes HTML in category names', () => {
        const input: FailureClassification[] = [makeFC(1, 10, '<script>alert(1)</script>')];
        const result = aggregateDefectSeasonality(input);
        const html = generateSeasonalityHtml(result);

        expect(html).toContain('&lt;script&gt;');
        expect(html).not.toContain('<script>alert');
    });

    it('includes theme toggle script', () => {
        const input: FailureClassification[] = [sampleClass];
        const result = aggregateDefectSeasonality(input);
        const html = generateSeasonalityHtml(result);

        expect(html).toContain('qa-report-theme');
        expect(html).toContain('prefers-color-scheme');
    });

    it('includes CSS variables from design tokens', () => {
        const input: FailureClassification[] = [sampleClass];
        const result = aggregateDefectSeasonality(input);
        const html = generateSeasonalityHtml(result);

        expect(html).toContain('--color-surface-page');
        expect(html).toContain('html.dark');
    });

    it('handles N/A peak hour in summary cards when peakHour is -1', () => {
        const base = aggregateDefectSeasonality([sampleClass]);
        const result: SeasonalityResult = { ...base, peakHour: -1 };
        const html = generateSeasonalityHtml(result);

        expect(html).toContain('N/A');
    });

    it('handles N/A peak day in summary cards when peakDay is N/A', () => {
        const base = aggregateDefectSeasonality([sampleClass]);
        const result: SeasonalityResult = { ...base, peakDay: 'N/A' };
        const html = generateSeasonalityHtml(result);

        expect(html).toContain('N/A');
    });

    it('handles generation errors gracefully', () => {
        const spy = vi.spyOn(reportStyles, 'buildCss').mockImplementation(() => {
            throw new Error('CSS failure');
        });
        const result = aggregateDefectSeasonality([sampleClass]);
        const html = generateSeasonalityHtml(result, 'Error Test');

        expect(html).toContain('Error generating dashboard');

        spy.mockRestore();
    });
});
