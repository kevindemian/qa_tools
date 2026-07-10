import { describe, it, expect } from 'vitest';
import type { RawCoverage } from '../../../types/data-hub.js';
import { calcCoverageFromRaw } from '../../compute/coverage.js';

describe('Compute/coverage', () => {
    it('returns 0 for zero coverage', () => {
        expect.hasAssertions();
        expect(calcCoverageFromRaw({ total: 0, covered: 0, percentage: 0 })).toStrictEqual({
            total: 0,
            covered: 0,
            statements: 0,
        });
    });

    it('returns correct coverage using percentage field', () => {
        expect.hasAssertions();
        expect(calcCoverageFromRaw({ total: 5000, covered: 4000, percentage: 80 })).toStrictEqual({
            total: 80,
            covered: 4000,
            statements: 5000,
        });
    });

    it('clamps to 100 when percentage over 100', () => {
        expect.hasAssertions();
        expect(calcCoverageFromRaw({ total: 100, covered: 100, percentage: 150 }).total).toBe(100);
    });

    it('clamps to 0 when percentage negative', () => {
        expect.hasAssertions();
        expect(calcCoverageFromRaw({ total: 100, covered: 0, percentage: -10 }).total).toBe(0);
    });

    it('preserves per-file data', () => {
        expect.hasAssertions();

        const raw: RawCoverage = {
            total: 75,
            covered: 75,
            percentage: 75,
            files: {
                'src/a.ts': { total: 100, covered: 80, percentage: 80 },
            },
        };
        const result = calcCoverageFromRaw(raw);

        expect(result.files?.['src/a.ts']).toBeDefined();
    });
});
