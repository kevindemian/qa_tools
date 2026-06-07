import { parseTests, extractCriteria } from './types.js';

describe('parseTests', () => {
    it('returns empty array for null', () => {
        expect(parseTests(null)).toEqual([]);
    });

    it('returns empty array for non-object', () => {
        expect(parseTests('string')).toEqual([]);
    });

    it('returns the array directly when artifact is an array', () => {
        const arr = [{ title: 'Test' }];
        expect(parseTests(arr)).toEqual(arr);
    });

    it('extracts tests from object with tests key', () => {
        const result = parseTests({ tests: [{ title: 'A' }, { title: 'B' }] });
        expect(result).toHaveLength(2);
        expect(result[0]?.title).toBe('A');
    });

    it('returns empty array when object has no tests key', () => {
        expect(parseTests({ foo: 'bar' })).toEqual([]);
    });
});

describe('extractCriteria', () => {
    it('returns empty array for empty input', () => {
        expect(extractCriteria('')).toEqual([]);
    });

    it('extracts criteria after "Acceptance Criteria:" header', () => {
        const input = 'Acceptance Criteria:\n- User can log in\n- User can log out';
        const result = extractCriteria(input);
        expect(result).toContain('User can log in');
        expect(result).toContain('User can log out');
    });

    it('extracts criteria after "Scenarios:" header', () => {
        const result = extractCriteria('Scenarios:\n- User submits valid payment');
        expect(result).toContain('User submits valid payment');
    });

    it('extracts inline criteria after header colon', () => {
        const result = extractCriteria('Criteria: User must be authenticated');
        expect(result).toContain('User must be authenticated');
    });

    it('falls back to extractFallback when no structured criteria found', () => {
        const result = extractCriteria('Just a long line of descriptive text without any criteria headers at all');
        expect(result.length).toBeGreaterThan(0);
    });

    it('stops parsing criteria on empty line or section header', () => {
        const result = extractCriteria('Acceptance Criteria:\n- Item 1\n\nDescription:\nIgnore this');
        expect(result).toEqual(['Item 1']);
    });
});
