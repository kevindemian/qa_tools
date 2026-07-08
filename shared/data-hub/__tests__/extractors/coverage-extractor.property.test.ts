import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { extractCoverage } from '../../extractors/coverage-extractor.js';

describe('Coverage-extractor — property-based', () => {
    it('empty input returns null', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(fc.constant({}), (input) => {
                const result = extractCoverage(input);

                expect(result).toBeNull();
            }),
            { numRuns: 10 },
        );
    });

    it('gitlab coverage with non-numeric string returns null', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(fc.constantFrom('abc', 'not-a-number', '', '..', '--'), (coverage) => {
                const result = extractCoverage({ gitlabCoverage: coverage });

                expect(result).toBeNull();
            }),
            { numRuns: 50 },
        );
    });

    it('gitlab coverage with valid number returns non-null with finite percentage', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(fc.double({ min: 0, max: 100, noNaN: true }), (pct) => {
                const result = extractCoverage({ gitlabCoverage: String(pct) });

                expect(result).not.toBeNull();

                expect(Number.isFinite((result as { percentage: number }).percentage)).toBeTruthy();
            }),
            { numRuns: 100 },
        );
    });

    it('ctrf with valid coverage returns non-null', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(fc.nat({ max: 100 }), (pct) => {
                const ctrf = {
                    results: {
                        coverage: { total: 100, covered: pct, percentage: pct },
                    },
                };
                const result = extractCoverage({ ctrf });

                expect(result).not.toBeNull();

                expect((result as { percentage: number }).percentage).toBe(pct);
            }),
            { numRuns: 50 },
        );
    });
});
