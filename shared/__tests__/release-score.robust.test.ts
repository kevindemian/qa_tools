/**
 * Robust characterization tests — Release Score (#C1 root cause).
 *
 * FASE: TESTES standard:
 * - No internal logic mocking. `calculateReleaseScore` is a pure function exercised
 *   with REAL numeric inputs (the same shape production passes after the fix).
 * - Proves the fabricated constants (tasks=80, coverage=70) are gone at the contract
 *   level: coverage breakdown honors the real value; undefined (no real source)
 *   dimensions are reported as no-data instead of being silently scored 80/70.
 */
import { describe, expect, it } from 'vitest';

import { calculateReleaseScore, generateReleaseScoreHtml } from '../quality/release-score.js';

describe('Robust: Release Score does not fabricate dimensions (#C1)', () => {
    it('honors the REAL coverage value (never silently 70)', () => {
        expect.hasAssertions();

        const coveragePct = 42;
        const result = calculateReleaseScore(undefined, 85, 'pass', coveragePct, 5);

        const coverageEntry = result.breakdown.find((b) => b.label === 'Coverage');

        expect(coverageEntry).toBeDefined();
        expect(coverageEntry?.score).toBe(coveragePct);
        expect(coverageEntry?.score).not.toBe(70);
        expect(coverageEntry?.noData).toBeUndefined();
    });

    it('reports Tasks dimension as no-data when no real source exists (no fabricated 80)', () => {
        expect.hasAssertions();

        const result = calculateReleaseScore(undefined, 85, 'pass', 42, 5);

        const tasksEntry = result.breakdown.find((b) => b.label === 'Tasks');

        expect(tasksEntry?.noData).toBeTruthy();
        expect(tasksEntry?.score).toBe(0);
        expect(result.recommendation).toContain('no data source');
    });

    it('composite score renormalizes over available dimensions (undefined excluded, not weighted as 80)', () => {
        expect.hasAssertions();

        const result = calculateReleaseScore(undefined, 80, 'pass', 60, 10);
        const weightSum = 0.3 + 0.25 + 0.2;
        const expected = Math.round((80 * 0.3 + 60 * 0.25 + invertFlakiness(10) * 0.2) / weightSum);

        expect(result.score).toBe(expected);
        expect(result.score).not.toBe(70);
    });

    it('hTML renders N/A for a no-data dimension (zero-silencing: visible gap, not fabricated 80)', () => {
        expect.hasAssertions();

        const result = calculateReleaseScore(undefined, 85, 'pass', 42, 5);
        const html = generateReleaseScoreHtml(result);

        expect(html).toContain('N/A');
        expect(html).toContain('no data');
        expect(html).not.toContain('>80<');
    });
});

function invertFlakiness(flakyRate: number): number {
    if (!Number.isFinite(flakyRate)) return 0;
    return Math.max(0, Math.min(100, 100 - flakyRate));
}
