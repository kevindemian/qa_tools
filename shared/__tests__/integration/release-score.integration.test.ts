/**
 * Integration tests — Release Score (B3 SSOT)
 *
 * Validates the release readiness score calculation end-to-end (pure functions,
 * no filesystem dependencies):
 * - Weighted composite: passRate(30%) + flakyRate(20%) + coverage(25%) + executionRate(15%) + suiteSpeed(10%)
 * - Score 0-100 range
 * - Grade: excellent(>=90), good(>=80), needs_attention(>=70), poor(>=60), critical(<60)
 * - Breakdown array with per-dimension scores
 * - Recommendation text generation
 * - HTML generation
 */
import { describe, expect, it } from 'vitest';

import { calcReleaseScore } from '../../data-hub/compute/release-score.js';
import { generateReleaseScoreHtml } from '../../quality/release-score-renderer.js';
import type { HealthDimensions } from '../../types/data-hub.js';

function allDims(score: number, status: 'pass' | 'fail'): HealthDimensions {
    return {
        passRate: { score, status },
        flakyRate: { score, status },
        coverage: { score, status },
        suiteSpeed: { score, status },
        executionRate: { score, status },
    };
}

describe('Integration: Release Score', () => {
    describe('FT-14a: score calculation', () => {
        it('returns score in 0-100 range', () => {
            expect.hasAssertions();

            const result = calcReleaseScore(allDims(80, 'pass'));

            expect(result.score).toBeGreaterThanOrEqual(0);
            expect(result.score).toBeLessThanOrEqual(100);
        });

        it('weights: passRate=30%, flakyRate=20%, coverage=25%, executionRate=15%, suiteSpeed=10%', () => {
            expect.hasAssertions();

            const perfect = calcReleaseScore(allDims(100, 'pass'));

            expect(perfect.score).toBe(100);
            expect(perfect.grade).toBe('excellent');
        });

        it('all zeros → score 0', () => {
            expect.hasAssertions();

            const result = calcReleaseScore(allDims(0, 'fail'));

            expect(result.score).toBe(0);
            expect(result.grade).toBe('critical');
        });
    });

    describe('FT-14b: grade assignment', () => {
        it('excellent >= 90', () => {
            expect(calcReleaseScore(allDims(95, 'pass')).grade).toBe('excellent');
        });

        it('good >= 80', () => {
            expect(calcReleaseScore(allDims(85, 'pass')).grade).toBe('good');
        });

        it('needs_attention >= 70', () => {
            expect(calcReleaseScore(allDims(75, 'pass')).grade).toBe('needs_attention');
        });

        it('poor >= 60', () => {
            expect(calcReleaseScore(allDims(65, 'pass')).grade).toBe('poor');
        });

        it('critical < 60', () => {
            expect(calcReleaseScore(allDims(30, 'fail')).grade).toBe('critical');
        });
    });

    describe('FT-14c: breakdown', () => {
        it('has 5 dimension entries', () => {
            const result = calcReleaseScore(allDims(80, 'pass'));

            expect(result.breakdown).toHaveLength(5);
            expect(result.breakdown?.map((b) => b.label)).toStrictEqual([
                'Pass Rate',
                'Flaky Rate',
                'Coverage',
                'Suite Speed',
                'Execution Rate',
            ]);
        });
    });

    describe('FT-14d: recommendation', () => {
        it('says ready when all dimensions pass', () => {
            const result = calcReleaseScore(allDims(90, 'pass'));

            expect(result.recommendation).toContain('Ready');
        });

        it('lists failing dimensions', () => {
            const dims: HealthDimensions = {
                passRate: { score: 30, status: 'fail' },
                flakyRate: { score: 100, status: 'pass' },
                coverage: { score: 40, status: 'fail' },
                suiteSpeed: { score: 100, status: 'pass' },
                executionRate: { score: 100, status: 'pass' },
            };
            const result = calcReleaseScore(dims);

            expect(result.recommendation).toContain('Improve');
            expect(result.recommendation).toContain('Pass Rate');
            expect(result.recommendation).toContain('Coverage');
        });
    });

    describe('FT-14e: HTML generation', () => {
        it('generates valid HTML', () => {
            const result = calcReleaseScore(allDims(80, 'pass'));
            const html = generateReleaseScoreHtml(result);

            expect(html).toContain('<!DOCTYPE html>');
            expect(html).toContain('Release Readiness Score');
        });
    });

    describe('FT-14f: data attributes', () => {
        it('includes data-part="target" with quality-gate threshold', () => {
            const result = calcReleaseScore(allDims(80, 'pass'));
            const html = generateReleaseScoreHtml(result);

            expect(html).toContain('data-part="target"');
            expect(html).toContain('target: >=80%');
        });

        it('includes data-part="timestamp"', () => {
            const result = calcReleaseScore(allDims(50, 'fail'));
            const html = generateReleaseScoreHtml(result);

            expect(html).toContain('data-part="timestamp"');
        });
    });
});
