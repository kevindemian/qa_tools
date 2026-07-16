import { describe, expect, it } from 'vitest';
import { extractReportersFromJsonObject, extractReportersAst } from './reporter-ast.js';

describe('Setup/reporter-ast', () => {
    describe('ExtractReportersFromJsonObject', () => {
        it('extracts reporters array', () => {
            expect.hasAssertions();
            expect(extractReportersFromJsonObject({ reporters: ['default', 'html'] })).toStrictEqual([
                'default',
                'html',
            ]);
        });

        it('extracts a single reporter string', () => {
            expect.hasAssertions();
            expect(extractReportersFromJsonObject({ reporter: 'dot' })).toStrictEqual(['dot']);
        });

        it('extracts reporters nested under test', () => {
            expect.hasAssertions();
            expect(extractReportersFromJsonObject({ test: { reporters: ['json'] } })).toStrictEqual(['json']);
        });

        it('dedupes and trims', () => {
            expect.hasAssertions();
            expect(extractReportersFromJsonObject({ reporters: ['dot', ' dot ', 'dot'] })).toStrictEqual(['dot']);
        });

        it('handles object reporters by constructor name', () => {
            expect.hasAssertions();

            class MyReporter {}
            const out = extractReportersFromJsonObject({ reporters: [new MyReporter()] });

            expect(out).toStrictEqual(['MyReporter']);
        });

        it('returns empty for null/array/non-object', () => {
            expect.hasAssertions();
            expect(extractReportersFromJsonObject(null)).toStrictEqual([]);
            expect(extractReportersFromJsonObject([])).toStrictEqual([]);
        });
    });

    describe('ExtractReportersAst', () => {
        it('parses a JSON config file for reporters', () => {
            expect.hasAssertions();

            const src = JSON.stringify({ reporters: ['default', 'junit'] });

            expect(extractReportersAst('vitest.config.json', src)).toStrictEqual(['default', 'junit']);
        });

        it('parses a TS config export default object', () => {
            expect.hasAssertions();

            const src = `export default { reporters: ['verbose', 'html'], test: { reporters: ['json'] } };`;
            const out = extractReportersAst('vitest.config.ts', src);

            expect(out).toContain('verbose');
            expect(out).toContain('html');
            expect(out).toContain('json');
        });

        it('parses a module.exports assignment', () => {
            expect.hasAssertions();

            const src = `module.exports = { reporter: 'dot' };`;

            expect(extractReportersAst('jest.config.js', src)).toStrictEqual(['dot']);
        });

        it('returns empty array when no reporters found', () => {
            expect.hasAssertions();
            expect(extractReportersAst('vitest.config.ts', `export default { name: 'x' };`)).toStrictEqual([]);
        });

        it('returns empty array on unparseable source', () => {
            expect.hasAssertions();
            expect(extractReportersAst('vitest.config.ts', 'export default ===')).toStrictEqual([]);
        });
    });
});
