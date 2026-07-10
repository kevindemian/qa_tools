import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { RawCoverage } from '../../../types/data-hub.js';
import { calcCoverageFromRaw } from '../../compute/coverage.js';

describe('Compute/coverage — property-based', () => {
    it('coverage total is always 0-100 (from percentage field)', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(fc.integer({ min: -1000, max: 2000 }), fc.nat({ max: 200 }), (total, percentage) => {
                const raw: RawCoverage = { total, covered: 0, percentage };
                const result = calcCoverageFromRaw(raw);

                expect(result.total).toBeGreaterThanOrEqual(0);
                expect(result.total).toBeLessThanOrEqual(100);
            }),
            { numRuns: 100 },
        );
    });

    it('statements always equals raw total (count, not percentage)', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(fc.integer({ min: 0, max: 1000 }), (total) => {
                const raw: RawCoverage = { total, covered: 0, percentage: 0 };
                const result = calcCoverageFromRaw(raw);

                expect(result.statements).toBe(total);
            }),
            { numRuns: 100 },
        );
    });

    it('files are preserved when present', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(fc.nat({ max: 100 }), (pct) => {
                const files = { 'a.ts': { total: 100, covered: pct, percentage: pct } };
                const raw: RawCoverage = { total: 500, covered: pct, percentage: pct, files };
                const result = calcCoverageFromRaw(raw);

                expect(result.files).toStrictEqual(files);
            }),
            { numRuns: 50 },
        );
    });
});
