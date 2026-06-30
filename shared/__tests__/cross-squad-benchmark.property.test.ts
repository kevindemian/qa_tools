import fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';
import { computeCrossSquadBenchmark, generateBenchmarkHtml } from '../cross-squad-benchmark.js';

vi.mock('../logger', () => ({
    rootLogger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), child: vi.fn().mockReturnThis() },
}));

vi.mock('../config', () => ({
    default: { get: vi.fn(() => '') },
    get: vi.fn(() => ''),
}));

type ProjectInput = {
    name: string;
    healthScore: number;
    grade: string;
    passRate: number;
    flakyRate: number;
    coveragePct: number;
    runCount: number;
    previousScore?: number;
};

const projectArb = fc
    .record({
        name: fc.stringMatching(/^[a-zA-Z0-9 _-]{1,20}$/),
        healthScore: fc.integer({ min: 0, max: 100 }),
        grade: fc.constantFrom('A', 'B', 'C', 'D', 'F'),
        passRate: fc.integer({ min: 0, max: 100 }),
        flakyRate: fc.integer({ min: 0, max: 100 }),
        coveragePct: fc.integer({ min: 0, max: 100 }),
        runCount: fc.integer({ min: 0, max: 1000 }),
        previousScore: fc.option(fc.integer({ min: 0, max: 100 }), { nil: undefined }),
    })
    .map((r): ProjectInput => ({
        name: r.name,
        healthScore: r.healthScore,
        grade: r.grade,
        passRate: r.passRate,
        flakyRate: r.flakyRate,
        coveragePct: r.coveragePct,
        runCount: r.runCount,
        ...(r.previousScore !== undefined ? { previousScore: r.previousScore } : {}),
    }));

describe('ComputeCrossSquadBenchmark — property-based', () => {
    it('sorts benchmarks by healthScore descending', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(
                fc.uniqueArray(projectArb, { selector: (p) => p.name, minLength: 0, maxLength: 10 }),
                (projects) => {
                    const result = computeCrossSquadBenchmark(projects);
                    for (let i = 1; i < result.benchmarks.length; i++) {
                        const curr: unknown = Reflect.get(result.benchmarks, i);
                        const prev: unknown = Reflect.get(result.benchmarks, i - 1);
                        if (curr === undefined || curr === null || prev === undefined || prev === null) return;

                        const c = curr as { healthScore: number };
                        const p = prev as { healthScore: number };

                        expect(c.healthScore).toBeLessThanOrEqual(p.healthScore);
                    }
                },
            ),
            { numRuns: 50 },
        );
    });

    it('computes average score correctly', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(
                fc.uniqueArray(projectArb, { selector: (p) => p.name, minLength: 0, maxLength: 10 }),
                (projects) => {
                    const result = computeCrossSquadBenchmark(projects);
                    const n = result.benchmarks.length;
                    const expectedAvg = n > 0 ? result.benchmarks.reduce((s, b) => s + b.healthScore, 0) / n : 0;

                    expect(result.averageScore).toBeCloseTo(expectedAvg, 10);
                },
            ),
            { numRuns: 50 },
        );
    });

    it('identifies top and bottom squads', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(
                fc.uniqueArray(projectArb, { selector: (p) => p.name, minLength: 0, maxLength: 10 }),
                (projects) => {
                    const result = computeCrossSquadBenchmark(projects);
                    const top = result.benchmarks[0];
                    const bottom = result.benchmarks[result.benchmarks.length - 1];
                    if (top === undefined || bottom === undefined) return;

                    expect(result.topSquad).toBe(result.benchmarks.length === 0 ? '' : top.project);
                    expect(result.bottomSquad).toBe(result.benchmarks.length === 0 ? '' : bottom.project);
                },
            ),
            { numRuns: 50 },
        );
    });

    it('stdDev is 0 for single squad', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(projectArb, (project) => {
                const result = computeCrossSquadBenchmark([project]);

                expect(result.stdDev).toBe(0);
            }),
            { numRuns: 50 },
        );
    });

    it('stdDev is always >= 0 (G-03)', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(
                fc.uniqueArray(projectArb, { selector: (p) => p.name, minLength: 2, maxLength: 10 }),
                (projects) => {
                    const result = computeCrossSquadBenchmark(projects);

                    expect(result.stdDev).toBeGreaterThanOrEqual(0);
                },
            ),
            { numRuns: 50 },
        );
    });

    it('stdDev is 0 when all health scores are equal (G-03)', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(
                fc.uniqueArray(
                    projectArb.map((p) => ({ ...p, healthScore: 75 })),
                    { selector: (p) => p.name, minLength: 2, maxLength: 10 },
                ),
                (projects) => {
                    const result = computeCrossSquadBenchmark(projects);

                    expect(result.stdDev).toBe(0);
                },
            ),
            { numRuns: 50 },
        );
    });

    it('trend matches healthScore comparison', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(
                fc.uniqueArray(projectArb, { selector: (p) => p.name, minLength: 0, maxLength: 10 }),
                (projects) => {
                    const result = computeCrossSquadBenchmark(projects);
                    for (const project of projects) {
                        const bench = result.benchmarks.find((b) => b.project === project.name);
                        if (bench === undefined) return;
                        let expectedTrend: string;
                        if (project.previousScore === undefined) {
                            expectedTrend = 'stable';
                        } else if (project.healthScore > project.previousScore) {
                            expectedTrend = 'up';
                        } else if (project.healthScore < project.previousScore) {
                            expectedTrend = 'down';
                        } else {
                            expectedTrend = 'stable';
                        }

                        expect(bench.trend).toBe(expectedTrend);
                    }
                },
            ),
            { numRuns: 50 },
        );
    });
});

describe('GenerateBenchmarkHtml — property-based', () => {
    it('always produces valid HTML', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(
                fc.uniqueArray(projectArb, { selector: (p) => p.name, minLength: 0, maxLength: 8 }),
                (projects) => {
                    const result = computeCrossSquadBenchmark(projects);
                    const html = generateBenchmarkHtml(result, 'PBT');

                    expect(html).toContain('<!DOCTYPE html>');
                    expect(html).toContain('</html>');
                },
            ),
            { numRuns: 50 },
        );
    });

    it('contains all project names', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(
                fc.uniqueArray(projectArb, { selector: (p) => p.name, minLength: 0, maxLength: 8 }),
                (projects) => {
                    const result = computeCrossSquadBenchmark(projects);
                    const html = generateBenchmarkHtml(result);
                    for (const p of projects) {
                        expect(html).toContain(p.name);
                    }
                },
            ),
            { numRuns: 50 },
        );
    });
});
