import { calculateReleaseScore, generateReleaseScoreHtml } from './release-score.js';
import type { ReleaseScoreResult } from './release-score.js';

describe('calculateReleaseScore', () => {
    describe('grade boundaries', () => {
        it('grades excellent at score >= 90', async () => {
            const result = calculateReleaseScore(100, 100, 'pass', 100, 0);
            expect(result.score).toBe(100);
            expect(result.grade).toBe('excellent');
        });

        it('grades good at score 70–89', async () => {
            const result = calculateReleaseScore(85, 85, 'pass', 85, 15);
            expect(result.score).toBe(85);
            expect(result.grade).toBe('good');
        });

        it('grades needs_attention at score 50–69', async () => {
            const result = calculateReleaseScore(65, 65, 'pass', 65, 35);
            expect(result.score).toBe(65);
            expect(result.grade).toBe('needs_attention');
        });

        it('grades critical at score < 50', async () => {
            const result = calculateReleaseScore(30, 30, 'fail', 30, 70);
            expect(result.score).toBe(30);
            expect(result.grade).toBe('critical');
        });

        it('boundary: 89 is good, 90 is excellent', async () => {
            const r89 = calculateReleaseScore(89, 89, 'pass', 89, 11);
            expect(r89.score).toBe(89);
            expect(r89.grade).toBe('good');

            const r90 = calculateReleaseScore(90, 90, 'pass', 90, 10);
            expect(r90.score).toBe(90);
            expect(r90.grade).toBe('excellent');
        });

        it('boundary: 49 is critical, 50 is needs_attention', async () => {
            const r49 = calculateReleaseScore(49, 49, 'fail', 49, 51);
            expect(r49.score).toBe(49);
            expect(r49.grade).toBe('critical');

            const r50 = calculateReleaseScore(50, 50, 'pass', 50, 50);
            expect(r50.score).toBe(50);
            expect(r50.grade).toBe('needs_attention');
        });

        it('boundary: 69 is needs_attention, 70 is good', async () => {
            const r69 = calculateReleaseScore(69, 69, 'pass', 69, 31);
            expect(r69.score).toBe(69);
            expect(r69.grade).toBe('needs_attention');

            const r70 = calculateReleaseScore(70, 70, 'pass', 70, 30);
            expect(r70.score).toBe(70);
            expect(r70.grade).toBe('good');
        });
    });

    describe('flakiness inversion', () => {
        it('inverts flakyRate 0 to score contribution 100', async () => {
            const result = calculateReleaseScore(100, 100, 'pass', 100, 0);
            expect(result.score).toBe(100);
        });

        it('inverts flakyRate 100 to score contribution 0', async () => {
            const result = calculateReleaseScore(0, 0, 'fail', 0, 100);
            expect(result.score).toBe(0);
        });

        it('inverts flakyRate 50 to score contribution 50', async () => {
            const result = calculateReleaseScore(50, 50, 'pass', 50, 50);
            expect(result.score).toBe(50);
        });
    });

    describe('breakdown', () => {
        it('reports pass status when all dimensions meet threshold', async () => {
            const result = calculateReleaseScore(100, 100, 'pass', 100, 0);
            for (const item of result.breakdown) {
                expect(item.status).toBe('pass');
            }
        });

        it('reports fail status when dimensions are below threshold', async () => {
            const result = calculateReleaseScore(0, 0, 'fail', 0, 100);
            for (const item of result.breakdown) {
                expect(item.status).toBe('fail');
            }
        });

        it('uses healthGate for health dimension status', async () => {
            const result = calculateReleaseScore(100, 90, 'fail', 100, 0);
            const healthDim = result.breakdown.find((d) => d.label === 'Health');
            expect(healthDim?.status).toBe('fail');
            expect(healthDim?.score).toBe(90);
        });

        it('includes all four dimensions in breakdown', async () => {
            const result = calculateReleaseScore(80, 80, 'pass', 80, 20);
            const labels = result.breakdown.map((d) => d.label);
            expect(labels).toEqual(['Tasks', 'Health', 'Coverage', 'Flakiness']);
        });
    });

    describe('recommendation', () => {
        it('returns ready message when all dimensions pass', async () => {
            const result = calculateReleaseScore(100, 100, 'pass', 100, 0);
            expect(result.recommendation).toBe('All dimensions meet the release threshold. Ready for release.');
        });

        it('recommends improvement when single dimension fails', async () => {
            const result = calculateReleaseScore(30, 100, 'pass', 100, 0);
            expect(result.recommendation).toBe('Improve tasks before release.');
        });

        it('recommends improvement when health gate fails', async () => {
            const result = calculateReleaseScore(100, 90, 'fail', 100, 0);
            expect(result.recommendation).toBe('Improve health before release.');
        });

        it('recommends improvement when multiple dimensions fail', async () => {
            const result = calculateReleaseScore(30, 40, 'fail', 50, 60);
            expect(result.recommendation).toContain('Improve');
            expect(result.recommendation).toContain('tasks');
            expect(result.recommendation).toContain('health');
        });

        it('lists all failing dimensions separated by commas', async () => {
            const result = calculateReleaseScore(0, 0, 'fail', 0, 100);
            expect(result.recommendation).toBe('Improve tasks, health, coverage, flakiness before release.');
        });
    });

    describe('edge cases', () => {
        it('handles all zeros', async () => {
            const result = calculateReleaseScore(0, 0, 'fail', 0, 100);
            expect(result.score).toBe(0);
            expect(result.grade).toBe('critical');
            expect(result.breakdown.every((d) => d.status === 'fail')).toBe(true);
        });

        it('handles perfect score with healthGate pass', async () => {
            const result = calculateReleaseScore(100, 100, 'pass', 100, 0);
            expect(result.score).toBe(100);
            expect(result.breakdown.every((d) => d.status === 'pass')).toBe(true);
            expect(result.grade).toBe('excellent');
        });

        it('handles healthGate fail with high healthScore', async () => {
            const result = calculateReleaseScore(100, 95, 'fail', 100, 0);
            expect(result.score).toBe(99);
            expect(result.grade).toBe('excellent');
            const healthDim = result.breakdown.find((d) => d.label === 'Health');
            expect(healthDim?.status).toBe('fail');
        });

        it('handles flakyRate overflow beyond 100', async () => {
            const result = calculateReleaseScore(100, 100, 'pass', 100, 150);
            expect(result.score).toBe(80);
        });

        it('handles flakyRate negative', async () => {
            const result = calculateReleaseScore(100, 100, 'pass', 100, -10);
            expect(result.score).toBe(100);
        });

        it('produces timestamp in ISO format', async () => {
            const result = calculateReleaseScore(80, 80, 'pass', 80, 20);
            expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
        });
    });

    describe('weighted average', () => {
        it('computes tasks at 25% weight', async () => {
            const result = calculateReleaseScore(100, 0, 'fail', 0, 100);
            expect(result.score).toBe(25);
        });

        it('computes health at 30% weight', async () => {
            const result = calculateReleaseScore(0, 100, 'pass', 0, 100);
            expect(result.score).toBe(30);
        });

        it('computes coverage at 25% weight', async () => {
            const result = calculateReleaseScore(0, 0, 'fail', 100, 100);
            expect(result.score).toBe(25);
        });

        it('computes flakiness at 20% weight', async () => {
            const result = calculateReleaseScore(0, 0, 'fail', 0, 0);
            expect(result.score).toBe(20);
        });
    });
});

describe('generateReleaseScoreHtml', () => {
    const result: ReleaseScoreResult = {
        score: 85,
        grade: 'good',
        breakdown: [
            { label: 'Tasks', score: 80, status: 'pass' },
            { label: 'Health', score: 90, status: 'pass' },
            { label: 'Coverage', score: 70, status: 'pass' },
            { label: 'Flakiness', score: 100, status: 'pass' },
        ],
        recommendation: 'All dimensions meet the release threshold. Ready for release.',
        timestamp: '2026-06-03T12:00:00.000Z',
    };

    it('returns a string', async () => {
        const html = generateReleaseScoreHtml(result);
        expect(typeof html).toBe('string');
    });

    it('contains the page title', async () => {
        const html = generateReleaseScoreHtml(result);
        expect(html).toContain('Release Readiness Score');
    });

    it('contains the score value', async () => {
        const html = generateReleaseScoreHtml(result);
        expect(html).toContain('85');
    });

    it('contains the grade', async () => {
        const html = generateReleaseScoreHtml(result);
        expect(html).toContain('good');
    });

    it('contains the recommendation', async () => {
        const html = generateReleaseScoreHtml(result);
        expect(html).toContain('All dimensions meet the release threshold. Ready for release.');
    });

    it('contains breakdown items', async () => {
        const html = generateReleaseScoreHtml(result);
        for (const item of result.breakdown) {
            expect(html).toContain(item.label);
            expect(html).toContain(String(item.score));
        }
    });

    it('builds a valid HTML document structure', async () => {
        const html = generateReleaseScoreHtml(result);
        expect(html).toMatch(/^<!DOCTYPE html>/);
        expect(html).toContain('</html>');
        expect(html).toContain('<head>');
        expect(html).toContain('<body>');
    });

    it('includes generated footer', async () => {
        const html = generateReleaseScoreHtml(result);
        expect(html).toContain('Generated by QA Tools');
    });

    it('includes theme script', async () => {
        const html = generateReleaseScoreHtml(result);
        expect(html).toContain('qa-report-theme');
    });
});
