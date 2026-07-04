/**
 * Unit tests for Pipeline Cost compute function.
 *
 * Tests the pure calculation of CI pipeline costs.
 */
import { describe, it, expect } from 'vitest';
import { calcPipelineCost } from '../../compute/pipeline-cost.js';
import type { PipelineRun } from '../../../types/ci-cd.js';

/* ── Helpers ────────────────────────────────────────────────────────────── */

function makeRun(overrides?: Partial<PipelineRun>): PipelineRun {
    return {
        id: 1,
        run_started_at: '2026-01-01T10:00:00Z',
        updated_at: '2026-01-01T10:10:00Z',
        conclusion: 'success',
        ...overrides,
    };
}

/* ── Tests ──────────────────────────────────────────────────────────────── */

describe('Compute/pipeline-cost', () => {
    it('returns zero cost for empty runs', () => {
        const result = calcPipelineCost([]);

        expect(result.totalMinutes).toBe(0);
        expect(result.estimatedCost).toBe(0);
    });

    it('calculates cost for single run', () => {
        const runs = [makeRun()]; // 10 minutes duration

        const result = calcPipelineCost(runs);

        expect(result.totalMinutes).toBe(10);
        expect(result.estimatedCost).toBeCloseTo(0.1, 2); // 10 * 0.01
    });

    it('sums cost across multiple runs', () => {
        const runs = [
            makeRun({ run_started_at: '2026-01-01T10:00:00Z', updated_at: '2026-01-01T10:10:00Z' }), // 10 min
            makeRun({ run_started_at: '2026-01-01T11:00:00Z', updated_at: '2026-01-01T11:20:00Z' }), // 20 min
            makeRun({ run_started_at: '2026-01-01T12:00:00Z', updated_at: '2026-01-01T12:05:00Z' }), // 5 min
        ];

        const result = calcPipelineCost(runs);

        expect(result.totalMinutes).toBe(35);
        expect(result.estimatedCost).toBeCloseTo(0.35, 2);
    });

    it('uses custom cost per minute', () => {
        const runs = [makeRun()]; // 10 minutes

        const result = calcPipelineCost(runs, 0.05);

        expect(result.totalMinutes).toBe(10);
        expect(result.estimatedCost).toBeCloseTo(0.5, 2); // 10 * 0.05
    });

    it('handles runs without timing data', () => {
        const runWithoutTiming: PipelineRun = { id: 1 };
        const runs = [
            runWithoutTiming,
            makeRun({ run_started_at: '2026-01-01T10:00:00Z', updated_at: '2026-01-01T10:05:00Z' }),
        ];

        const result = calcPipelineCost(runs);

        expect(result.totalMinutes).toBe(5);
        expect(result.estimatedCost).toBeCloseTo(0.05, 2);
    });
});
