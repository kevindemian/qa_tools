import { formatDateISO } from './date-utils.js';

describe('formatDateISO', () => {
    it('formats a known date as YYYY-MM-DD', () => {
        const d = new Date(2026, 4, 30); // May 30 2026

        expect(formatDateISO(d)).toBe('2026-05-30');
    });

    it('pads single-digit month and day with zero', () => {
        const d = new Date(2026, 0, 5); // Jan 5 2026

        expect(formatDateISO(d)).toBe('2026-01-05');
    });

    it('formats December date correctly', () => {
        const d = new Date(2026, 11, 1); // Dec 1 2026

        expect(formatDateISO(d)).toBe('2026-12-01');
    });

    it('formats last day of year', () => {
        const d = new Date(2026, 11, 31);

        expect(formatDateISO(d)).toBe('2026-12-31');
    });

    it('uses today when no date argument given', () => {
        const today = new Date();
        const expected = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

        expect(formatDateISO()).toBe(expected);
    });

    it('produces same output as toISOString slice(0,10) for local dates', () => {
        const d = new Date(2026, 4, 30, 12, 0, 0);

        expect(formatDateISO(d)).toBe('2026-05-30');
    });

    it('handles first day of year', () => {
        const d = new Date(2026, 0, 1);

        expect(formatDateISO(d)).toBe('2026-01-01');
    });
});
