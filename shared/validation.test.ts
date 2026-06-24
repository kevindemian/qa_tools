import { z, parseOrThrow } from './validation.js';

describe('validation — zod wrapper', () => {
    describe('parseOrThrow', () => {
        it('parses valid data', () => {
            const schema = z.object({ name: z.string() });
            const result = parseOrThrow(schema, { name: 'test' });

            expect(result).toEqual({ name: 'test' });
        });

        it('throws on invalid data', () => {
            const schema = z.object({ name: z.string() });

            expect(() => parseOrThrow(schema, { name: 123 })).toThrow('Validation failed');
        });

        it('preserves transformed data', () => {
            const schema = z.string().transform((s) => s.toUpperCase());
            const result = parseOrThrow(schema, 'hello');

            expect(result).toBe('HELLO');
        });
    });

    describe('z re-export', () => {
        it('provides full zod API', () => {
            expect(typeof z.string).toBe('function');
            expect(typeof z.number).toBe('function');
            expect(typeof z.object).toBe('function');
            expect(typeof z.array).toBe('function');
            expect(typeof z.enum).toBe('function');
        });

        it('schema parsing works', () => {
            const schema = z.number();

            expect(schema.safeParse('abc').success).toBeFalsy();
            expect(schema.safeParse(42).success).toBeTruthy();
        });
    });
});
