import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../logger.js', () => ({
    rootLogger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), child: vi.fn().mockReturnThis() },
}));

vi.mock('../../config.js', () => ({
    default: { get: vi.fn(() => '') },
    get: vi.fn(() => ''),
}));

describe('Integration: Cross-Squad Benchmark (FT-25)', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    describe('FT-25a: generateBenchmarkHtml with data', () => {
        it('returns complete HTML document with data', async () => {
            const { computeCrossSquadBenchmark, generateBenchmarkHtml } =
                await import('../../cross-squad-benchmark.js');
            const projects = [
                {
                    name: 'Squad Alpha',
                    healthScore: 92,
                    grade: 'A',
                    passRate: 98,
                    flakyRate: 2,
                    coveragePct: 85,
                    runCount: 120,
                    previousScore: 88,
                },
                {
                    name: 'Squad Beta',
                    healthScore: 78,
                    grade: 'B',
                    passRate: 85,
                    flakyRate: 8,
                    coveragePct: 72,
                    runCount: 95,
                },
            ];
            const result = computeCrossSquadBenchmark(projects);
            const html = generateBenchmarkHtml(result, 'FT-25 Test');
            expect(html).toContain('<!DOCTYPE html>');
            expect(html).toContain('</html>');
            expect(html).toContain('FT-25 Test');
            expect(html).toContain('Squad Alpha');
            expect(html).toContain('Squad Beta');
            expect(html).toContain('Leaderboard');
            expect(html).toContain('Average Score');
        });

        it('shows empty state for no benchmarks', async () => {
            const { computeCrossSquadBenchmark, generateBenchmarkHtml } =
                await import('../../cross-squad-benchmark.js');
            const result = computeCrossSquadBenchmark([]);
            const html = generateBenchmarkHtml(result);
            expect(html).toContain('No squad data available');
            expect(html).toContain('\u2014');
        });

        it('uses custom title', async () => {
            const { computeCrossSquadBenchmark, generateBenchmarkHtml } =
                await import('../../cross-squad-benchmark.js');
            const result = computeCrossSquadBenchmark([]);
            const html = generateBenchmarkHtml(result, 'Sprint 11 Review');
            expect(html).toContain('Sprint 11 Review');
            expect(html).not.toContain('Cross-Squad Benchmark');
        });
    });

    describe('FT-25b: generateBenchmarkHtml error fallback', () => {
        it('returns error page when CSS dependency fails', async () => {
            const { generateBenchmarkHtml } = await import('../../cross-squad-benchmark.js');
            const html = generateBenchmarkHtml(null);
            expect(html).toContain('Error generating benchmark report');
        });

        it('returns error page when result is undefined', async () => {
            const { generateBenchmarkHtml } = await import('../../cross-squad-benchmark.js');
            const html = generateBenchmarkHtml(undefined);
            expect(html).toContain('Error generating benchmark report');
        });
    });

    describe('FT-25c: computeCrossSquadBenchmark edge cases', () => {
        it('handles null projects', async () => {
            const { computeCrossSquadBenchmark } = await import('../../cross-squad-benchmark.js');
            const result = computeCrossSquadBenchmark(null);
            expect(result.benchmarks).toEqual([]);
            expect(result.averageScore).toBe(0);
        });

        it('handles undefined projects', async () => {
            const { computeCrossSquadBenchmark } = await import('../../cross-squad-benchmark.js');
            const result = computeCrossSquadBenchmark(undefined);
            expect(result.benchmarks).toEqual([]);
            expect(result.averageScore).toBe(0);
        });
    });
});
