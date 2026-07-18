import { ClassifyResponseSchema } from '../validation/classify.schema.js';

describe('ClassifyResponseSchema', () => {
    it('accepts ASSERTION response', () => {
        expect(ClassifyResponseSchema.parse('ASSERTION: expected 200 got 500')).toBe('ASSERTION: expected 200 got 500');
    });

    it('accepts TIMEOUT response', () => {
        expect(ClassifyResponseSchema.parse('TIMEOUT: test exceeded 30s limit')).toBe(
            'TIMEOUT: test exceeded 30s limit',
        );
    });

    it('accepts ENVIRONMENT response', () => {
        expect(ClassifyResponseSchema.parse('ENVIRONMENT: database connection failed')).toBe(
            'ENVIRONMENT: database connection failed',
        );
    });

    it('accepts FLAKY response', () => {
        expect(ClassifyResponseSchema.parse('FLAKY: intermittent failure in CI')).toBe(
            'FLAKY: intermittent failure in CI',
        );
    });

    it('accepts APPLICATION response', () => {
        expect(ClassifyResponseSchema.parse('APPLICATION: null pointer exception')).toBe(
            'APPLICATION: null pointer exception',
        );
    });

    it('accepts UNKNOWN response', () => {
        expect(ClassifyResponseSchema.parse('UNKNOWN: could not determine')).toBe('UNKNOWN: could not determine');
    });

    it('rejects response without category prefix', () => {
        expect(() => ClassifyResponseSchema.parse('just some text')).toThrow(/./i);
    });

    it('rejects lowercase category', () => {
        expect(() => ClassifyResponseSchema.parse('assertion: expected 200')).toThrow(/./i);
    });

    it('rejects missing colon after category', () => {
        expect(() => ClassifyResponseSchema.parse('ASSERTION expected 200')).toThrow(/./i);
    });

    it('accepts multi-line response (first line valid)', () => {
        expect(ClassifyResponseSchema.parse('ASSERTION: expected 200\nsome extra text')).toBe(
            'ASSERTION: expected 200\nsome extra text',
        );
    });
});
