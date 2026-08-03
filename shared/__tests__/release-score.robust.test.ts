/**
 * Robust characterization tests — Release Score (#C1 root cause).
 *
 * FASE: TESTES standard:
 * - No internal logic mocking. `calcReleaseScore` is a pure function exercised
 *   with REAL numeric inputs.
 * - Proves the fabricated constants are gone at the contract level: a dimension
 *   whose data source is absent (`availability: false`) is marked `noData` in
 *   the breakdown and EXCLUDED from the composite — never silently scored as a
 *   placeholder or dragged into the weighted average (B2/§25, zero-silencing §25).
 */
import { describe, expect, it } from 'vitest';

import { calcReleaseScore } from '../data-hub/compute/release-score.js';
import { DEFAULT_WEIGHTS } from '../data-hub/compute/types.js';
import { generateReleaseScoreHtml } from '../quality/release-score-renderer.js';
import type { HealthDimensions } from '../types/data-hub.js';

function dims(scores: Partial<Record<keyof HealthDimensions, number>>): HealthDimensions {
    const out = {} as HealthDimensions;
    const keys: Array<keyof HealthDimensions> = ['passRate', 'flakyRate', 'coverage', 'suiteSpeed', 'executionRate'];
    for (const key of keys) {
        const score = scores[key] ?? 0;
        out[key] = { score, status: score >= 70 ? 'pass' : 'fail' };
    }
    return out;
}

describe('Robust: Release Score does not fabricate dimensions (#C1)', () => {
    it('honors the REAL coverage value (never silently fabricated)', () => {
        expect.hasAssertions();

        const coveragePct = 42;
        const result = calcReleaseScore(dims({ coverage: coveragePct }), undefined, {
            passRate: false,
            flakyRate: false,
            coverage: true,
            suiteSpeed: false,
            executionRate: false,
        });

        const coverageEntry = result.breakdown?.find((b) => b.label === 'Coverage');

        expect(coverageEntry).toBeDefined();
        expect(coverageEntry?.score).toBe(coveragePct);
        expect(coverageEntry?.noData).toBeUndefined();
        expect(coverageEntry?.status).toBe('fail');
    });

    it('reports an absent dimension as no-data (never fabricated, never weighted)', () => {
        expect.hasAssertions();

        const result = calcReleaseScore(dims({ passRate: 90, coverage: 42 }), undefined, {
            passRate: true,
            flakyRate: false,
            coverage: true,
            suiteSpeed: false,
            executionRate: false,
        });

        const flakyEntry = result.breakdown?.find((b) => b.label === 'Flaky Rate');

        expect(flakyEntry?.noData).toBeTruthy();
        expect(flakyEntry?.score).toBe(0);
        expect(result.recommendation).toContain('Insufficient data');
    });

    it('composite score renormalizes over available dimensions (absent dim excluded, not weighted as 0)', () => {
        expect.hasAssertions();

        const result = calcReleaseScore(
            dims({ passRate: 80, flakyRate: 100, coverage: 42, suiteSpeed: 100, executionRate: 100 }),
            undefined,
            { passRate: true, flakyRate: true, coverage: false, suiteSpeed: true, executionRate: true },
        );

        const totalWeight = 100 - DEFAULT_WEIGHTS.coverage;
        const expected =
            (80 * DEFAULT_WEIGHTS.passRate +
                100 * DEFAULT_WEIGHTS.flakyRate +
                100 * DEFAULT_WEIGHTS.suiteSpeed +
                100 * DEFAULT_WEIGHTS.executionRate) /
            totalWeight;

        expect(result.score).toBe(expected);
        expect(result.breakdown?.find((b) => b.label === 'Coverage')?.noData).toBeTruthy();
    });

    it('hTML renders N/A for a no-data dimension (zero-silencing: visible gap, not a fabricated value)', () => {
        expect.hasAssertions();

        const result = calcReleaseScore(dims({ passRate: 90, coverage: 42 }), undefined, {
            passRate: true,
            flakyRate: false,
            coverage: true,
            suiteSpeed: false,
            executionRate: false,
        });
        const html = generateReleaseScoreHtml(result);

        expect(html).toContain('N/A');
        expect(html).toContain('no data');
    });

    it('hTML shows an explicit EmptyState when NO dimension has data (never a fabricated 0/critical)', () => {
        expect.hasAssertions();

        const result = calcReleaseScore(dims({}), undefined, {
            passRate: false,
            flakyRate: false,
            coverage: false,
            suiteSpeed: false,
            executionRate: false,
        });
        const html = generateReleaseScoreHtml(result);

        expect(result.grade).toBe('unknown');
        expect(result.recommendation).toContain('Insufficient data');
        expect((result.breakdown ?? []).every((b) => b.noData)).toBeTruthy();
        expect(html).toContain('Insufficient data for release score');
    });
});
