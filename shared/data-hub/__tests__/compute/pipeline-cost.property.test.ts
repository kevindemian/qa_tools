/**
 * Property-based tests for Pipeline Cost compute function.
 *
 * Invariants:
 * - Result is always >= 0
 * - Cost is proportional to duration
 * - Empty runs always return zero
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { calcPipelineCost } from '../../compute/pipeline-cost.js';
import type { PipelineRun } from '../../../types/ci-cd.js';

/* ── Helpers ────────────────────────────────────────────────────────────── */

function makeRun(startMs: number, durationMs: number): PipelineRun {
    return {
        id: 1,
        run_started_at: new Date(startMs).toISOString(),
        updated_at: new Date(startMs + durationMs).toISOString(),
        conclusion: 'success',
    };
}

/* ── Tests ──────────────────────────────────────────────────────────────── */

describe('Compute/pipeline-cost (PBT)', () => {
    it('result is always >= 0', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(
                fc.array(
                    fc.record({
                        id: fc.integer({ min: 1, max: 1000 }),
                        run_started_at: fc.constant('2026-01-01T00:00:00Z'),
                        updated_at: fc.constant('2026-01-01T00:05:00Z'),
                        conclusion: fc.constant('success'),
                    }),
                ),
                (runs) => {
                    const result = calcPipelineCost(runs);

                    expect(result.totalMinutes).toBeGreaterThanOrEqual(0);
                    expect(result.estimatedCost).toBeGreaterThanOrEqual(0);
                },
            ),
            { numRuns: 100 },
        );
    });

    it('cost is proportional to duration', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(fc.integer({ min: 1, max: 1000 }), (durationMin) => {
                const startMs = 1767225600000; // 2026-01-01T00:00:00Z in UTC
                const durationMs = durationMin * 60 * 1000;
                const runs = [makeRun(startMs, durationMs)];

                const result = calcPipelineCost(runs);

                expect(result.totalMinutes).toBe(durationMin);
            }),
            { numRuns: 100 },
        );
    });

    it('empty runs always return zero', () => {
        const result = calcPipelineCost([]);

        expect(result.totalMinutes).toBe(0);
        expect(result.estimatedCost).toBe(0);
    });
});
