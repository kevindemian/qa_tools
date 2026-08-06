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

    it('any non-finite required field always fails explicitly (never silently 0) (§25)', () => {
        expect.hasAssertions();

        const nonFinite = fc.constantFrom(Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY);
        const finite = fc.oneof(fc.constant(0), fc.constant(100));
        const rawWithOneNonFinite = fc
            .tuple(
                fc.constantFrom('total' as const, 'covered' as const, 'percentage' as const),
                nonFinite,
                finite,
                finite,
            )
            .map(([field, bad, a, b]) => {
                if (field === 'total') {
                    return { total: bad, covered: a, percentage: b };
                }
                if (field === 'covered') {
                    return { total: a, covered: bad, percentage: b };
                }
                return { total: a, covered: b, percentage: bad };
            });

        fc.assert(
            fc.property(rawWithOneNonFinite, (r) => {
                expect(() => calcCoverageFromRaw(r)).toThrow(TypeError);
            }),
            { numRuns: 200 },
        );
    });

    it('all-finite inputs (including out-of-range) normalize total to [0, 100] (§25)', () => {
        expect.hasAssertions();

        const finite = fc.oneof(fc.constant(-10), fc.constant(0), fc.constant(50), fc.constant(150));
        const raw = fc.record({ total: finite, covered: finite, percentage: finite });

        fc.assert(
            fc.property(raw, (r) => {
                const result = calcCoverageFromRaw(r);

                expect(result.total).toBeGreaterThanOrEqual(0);
                expect(result.total).toBeLessThanOrEqual(100);
            }),
            { numRuns: 200 },
        );
    });
});
