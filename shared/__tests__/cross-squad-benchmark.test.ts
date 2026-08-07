import { computeCrossSquadBenchmark } from '../data-hub/compute/cross-squad-benchmark.js';

function makeSquads() {
    return [
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
            previousScore: 80,
        },
        {
            name: 'Squad Gamma',
            healthScore: 64,
            grade: 'C',
            passRate: 72,
            flakyRate: 15,
            coveragePct: 60,
            runCount: 70,
            previousScore: 60,
        },
        {
            name: 'Squad Delta',
            healthScore: 45,
            grade: 'D',
            passRate: 55,
            flakyRate: 25,
            coveragePct: 40,
            runCount: 40,
            previousScore: 50,
        },
    ];
}

describe('ComputeCrossSquadBenchmark', () => {
    it('sorts squads by healthScore descending', () => {
        const result = computeCrossSquadBenchmark(makeSquads());
        const scores = result.benchmarks.map((b) => b.healthScore);

        expect(scores).toStrictEqual([92, 78, 64, 45]);
    });

    it('identifies top squad', () => {
        const result = computeCrossSquadBenchmark(makeSquads());

        expect(result.topSquad).toBe('Squad Alpha');
    });

    it('identifies bottom squad', () => {
        const result = computeCrossSquadBenchmark(makeSquads());

        expect(result.bottomSquad).toBe('Squad Delta');
    });

    it('computes average score correctly', () => {
        const result = computeCrossSquadBenchmark(makeSquads());

        expect(result.averageScore).toBe(69.75);
    });

    it('computes stdDev for multiple squads', () => {
        const result = computeCrossSquadBenchmark(makeSquads());
        const expected = Math.sqrt(
            [(92 - 69.75) ** 2, (78 - 69.75) ** 2, (64 - 69.75) ** 2, (45 - 69.75) ** 2].reduce((a, b) => a + b, 0) / 4,
        );

        expect(result.stdDev).toBeCloseTo(expected, 10);
    });

    it('returns 0 stdDev for single squad', () => {
        const result = computeCrossSquadBenchmark([
            { name: 'Solo', healthScore: 80, grade: 'B', passRate: 90, flakyRate: 5, coveragePct: 75, runCount: 50 },
        ]);

        expect(result.stdDev).toBe(0);
    });

    it('handles empty projects array', () => {
        const result = computeCrossSquadBenchmark([]);

        expect(result.benchmarks).toStrictEqual([]);
        expect(result.topSquad).toBe('');
        expect(result.bottomSquad).toBe('');
        expect(result.averageScore).toBe(0);
        expect(result.stdDev).toBe(0);
        expect(result.timestamp).toBeDefined();
        expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it('handles single squad with same top and bottom', () => {
        const result = computeCrossSquadBenchmark([
            { name: 'Solo', healthScore: 75, grade: 'C', passRate: 80, flakyRate: 10, coveragePct: 65, runCount: 30 },
        ]);

        expect(result.benchmarks).toHaveLength(1);
        expect(result.topSquad).toBe('Solo');
        expect(result.bottomSquad).toBe('Solo');
        expect(result.averageScore).toBe(75);
    });

    it('sets trend to up when current > previous', () => {
        const result = computeCrossSquadBenchmark([
            {
                name: 'Up Squad',
                healthScore: 90,
                grade: 'A',
                passRate: 95,
                flakyRate: 3,
                coveragePct: 80,
                runCount: 100,
                previousScore: 80,
            },
        ]);

        expect(result.benchmarks[0]?.trend).toBe('up');
    });

    it('sets trend to down when current < previous', () => {
        const result = computeCrossSquadBenchmark([
            {
                name: 'Down Squad',
                healthScore: 70,
                grade: 'B',
                passRate: 80,
                flakyRate: 10,
                coveragePct: 65,
                runCount: 50,
                previousScore: 85,
            },
        ]);

        expect(result.benchmarks[0]?.trend).toBe('down');
    });

    it('sets trend to stable when no previousScore', () => {
        const result = computeCrossSquadBenchmark([
            {
                name: 'New Squad',
                healthScore: 80,
                grade: 'B',
                passRate: 85,
                flakyRate: 5,
                coveragePct: 70,
                runCount: 60,
            },
        ]);

        expect(result.benchmarks[0]?.trend).toBe('stable');
    });

    it('sets trend to stable when scores equal', () => {
        const result = computeCrossSquadBenchmark([
            {
                name: 'Stable Squad',
                healthScore: 80,
                grade: 'B',
                passRate: 85,
                flakyRate: 5,
                coveragePct: 70,
                runCount: 60,
                previousScore: 80,
            },
        ]);

        expect(result.benchmarks[0]?.trend).toBe('stable');
    });

    it('does not mutate the input array', () => {
        const input = makeSquads();
        const original = [...input];
        computeCrossSquadBenchmark(input);

        expect(input).toStrictEqual(original);
    });

    it('includes timestamp in ISO format', () => {
        const result = computeCrossSquadBenchmark(makeSquads());

        expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it('preserves all squad fields in benchmark output', () => {
        const result = computeCrossSquadBenchmark(makeSquads());
        const alpha = result.benchmarks.find((b) => b.project === 'Squad Alpha');

        expect(alpha).toBeDefined();
        expect(alpha?.healthScore).toBe(92);
        expect(alpha?.grade).toBe('A');
        expect(alpha?.passRate).toBe(98);
        expect(alpha?.flakyRate).toBe(2);
        expect(alpha?.coveragePct).toBe(85);
        expect(alpha?.runCount).toBe(120);
    });

    it('filters out squad with NaN healthScore (G-02)', () => {
        const projects = [
            ...makeSquads(),
            {
                name: 'NaN Squad',
                healthScore: NaN,
                grade: 'F',
                passRate: 50,
                flakyRate: 10,
                coveragePct: 30,
                runCount: 10,
            },
        ];
        const result = computeCrossSquadBenchmark(projects);

        expect(result.benchmarks).toHaveLength(4);
        expect(result.benchmarks.find((b) => b.project === 'NaN Squad')).toBeUndefined();
        expect(Number.isNaN(result.averageScore)).toBeFalsy();
        expect(Number.isNaN(result.stdDev)).toBeFalsy();
    });

    it('filters out squad with negative passRate (G-02)', () => {
        const projects = [
            ...makeSquads(),
            {
                name: 'Invalid Squad',
                healthScore: 50,
                grade: 'C',
                passRate: -10,
                flakyRate: 5,
                coveragePct: 40,
                runCount: 20,
            },
        ];
        const result = computeCrossSquadBenchmark(projects);

        expect(result.benchmarks.find((b) => b.project === 'Invalid Squad')).toBeUndefined();
    });

    it('filters out squad with negative coveragePct (G-02)', () => {
        const projects = [
            ...makeSquads(),
            {
                name: 'Neg Coverage',
                healthScore: 50,
                grade: 'C',
                passRate: 70,
                flakyRate: 5,
                coveragePct: -1,
                runCount: 20,
            },
        ];
        const result = computeCrossSquadBenchmark(projects);

        expect(result.benchmarks.find((b) => b.project === 'Neg Coverage')).toBeUndefined();
        expect(result.benchmarks).toHaveLength(4);
    });

    it('filters out squad with negative runCount (G-02)', () => {
        const projects = [
            ...makeSquads(),
            {
                name: 'Neg RunCount',
                healthScore: 50,
                grade: 'C',
                passRate: 70,
                flakyRate: 5,
                coveragePct: 40,
                runCount: -3,
            },
        ];
        const result = computeCrossSquadBenchmark(projects);

        expect(result.benchmarks.find((b) => b.project === 'Neg RunCount')).toBeUndefined();
        expect(result.benchmarks).toHaveLength(4);
    });

    it('filters out squad with NaN flakyRate (G-02)', () => {
        const projects = [
            ...makeSquads(),
            {
                name: 'NaN Flaky',
                healthScore: 50,
                grade: 'C',
                passRate: 70,
                flakyRate: NaN,
                coveragePct: 40,
                runCount: 20,
            },
        ];
        const result = computeCrossSquadBenchmark(projects);

        expect(result.benchmarks.find((b) => b.project === 'NaN Flaky')).toBeUndefined();
        expect(result.benchmarks).toHaveLength(4);
    });

    it('handles null projects gracefully (G-02)', () => {
        const result = computeCrossSquadBenchmark(null);

        expect(result.benchmarks).toStrictEqual([]);
        expect(result.topSquad).toBe('');
        expect(result.bottomSquad).toBe('');
        expect(result.averageScore).toBe(0);
        expect(result.stdDev).toBe(0);
    });

    it('handles undefined projects gracefully (G-02)', () => {
        const result = computeCrossSquadBenchmark(undefined);

        expect(result.benchmarks).toStrictEqual([]);
        expect(result.topSquad).toBe('');
        expect(result.bottomSquad).toBe('');
        expect(result.averageScore).toBe(0);
        expect(result.stdDev).toBe(0);
    });
});
