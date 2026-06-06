import { nullAs } from './test-utils.js';
import { computeCrossSquadBenchmark, generateBenchmarkHtml } from './cross-squad-benchmark.js';
import type { CrossSquadResult } from './cross-squad-benchmark.js';

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

describe('computeCrossSquadBenchmark', () => {
    it('sorts squads by healthScore descending', async () => {
        const result = computeCrossSquadBenchmark(makeSquads());
        const scores = result.benchmarks.map((b) => b.healthScore);
        expect(scores).toEqual([92, 78, 64, 45]);
    });

    it('identifies top squad', async () => {
        const result = computeCrossSquadBenchmark(makeSquads());
        expect(result.topSquad).toBe('Squad Alpha');
    });

    it('identifies bottom squad', async () => {
        const result = computeCrossSquadBenchmark(makeSquads());
        expect(result.bottomSquad).toBe('Squad Delta');
    });

    it('computes average score correctly', async () => {
        const result = computeCrossSquadBenchmark(makeSquads());
        expect(result.averageScore).toBe(69.75);
    });

    it('computes stdDev for multiple squads', async () => {
        const result = computeCrossSquadBenchmark(makeSquads());
        const expected = Math.sqrt(
            [(92 - 69.75) ** 2, (78 - 69.75) ** 2, (64 - 69.75) ** 2, (45 - 69.75) ** 2].reduce((a, b) => a + b) / 4,
        );
        expect(result.stdDev).toBeCloseTo(expected, 10);
    });

    it('returns 0 stdDev for single squad', async () => {
        const result = computeCrossSquadBenchmark([
            { name: 'Solo', healthScore: 80, grade: 'B', passRate: 90, flakyRate: 5, coveragePct: 75, runCount: 50 },
        ]);
        expect(result.stdDev).toBe(0);
    });

    it('handles empty projects array', async () => {
        const result = computeCrossSquadBenchmark([]);
        expect(result.benchmarks).toEqual([]);
        expect(result.topSquad).toBe('');
        expect(result.bottomSquad).toBe('');
        expect(result.averageScore).toBe(0);
        expect(result.stdDev).toBe(0);
        expect(result.timestamp).toBeDefined();
    });

    it('handles single squad with same top and bottom', async () => {
        const result = computeCrossSquadBenchmark([
            { name: 'Solo', healthScore: 75, grade: 'C', passRate: 80, flakyRate: 10, coveragePct: 65, runCount: 30 },
        ]);
        expect(result.benchmarks).toHaveLength(1);
        expect(result.topSquad).toBe('Solo');
        expect(result.bottomSquad).toBe('Solo');
        expect(result.averageScore).toBe(75);
    });

    it('sets trend to up when current > previous', async () => {
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

    it('sets trend to down when current < previous', async () => {
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

    it('sets trend to stable when no previousScore', async () => {
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

    it('sets trend to stable when scores equal', async () => {
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

    it('does not mutate the input array', async () => {
        const input = makeSquads();
        const original = [...input];
        computeCrossSquadBenchmark(input);
        expect(input).toEqual(original);
    });

    it('includes timestamp in ISO format', async () => {
        const result = computeCrossSquadBenchmark(makeSquads());
        expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it('preserves all squad fields in benchmark output', async () => {
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
});

describe('generateBenchmarkHtml', () => {
    function makeResult(): CrossSquadResult {
        return computeCrossSquadBenchmark(makeSquads());
    }

    it('produces valid HTML document structure', async () => {
        const html = generateBenchmarkHtml(makeResult());
        expect(html).toContain('<!DOCTYPE html>');
        expect(html).toContain('<html');
        expect(html).toContain('<head>');
        expect(html).toContain('<body>');
        expect(html).toContain('</html>');
    });

    it('renders default title', async () => {
        const html = generateBenchmarkHtml(makeResult());
        expect(html).toContain('Cross-Squad Benchmark');
    });

    it('uses custom title when provided', async () => {
        const html = generateBenchmarkHtml(makeResult(), 'Sprint 11 Review');
        expect(html).toContain('Sprint 11 Review');
        expect(html).not.toContain('Cross-Squad Benchmark');
    });

    it('renders summary cards with average score', async () => {
        const html = generateBenchmarkHtml(makeResult());
        expect(html).toContain('Average Score');
        expect(html).toContain('69.8');
    });

    it('renders summary card with std deviation', async () => {
        const html = generateBenchmarkHtml(makeResult());
        expect(html).toContain('Std Deviation');
    });

    it('renders summary card with top squad name', async () => {
        const html = generateBenchmarkHtml(makeResult());
        expect(html).toContain('Top Squad');
        expect(html).toContain('Squad Alpha');
    });

    it('renders summary card with bottom squad name', async () => {
        const html = generateBenchmarkHtml(makeResult());
        expect(html).toContain('Bottom Squad');
        expect(html).toContain('Squad Delta');
    });

    it('renders leaderboard heading', async () => {
        const html = generateBenchmarkHtml(makeResult());
        expect(html).toContain('Leaderboard');
    });

    it('renders table with all squad rows', async () => {
        const html = generateBenchmarkHtml(makeResult());
        expect(html).toContain('Squad Alpha');
        expect(html).toContain('Squad Beta');
        expect(html).toContain('Squad Gamma');
        expect(html).toContain('Squad Delta');
    });

    it('renders grade badges with correct variants', async () => {
        const html = generateBenchmarkHtml(makeResult());
        expect(html).toContain('data-component="badge"');
        expect(html).toContain('data-variant="pass"');
        expect(html).toContain('data-variant="info"');
        expect(html).toContain('data-variant="warn"');
        expect(html).toContain('data-variant="fail"');
    });

    it('renders trend indicators for each squad', async () => {
        const result = computeCrossSquadBenchmark([
            {
                name: 'Trend Up',
                healthScore: 90,
                grade: 'A',
                passRate: 95,
                flakyRate: 3,
                coveragePct: 80,
                runCount: 100,
                previousScore: 80,
            },
            {
                name: 'Trend Down',
                healthScore: 60,
                grade: 'C',
                passRate: 70,
                flakyRate: 20,
                coveragePct: 55,
                runCount: 50,
                previousScore: 75,
            },
            {
                name: 'Trend Stable',
                healthScore: 75,
                grade: 'B',
                passRate: 85,
                flakyRate: 10,
                coveragePct: 70,
                runCount: 60,
                previousScore: 75,
            },
        ]);
        const html = generateBenchmarkHtml(result);
        expect(html).toContain('\u2191 Up');
        expect(html).toContain('\u2193 Down');
        expect(html).toContain('\u2192 Stable');
    });

    it('renders empty state when no benchmarks', async () => {
        const empty: CrossSquadResult = {
            benchmarks: [],
            topSquad: '',
            bottomSquad: '',
            averageScore: 0,
            stdDev: 0,
            timestamp: new Date().toISOString(),
        };
        const html = generateBenchmarkHtml(empty);
        expect(html).toContain('No squad data available');
        expect(html).toContain('Average Score');
        expect(html).not.toContain('data-row="squad-0"');
    });

    it('shows dash placeholders for empty benchmarks', async () => {
        const empty: CrossSquadResult = {
            benchmarks: [],
            topSquad: '',
            bottomSquad: '',
            averageScore: 0,
            stdDev: 0,
            timestamp: new Date().toISOString(),
        };
        const html = generateBenchmarkHtml(empty);
        expect(html).toContain('\u2014');
    });

    it('includes generated footer text', async () => {
        const html = generateBenchmarkHtml(makeResult());
        expect(html).toContain('Generated by QA Tools');
    });

    it('returns error HTML when result is null', async () => {
        const html = generateBenchmarkHtml(nullAs());
        expect(html).toContain('Error generating benchmark report');
    });

    it('sanitizes HTML in project names', async () => {
        const result = computeCrossSquadBenchmark([
            {
                name: '<script>alert("xss")</script>',
                healthScore: 50,
                grade: 'F',
                passRate: 50,
                flakyRate: 50,
                coveragePct: 50,
                runCount: 10,
            },
        ]);
        const html = generateBenchmarkHtml(result);
        expect(html).toContain('&lt;script&gt;alert');
        expect(html).not.toContain('<script>alert');
    });

    it('renders unknown grade with default badge variant', async () => {
        const result = computeCrossSquadBenchmark([
            {
                name: 'Squad X',
                healthScore: 60,
                grade: 'X',
                passRate: 70,
                flakyRate: 10,
                coveragePct: 60,
                runCount: 30,
            },
        ]);
        const html = generateBenchmarkHtml(result);
        expect(html).toContain('data-variant="default"');
        expect(html).toContain('Squad X');
    });
});
