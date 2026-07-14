import { describe, it, expect } from 'vitest';
import { extractReportersAst, extractReportersFromJsonObject } from './reporter-ast.js';

describe('ExtractReportersAst', () => {
    describe('Fallback path', () => {
        it('extracts CTRF reporter from vitest.config.ts', () => {
            expect.hasAssertions();

            const src = `import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { reporters: ['default', 'ctrf-json-reporter'] } });`;
            const reporters = extractReportersAst('vitest.config.ts', src);

            expect(reporters).toContain('ctrf-json-reporter');
        });

        it('extracts JUnit reporter from jest.config.js', () => {
            expect.hasAssertions();

            const src = `module.exports = { reporters: ['default', ['jest-junit', {}]] };`;
            const reporters = extractReportersAst('jest.config.js', src);

            expect(reporters).toContain('jest-junit');
        });

        it('extracts reporter from cypress.config.ts', () => {
            expect.hasAssertions();

            const src = `import { defineConfig } from 'cypress';
export default defineConfig({ reporter: 'ctrf-json-reporter' });`;
            const reporters = extractReportersAst('cypress.config.ts', src);

            expect(reporters).toContain('ctrf-json-reporter');
        });

        it('extracts reporter from playwright.config.ts', () => {
            expect.hasAssertions();

            const src = `import { defineConfig } from '@playwright/test';
export default defineConfig({ reporter: [['ctrf', {}], 'list'] });`;
            const reporters = extractReportersAst('playwright.config.ts', src);

            expect(reporters).toContain('ctrf');
        });

        it('resolves new X() via import specifier AND identifier', () => {
            expect.hasAssertions();

            const src = `import { defineConfig } from 'vitest/config';
import VitestCtrfReporter from './ctrf-helpers.js';
export default defineConfig({ test: { reporters: ['default', new VitestCtrfReporter()] } });`;
            const reporters = extractReportersAst('vitest.config.ts', src);

            expect(reporters).toContain('VitestCtrfReporter');
            expect(reporters.some((r) => r.includes('ctrf'))).toBeTruthy();
        });

        it('does NOT produce a false positive from a comment or string literal', () => {
            expect.hasAssertions();

            const src = `// we should add a ctrf reporter later
const note = 'configure ctrf reporter in the future';
export default { test: { reporters: ['default'] } };`;
            const reporters = extractReportersAst('vitest.config.ts', src);

            expect(reporters).not.toContain('ctrf');
            expect(reporters).toStrictEqual(['default']);
        });
    });

    describe('ExtractReportersFromJsonObject — package.json inline', () => {
        it('reads jest.reporters', () => {
            expect.hasAssertions();

            const out = extractReportersFromJsonObject({ reporters: ['default', 'jest-junit'] });

            expect(out).toContain('jest-junit');
        });

        it('reads vitest.test.reporters', () => {
            expect.hasAssertions();

            const out = extractReportersFromJsonObject({ test: { reporters: ['ctrf'] } });

            expect(out).toContain('ctrf');
        });

        it('reads a single reporter string', () => {
            expect.hasAssertions();

            const out = extractReportersFromJsonObject({ reporters: 'ctrf' });

            expect(out).toContain('ctrf');
        });
    });
});
