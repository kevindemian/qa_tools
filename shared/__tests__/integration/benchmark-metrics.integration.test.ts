/**
 * Integration tests — Benchmark Metrics (FT-15)
 *
 * Validates the test coverage benchmarking:
 * - Criteria coverage computation
 * - Partition coverage computation
 * - Boundary coverage computation
 * - Edge cases: empty test array, invalid JSON, no fixture ranges
 *
 * Pure function — no filesystem dependencies.
 */
import { describe, expect, it } from 'vitest';
import type { UserStoryFixture } from '../../prompts/__fixtures__/index.js';

function createFixture(overrides: Partial<UserStoryFixture['coverage']> = {}): UserStoryFixture {
    return {
        name: 'benchmark-fixture',
        description: 'Test fixture for benchmark metrics',
        input: { story: 'As a user I want to login', criteria: ['login', 'dashboard'] },
        validate: { type: 'json-array', minItems: 1, itemSchema: { title: 'string' } },
        coverage: {
            expectedCriteria: ['login', 'dashboard', 'settings'],
            numericRanges: [{ field: 'duration', min: 0, max: 100 }],
            ...overrides,
        },
    };
}

describe('Integration: Benchmark Metrics', () => {
    describe('FT-15a: computeCoverageMetrics', () => {
        it('computes criteria coverage from matching titles', async () => {expect.hasAssertions();

            const { computeCoverageMetrics } = await import('../../benchmark-metrics.js');
            const body = JSON.stringify([
                { title: 'login validates credentials', steps: ['enter username', 'enter password'] },
                { title: 'dashboard renders charts', steps: ['navigate to dashboard'] },
                { title: 'settings saves preferences', steps: ['change setting', 'save'] },
            ]);
            const fixture = createFixture();
            const result = computeCoverageMetrics(body, fixture);

            expect(result.totalTests).toBe(3);
            expect(result.criteriaCoverage).toBeGreaterThan(0);
        });

        it('returns zeros for empty test array', async () => {expect.hasAssertions();

            const { computeCoverageMetrics } = await import('../../benchmark-metrics.js');
            const body = JSON.stringify([]);
            const fixture = createFixture();
            const result = computeCoverageMetrics(body, fixture);

            expect(result.totalTests).toBe(0);
            expect(result.criteriaCoverage).toBe(0);
        });

        it('returns zeros for invalid JSON', async () => {expect.hasAssertions();

            const { computeCoverageMetrics } = await import('../../benchmark-metrics.js');
            const result = computeCoverageMetrics('not json', createFixture());

            expect(result.totalTests).toBe(0);
        });

        it('returns zeros for non-array JSON', async () => {expect.hasAssertions();

            const { computeCoverageMetrics } = await import('../../benchmark-metrics.js');
            const result = computeCoverageMetrics('{"key": "value"}', createFixture());

            expect(result.totalTests).toBe(0);
        });

        it('computes partition coverage for numeric ranges', async () => {expect.hasAssertions();

            const { computeCoverageMetrics } = await import('../../benchmark-metrics.js');
            const body = JSON.stringify([
                { title: 'valid input', steps: ['enter 50'] },
                { title: 'below min', steps: ['enter -1'] },
                { title: 'above max', steps: ['enter 101'] },
            ]);
            const fixture = createFixture({ numericRanges: [{ field: 'value', min: 0, max: 100 }] });
            const result = computeCoverageMetrics(body, fixture);

            expect(result.partitionCoverage).toBeGreaterThan(0);
        });
    });
});

/* ── Phase 5: RED tests ────────────────────────────────────── */

describe('RED: G1 — catch vazio sem log', () => {
    vi.mock('../../logger.js');

    it('logs rootLogger.warn when JSON.parse fails (body inválido)', async () => {expect.hasAssertions();

        const { rootLogger } = await import('../../logger.js');
        const warnSpy = vi.spyOn(rootLogger, 'warn');
        const { computeCoverageMetrics } = await import('../../benchmark-metrics.js');
        const result = computeCoverageMetrics('not json', createFixture());

        expect(warnSpy).toHaveBeenCalled();
        expect(result.totalTests).toBe(0);
    });
});
