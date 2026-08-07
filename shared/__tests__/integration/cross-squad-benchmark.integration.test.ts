import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('Integration: Cross-Squad Benchmark (FT-25)', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    describe('FT-25c: computeCrossSquadBenchmark edge cases', () => {
        it('handles null projects', async () => {
            expect.hasAssertions();

            const { computeCrossSquadBenchmark } = await import('../../data-hub/compute/cross-squad-benchmark.js');
            const result = computeCrossSquadBenchmark(null);

            expect(result.benchmarks).toStrictEqual([]);
            expect(result.averageScore).toBe(0);
        });

        it('handles undefined projects', async () => {
            expect.hasAssertions();

            const { computeCrossSquadBenchmark } = await import('../../data-hub/compute/cross-squad-benchmark.js');
            const result = computeCrossSquadBenchmark(undefined);

            expect(result.benchmarks).toStrictEqual([]);
            expect(result.averageScore).toBe(0);
        });
    });
});
