import { ClassifyResponseSchema } from './classify.schema.js';

describe('ClassifyResponseSchema', () => {
    it('accepts ASSERTION response', async () => {
        expect(ClassifyResponseSchema.parse('ASSERTION: expected 200 got 500')).toBe('ASSERTION: expected 200 got 500');
    });

    it('accepts TIMEOUT response', async () => {
        expect(ClassifyResponseSchema.parse('TIMEOUT: test exceeded 30s limit')).toBe(
            'TIMEOUT: test exceeded 30s limit',
        );
    });

    it('accepts ENVIRONMENT response', async () => {
        expect(ClassifyResponseSchema.parse('ENVIRONMENT: database connection failed')).toBe(
            'ENVIRONMENT: database connection failed',
        );
    });

    it('accepts FLAKY response', async () => {
        expect(ClassifyResponseSchema.parse('FLAKY: intermittent failure in CI')).toBe(
            'FLAKY: intermittent failure in CI',
        );
    });

    it('accepts APPLICATION response', async () => {
        expect(ClassifyResponseSchema.parse('APPLICATION: null pointer exception')).toBe(
            'APPLICATION: null pointer exception',
        );
    });

    it('accepts UNKNOWN response', async () => {
        expect(ClassifyResponseSchema.parse('UNKNOWN: could not determine')).toBe('UNKNOWN: could not determine');
    });

    it('rejects response without category prefix', async () => {
        expect(() => ClassifyResponseSchema.parse('just some text')).toThrow();
    });

    it('rejects lowercase category', async () => {
        expect(() => ClassifyResponseSchema.parse('assertion: expected 200')).toThrow();
    });

    it('rejects missing colon after category', async () => {
        expect(() => ClassifyResponseSchema.parse('ASSERTION expected 200')).toThrow();
    });

    it('accepts multi-line response (first line valid)', async () => {
        expect(ClassifyResponseSchema.parse('ASSERTION: expected 200\nsome extra text')).toBe(
            'ASSERTION: expected 200\nsome extra text',
        );
    });
});
