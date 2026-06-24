/** Tests for report-utils — formatting and stats for HTML report generation. */
import type { FlatTest } from './result_parser.js';
import { statsFromTests, fmtDuration, pctClass, pct, pctSub } from './report-utils.js';

describe('statsFromTests', () => {
    const tests: FlatTest[] = [
        { title: 'T1', state: 'passed', duration: 100 },
        { title: 'T2', state: 'failed', duration: 200 },
        { title: 'T3', state: 'passed', duration: 150 },
        { title: 'T4', state: 'skipped', duration: 0 },
    ];

    it('counts passed/failed/skipped correctly', () => {
        const stats = statsFromTests(tests);

        expect(stats.passed).toBe(2);
        expect(stats.failed).toBe(1);
        expect(stats.skipped).toBe(1);
        expect(stats.total).toBe(4);
    });

    it('sums total duration', () => {
        const stats = statsFromTests(tests);

        expect(stats.duration).toBe(450);
    });

    it('returns zeroes for empty array', () => {
        const stats = statsFromTests([]);

        expect(stats).toEqual({ passed: 0, failed: 0, skipped: 0, total: 0, duration: 0 });
    });

    it('handles all-passed tests', () => {
        const allPassed: FlatTest[] = [
            { title: 'X', state: 'passed', duration: 50 },
            { title: 'Y', state: 'passed', duration: 75 },
        ];
        const stats = statsFromTests(allPassed);

        expect(stats.passed).toBe(2);
        expect(stats.failed).toBe(0);
        expect(stats.skipped).toBe(0);
    });
});

describe('fmtDuration', () => {
    it('formats seconds only', () => {
        expect(fmtDuration(3000)).toBe('3s');
    });

    it('formats minutes and seconds', () => {
        expect(fmtDuration(125000)).toBe('2m 5s');
    });

    it('handles zero', () => {
        expect(fmtDuration(0)).toBe('0s');
    });

    it('handles exact minute', () => {
        expect(fmtDuration(60000)).toBe('1m 0s');
    });

    it('handles large durations', () => {
        expect(fmtDuration(3661000)).toBe('61m 1s');
    });
});

describe('pctClass', () => {
    it('returns rate-good for 90%+', () => {
        expect(pctClass(95)).toBe('rate-good');
        expect(pctClass(90)).toBe('rate-good');
    });

    it('returns rate-warn for 70-89%', () => {
        expect(pctClass(85)).toBe('rate-warn');
        expect(pctClass(70)).toBe('rate-warn');
    });

    it('returns rate-bad for below 70%', () => {
        expect(pctClass(69)).toBe('rate-bad');
        expect(pctClass(0)).toBe('rate-bad');
    });

    it('handles edge case at threshold boundaries', () => {
        expect(pctClass(89.9)).toBe('rate-warn');
    });
});

describe('pct', () => {
    it('calculates percentage', () => {
        expect(pct(5, 10)).toBe('50.0');
    });

    it('handles zero total', () => {
        expect(pct(5, 0)).toBe('0.0');
    });

    it('handles all values', () => {
        expect(pct(10, 10)).toBe('100.0');
    });

    it('handles zero value', () => {
        expect(pct(0, 10)).toBe('0.0');
    });

    it('formats with one decimal place', () => {
        expect(pct(1, 3)).toBe('33.3');
    });
});

describe('pctSub', () => {
    it('returns HTML span with percentage', () => {
        const result = pctSub(5, 10);

        expect(result).toContain('50.0%');
        expect(result).toContain('span');
    });

    it('returns empty string for zero total', () => {
        expect(pctSub(5, 0)).toBe('');
    });

    it('handles zero value', () => {
        const result = pctSub(0, 10);

        expect(result).toContain('0.0%');
    });
});
