/**
 * Unit tests — Release Score (B3 SSOT).
 *
 * Exercises the single implementation `calcReleaseScore` (5-dimension model)
 * and the renderer `generateReleaseScoreHtml`.
 *
 * Grade boundaries and weights are the DORA/Google SRE constants defined in
 * shared/data-hub/compute/types.ts (excellent>=90, good>=80, needs_attention>=70,
 * poor>=60, critical<60).
 */
import { describe, expect, it } from 'vitest';

import { calcReleaseScore, makeDimensionScore } from '../data-hub/compute/release-score.js';
import { DEFAULT_WEIGHTS } from '../data-hub/compute/types.js';
import { generateReleaseScoreHtml } from '../quality/release-score-renderer.js';
import type { HealthDimensions, ReleaseScoreResult } from '../types/data-hub.js';

function allDims(score: number, status: 'pass' | 'fail'): HealthDimensions {
    return {
        passRate: { score, status },
        flakyRate: { score, status },
        coverage: { score, status },
        suiteSpeed: { score, status },
        executionRate: { score, status },
    };
}

describe('CalcReleaseScore (B3 SSOT — 5-dimension model)', () => {
    describe('Grade boundaries', () => {
        it('grades excellent at score >= 90', () => {
            const result = calcReleaseScore(allDims(100, 'pass'));

            expect(result.score).toBe(100);
            expect(result.grade).toBe('excellent');
        });

        it('grades good at score 80–89', () => {
            const result = calcReleaseScore(allDims(85, 'pass'));

            expect(result.score).toBe(85);
            expect(result.grade).toBe('good');
        });

        it('grades needs_attention at score 70–79', () => {
            const result = calcReleaseScore(allDims(75, 'pass'));

            expect(result.score).toBe(75);
            expect(result.grade).toBe('needs_attention');
        });

        it('grades poor at score 60–69', () => {
            const result = calcReleaseScore(allDims(65, 'pass'));

            expect(result.score).toBe(65);
            expect(result.grade).toBe('poor');
        });

        it('grades critical at score < 60', () => {
            const result = calcReleaseScore(allDims(50, 'fail'));

            expect(result.score).toBe(50);
            expect(result.grade).toBe('critical');
        });

        it('boundary: 89 is good, 90 is excellent', () => {
            expect(calcReleaseScore(allDims(89, 'pass')).grade).toBe('good');
            expect(calcReleaseScore(allDims(90, 'pass')).grade).toBe('excellent');
        });

        it('boundary: 79 is needs_attention, 80 is good', () => {
            expect(calcReleaseScore(allDims(79, 'pass')).grade).toBe('needs_attention');
            expect(calcReleaseScore(allDims(80, 'pass')).grade).toBe('good');
        });

        it('boundary: 59 is critical, 60 is poor', () => {
            expect(calcReleaseScore(allDims(59, 'fail')).grade).toBe('critical');
            expect(calcReleaseScore(allDims(60, 'pass')).grade).toBe('poor');
        });
    });

    describe('Weighted average (DEFAULT_WEIGHTS)', () => {
        const single = (winner: keyof HealthDimensions): HealthDimensions => {
            const dims = allDims(0, 'fail');
            dims[winner] = { score: 100, status: 'pass' };
            return dims;
        };

        it('passRate contributes 30%', () => {
            expect(calcReleaseScore(single('passRate')).score).toBe(DEFAULT_WEIGHTS.passRate);
        });

        it('flakyRate contributes 20%', () => {
            expect(calcReleaseScore(single('flakyRate')).score).toBe(DEFAULT_WEIGHTS.flakyRate);
        });

        it('coverage contributes 25%', () => {
            expect(calcReleaseScore(single('coverage')).score).toBe(DEFAULT_WEIGHTS.coverage);
        });

        it('executionRate contributes 15%', () => {
            expect(calcReleaseScore(single('executionRate')).score).toBe(DEFAULT_WEIGHTS.executionRate);
        });

        it('suiteSpeed contributes 10%', () => {
            expect(calcReleaseScore(single('suiteSpeed')).score).toBe(DEFAULT_WEIGHTS.suiteSpeed);
        });

        it('weights sum to 100', () => {
            const sum = [
                DEFAULT_WEIGHTS.passRate,
                DEFAULT_WEIGHTS.flakyRate,
                DEFAULT_WEIGHTS.coverage,
                DEFAULT_WEIGHTS.executionRate,
                DEFAULT_WEIGHTS.suiteSpeed,
            ].reduce((s, v) => s + v, 0);

            expect(sum).toBe(100);
        });
    });

    describe('Breakdown', () => {
        it('includes all five dimensions in fixed order', () => {
            const result = calcReleaseScore(allDims(80, 'pass'));
            const labels = (result.breakdown ?? []).map((d) => d.label);

            expect(labels).toStrictEqual(['Pass Rate', 'Flaky Rate', 'Coverage', 'Suite Speed', 'Execution Rate']);
        });

        it('reports pass status when all dimensions pass', () => {
            const result = calcReleaseScore(allDims(100, 'pass'));

            expect((result.breakdown ?? []).every((d) => d.status === 'pass')).toBeTruthy();
        });

        it('reports fail status when all dimensions fail', () => {
            const result = calcReleaseScore(allDims(0, 'fail'));

            expect((result.breakdown ?? []).every((d) => d.status === 'fail')).toBeTruthy();
        });

        it('carries the per-dimension score through the breakdown', () => {
            expect.hasAssertions();

            const result = calcReleaseScore(allDims(72, 'pass'));

            for (const d of result.breakdown ?? []) {
                expect(d.score).toBe(72);
            }
        });
    });

    describe('Recommendation', () => {
        it('returns ready message when all dimensions pass', () => {
            const result = calcReleaseScore(allDims(100, 'pass'));

            expect(result.recommendation).toBe('All dimensions meet the release threshold. Ready for release.');
        });

        it('recommends improvement when a single dimension fails', () => {
            const dims: HealthDimensions = {
                passRate: { score: 100, status: 'pass' },
                flakyRate: { score: 100, status: 'pass' },
                coverage: { score: 30, status: 'fail' },
                suiteSpeed: { score: 100, status: 'pass' },
                executionRate: { score: 100, status: 'pass' },
            };

            expect(calcReleaseScore(dims).recommendation).toBe('Improve Coverage before release.');
        });

        it('lists all failing dimensions separated by commas', () => {
            const dims: HealthDimensions = {
                passRate: { score: 30, status: 'fail' },
                flakyRate: { score: 40, status: 'fail' },
                coverage: { score: 50, status: 'fail' },
                suiteSpeed: { score: 100, status: 'pass' },
                executionRate: { score: 100, status: 'pass' },
            };

            expect(calcReleaseScore(dims).recommendation).toBe(
                'Improve Pass Rate, Flaky Rate, Coverage before release.',
            );
        });

        it('all dimensions unavailable -> cannot be assessed (no partial scoring)', () => {
            const availability = {
                passRate: false,
                flakyRate: false,
                coverage: false,
                suiteSpeed: false,
                executionRate: false,
            };

            const result = calcReleaseScore(allDims(100, 'pass'), DEFAULT_WEIGHTS, availability);

            expect(result.score).toBe(0);
            expect(result.grade).toBe('unknown');
            expect(result.recommendation).toBe('Insufficient data — release score could not be assessed.');
            expect((result.breakdown ?? []).every((d) => d.noData && d.status === 'fail')).toBeTruthy();
        });

        it('partial data -> names the missing dimensions in the recommendation', () => {
            const availability = {
                passRate: true,
                flakyRate: false,
                coverage: true,
                suiteSpeed: false,
                executionRate: false,
            };

            const result = calcReleaseScore(allDims(70, 'pass'), DEFAULT_WEIGHTS, availability);

            expect(result.recommendation).toBe(
                'Insufficient data for Flaky Rate, Suite Speed, Execution Rate — assessment is partial.',
            );
            expect((result.breakdown ?? []).filter((d) => d.noData).map((d) => d.label)).toStrictEqual([
                'Flaky Rate',
                'Suite Speed',
                'Execution Rate',
            ]);
        });

        it('failing AND missing dimensions -> both parts present, space-joined', () => {
            const dims: HealthDimensions = {
                passRate: { score: 30, status: 'fail' },
                flakyRate: { score: 100, status: 'pass' },
                coverage: { score: 100, status: 'pass' },
                suiteSpeed: { score: 100, status: 'pass' },
                executionRate: { score: 100, status: 'pass' },
            };
            const availability = {
                passRate: true,
                flakyRate: false,
                coverage: false,
                suiteSpeed: false,
                executionRate: false,
            };

            const result = calcReleaseScore(dims, DEFAULT_WEIGHTS, availability);

            expect(result.recommendation).toBe(
                'Improve Pass Rate before release. Insufficient data for Flaky Rate, Coverage, Suite Speed, Execution Rate — assessment is partial.',
            );
        });
    });

    describe('Edge cases', () => {
        it('handles all zeros', () => {
            const result = calcReleaseScore(allDims(0, 'fail'));

            expect(result.score).toBe(0);
            expect(result.grade).toBe('critical');
            expect((result.breakdown ?? []).every((d) => d.status === 'fail')).toBeTruthy();
        });

        it('handles all perfect with pass status', () => {
            const result = calcReleaseScore(allDims(100, 'pass'));

            expect(result.score).toBe(100);
            expect(result.grade).toBe('excellent');
            expect((result.breakdown ?? []).every((d) => d.status === 'pass')).toBeTruthy();
        });

        it('naN dimension score never propagates to the composite (guarded §24)', () => {
            const dims: HealthDimensions = {
                passRate: { score: Number.NaN, status: 'fail' },
                flakyRate: { score: 100, status: 'pass' },
                coverage: { score: 100, status: 'pass' },
                suiteSpeed: { score: 100, status: 'pass' },
                executionRate: { score: 100, status: 'pass' },
            };

            const result = calcReleaseScore(dims);

            expect(Number.isFinite(result.score)).toBeTruthy();
            expect(result.score).toBeGreaterThanOrEqual(0);
        });

        it('infinity dimension score never propagates to the composite', () => {
            const dims: HealthDimensions = {
                passRate: { score: Infinity, status: 'fail' },
                flakyRate: { score: 100, status: 'pass' },
                coverage: { score: 100, status: 'pass' },
                suiteSpeed: { score: 100, status: 'pass' },
                executionRate: { score: 100, status: 'pass' },
            };

            const result = calcReleaseScore(dims);

            expect(Number.isFinite(result.score)).toBeTruthy();
            expect(result.score).toBeGreaterThanOrEqual(0);
        });

        it('zero total weight yields score 0 and grade unknown', () => {
            const weights = { passRate: 0, flakyRate: 0, coverage: 0, suiteSpeed: 0, executionRate: 0 };

            const result = calcReleaseScore(allDims(100, 'pass'), weights);

            expect(result.score).toBe(0);
            expect(result.grade).toBe('unknown');
        });

        it('produces an ISO timestamp', () => {
            const result = calcReleaseScore(allDims(80, 'pass'));

            expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
        });

        it('makeDimensionScore: pass at/above threshold, fail below', () => {
            expect.hasAssertions();

            expect(makeDimensionScore(95, 90).status).toBe('pass');
            expect(makeDimensionScore(80, 90).status).toBe('fail');
        });
    });
});

describe('GenerateReleaseScoreHtml (renderer)', () => {
    const result: ReleaseScoreResult = {
        score: 85,
        dimensions: allDims(85, 'pass'),
        grade: 'good',
        breakdown: [
            { label: 'Pass Rate', score: 85, status: 'pass' },
            { label: 'Flaky Rate', score: 85, status: 'pass' },
            { label: 'Coverage', score: 85, status: 'pass' },
            { label: 'Suite Speed', score: 85, status: 'pass' },
            { label: 'Execution Rate', score: 85, status: 'pass' },
        ],
        recommendation: 'All dimensions meet the release threshold. Ready for release.',
        timestamp: '2026-06-03T12:00:00.000Z',
    };

    it('returns a string', () => {
        expect(typeof generateReleaseScoreHtml(result)).toBe('string');
    });

    it('contains the page title', () => {
        expect(generateReleaseScoreHtml(result)).toContain('Release Readiness Score');
    });

    it('contains the score value', () => {
        expect(generateReleaseScoreHtml(result)).toContain('85');
    });

    it('contains the grade', () => {
        expect(generateReleaseScoreHtml(result)).toContain('good');
    });

    it('contains the recommendation', () => {
        expect(generateReleaseScoreHtml(result)).toContain(
            'All dimensions meet the release threshold. Ready for release.',
        );
    });

    it('contains breakdown items', () => {
        expect.hasAssertions();

        const html = generateReleaseScoreHtml(result);
        for (const item of result.breakdown ?? []) {
            expect(html).toContain(item.label);
            expect(html).toContain(String(item.score));
        }
    });

    it('builds a valid HTML document structure', () => {
        const html = generateReleaseScoreHtml(result);

        expect(html).toMatch(/^<!DOCTYPE html>/);
        expect(html).toContain('</html>');
        expect(html).toContain('<head>');
        expect(html).toContain('<body>');
    });

    it('includes generated footer', () => {
        expect(generateReleaseScoreHtml(result)).toContain('Generated by QA Tools');
    });

    it('includes theme script', () => {
        expect(generateReleaseScoreHtml(result)).toContain('qa-report-theme');
    });
});

describe('GenerateReleaseScoreHtml — availability rendering (B3/§25)', () => {
    function renderResult(overrides: Partial<ReleaseScoreResult>): string {
        return generateReleaseScoreHtml({
            score: 0,
            dimensions: allDims(0, 'fail'),
            grade: 'unknown',
            breakdown: [
                { label: 'Pass Rate', score: 90, status: 'pass' },
                { label: 'Flaky Rate', score: 85, status: 'pass' },
                { label: 'Coverage', score: 40, status: 'fail' },
            ],
            recommendation: 'All dimensions meet the release threshold. Ready for release.',
            ...overrides,
        });
    }

    it('null result renders the explicit no-data empty state', () => {
        expect.hasAssertions();

        const html = generateReleaseScoreHtml(null);

        expect(html).toContain('No release score data available');
        expect(html).toContain('Run the release score analysis with valid pipeline and quality data.');
    });

    it('all-noData result renders the insufficient-data empty state, never a fabricated score', () => {
        expect.hasAssertions();

        const html = renderResult({
            score: 0,
            breakdown: [
                { label: 'Coverage', score: 0, status: 'fail', noData: true },
                { label: 'Suite Speed', score: 0, status: 'fail', noData: true },
            ],
        });

        expect(html).toContain('Insufficient data for release score');
        expect(html).toContain('<h1>Release Readiness Score</h1>');
        expect(html).toContain('No dimension had a data source');
        expect(html).toContain('Run the release score analysis with valid pipeline and quality data.');
        expect(html).toContain('data-icon="info"');
    });

    it('counts checks over available dimensions only (noData excluded from numerator and denominator)', () => {
        expect.hasAssertions();

        // Domínio: 2 disponíveis passam, 1 disponível falha, 2 sem fonte de dados.
        // Checks Passed = 2/3 (noData fora do denominador); a única falha disponível
        // é nomeada na ação de correção. Score 85 (>= GATE) mantém Score/Grade/Gate
        // em success — o único metric-card warn é o Checks Passed, isolando a
        // severidade baseada em failedChecks.
        const html = renderResult({
            score: 85,
            breakdown: [
                { label: 'Pass Rate', score: 90, status: 'pass' },
                { label: 'Flaky Rate', score: 85, status: 'pass' },
                { label: 'Coverage', score: 40, status: 'fail' },
                { label: 'Suite Speed', score: 0, status: 'fail', noData: true },
                { label: 'Execution Rate', score: 0, status: 'fail', noData: true },
            ],
        });

        expect(html).toContain('2/3');
        expect(html).toContain('<h1>Release Readiness Score</h1>');
        expect(html).toContain('1 check(s) failed: Coverage');
        expect(html).toContain('data-component="metric-card" data-severity="warn"');
    });

    it('keeps the checks card success when only noData dimensions are failing', () => {
        expect.hasAssertions();

        const html = renderResult({
            score: 0,
            breakdown: [
                { label: 'Pass Rate', score: 90, status: 'pass' },
                { label: 'Flaky Rate', score: 85, status: 'pass' },
                { label: 'Coverage', score: 0, status: 'fail', noData: true },
                { label: 'Suite Speed', score: 0, status: 'fail', noData: true },
            ],
        });

        expect(html).toContain('data-component="metric-card" data-severity="success"');
        expect(html).not.toContain('data-component="metric-card" data-severity="warn"');
        expect(html).not.toContain('check(s) failed');
    });

    it('falls back to a default recommendation when the recommendation is blank', () => {
        expect.hasAssertions();

        const html = renderResult({ score: 90, recommendation: '   ' });

        expect(html).toContain('No recommendation available.');
    });
});
