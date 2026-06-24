/**
 * Integration tests — Release Score (FT-14)
 *
 * Validates the release readiness score calculation:
 * - Weighted composite: tasks(25%) + health(30%) + coverage(25%) + flakiness(20%)
 * - Score 0-100 range
 * - Grade: excellent(≥90), good(≥70), needs_attention(≥50), critical(<50)
 * - Breakdown array with per-dimension scores
 * - Recommendation text generation
 * - HTML generation
 *
 * Pure function — no filesystem dependencies.
 */
import { describe, expect, it } from 'vitest';

describe('Integration: Release Score', () => {
    describe('FT-14a: score calculation', () => {
        it('returns score in 0-100 range', async () => {expect.hasAssertions();

            const { calculateReleaseScore } = await import('../../release-score.js');
            const result = calculateReleaseScore(80, 85, 'pass', 90, 5);

            expect(result.score).toBeGreaterThanOrEqual(0);
            expect(result.score).toBeLessThanOrEqual(100);
        });

        it('weights: tasks=25%, health=30%, coverage=25%, flakiness=20%', async () => {expect.hasAssertions();

            const { calculateReleaseScore } = await import('../../release-score.js');
            // All dimensions at 100 → score should be ~100
            const perfect = calculateReleaseScore(100, 100, 'pass', 100, 0);

            expect(perfect.score).toBe(100);
            expect(perfect.grade).toBe('excellent');
        });

        it('all zeros → score 0', async () => {expect.hasAssertions();

            const { calculateReleaseScore } = await import('../../release-score.js');
            const result = calculateReleaseScore(0, 0, 'fail', 0, 100);

            expect(result.score).toBe(0);
            expect(result.grade).toBe('critical');
        });
    });

    describe('FT-14b: grade assignment', () => {
        it('excellent ≥ 90', async () => {expect.hasAssertions();

            const { calculateReleaseScore } = await import('../../release-score.js');
            const result = calculateReleaseScore(90, 95, 'pass', 90, 2);

            expect(result.grade).toBe('excellent');
        });

        it('good ≥ 70', async () => {expect.hasAssertions();

            const { calculateReleaseScore } = await import('../../release-score.js');
            const result = calculateReleaseScore(70, 75, 'pass', 70, 10);

            expect(result.grade).toBe('good');
        });

        it('critical < 50', async () => {expect.hasAssertions();

            const { calculateReleaseScore } = await import('../../release-score.js');
            const result = calculateReleaseScore(30, 30, 'fail', 30, 50);

            expect(result.grade).toBe('critical');
        });
    });

    describe('FT-14c: breakdown', () => {
        it('has 4 dimension entries', async () => {expect.hasAssertions();

            const { calculateReleaseScore } = await import('../../release-score.js');
            const result = calculateReleaseScore(80, 85, 'pass', 90, 5);

            expect(result.breakdown).toHaveLength(4);
            expect(result.breakdown.map((b) => b.label)).toStrictEqual(['Tasks', 'Health', 'Coverage', 'Flakiness']);
        });
    });

    describe('FT-14d: recommendation', () => {
        it('says ready when all dimensions pass', async () => {expect.hasAssertions();

            const { calculateReleaseScore } = await import('../../release-score.js');
            const result = calculateReleaseScore(90, 95, 'pass', 90, 2);

            expect(result.recommendation).toContain('Ready');
        });

        it('lists failing dimensions', async () => {expect.hasAssertions();

            const { calculateReleaseScore } = await import('../../release-score.js');
            const result = calculateReleaseScore(30, 50, 'fail', 40, 50);

            expect(result.recommendation).toContain('Improve');
        });
    });

    describe('FT-14e: HTML generation', () => {
        it('generates valid HTML', async () => {expect.hasAssertions();

            const { calculateReleaseScore, generateReleaseScoreHtml } = await import('../../release-score.js');
            const result = calculateReleaseScore(80, 85, 'pass', 90, 5);
            const html = generateReleaseScoreHtml(result);

            expect(html).toContain('<!DOCTYPE html>');
            expect(html).toContain('Release Readiness Score');
        });
    });
});
