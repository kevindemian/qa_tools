import { describe, expect, it } from 'vitest';
import { isCoverageArtifact } from '../coverage-files-extractor.js';

describe('DataHub/extractors/coverage-files', () => {
    describe('IsCoverageArtifact', () => {
        it.each([
            ['coverage-final.json', true],
            ['cobertura-coverage.xml', true],
            ['jacoco.xml', true],
            ['clover.xml', true],
            ['test-results.xml', false],
            ['build.log', false],
            ['', false],
        ])('classifies %s as %s', (name, expected) => {
            expect.hasAssertions();
            expect(isCoverageArtifact(name)).toBe(expected);
        });

        it('is case-insensitive', () => {
            expect.hasAssertions();
            expect(isCoverageArtifact('COVERAGE-FINAL.JSON')).toBeTruthy();
        });
    });
});
