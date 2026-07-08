import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { validateTestFile } from '../test-source-fallback.js';

describe('Test-source-fallback — property-based', () => {
    it('validateTestFile returns object with data and optional error/source', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(fc.string({ minLength: 1, maxLength: 200 }), (filePath) => {
                const result = validateTestFile(filePath);

                expect(result).toHaveProperty('data');

                expect(result.data !== null || typeof result.error === 'string').toBeTruthy();
            }),
            { numRuns: 100 },
        );
    });

    it('non-.json/.xml extensions always return error', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(fc.constantFrom('.txt', '.log', '.csv', '.yaml', '.yml', '.toml'), (ext) => {
                const result = validateTestFile(`file${ext}`);

                expect(result.data).toBeNull();
                expect(result.error).toBeDefined();
            }),
            { numRuns: 50 },
        );
    });
});
