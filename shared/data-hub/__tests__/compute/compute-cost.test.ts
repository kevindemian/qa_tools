/**
 * Unit tests for calcComputeCost (LA-2).
 *
 * Aggregates real CI compute cost from run timing + GitHub billable usage.
 */
import { describe, it, expect } from 'vitest';
import { calcComputeCost } from '../../compute/compute-cost.js';
import type { PipelineRun } from '../../../types/ci-cd.js';
import type { WorkflowRunTiming } from '../../../types/data-hub.js';

function timing(runId: number, t: WorkflowRunTiming): [number, WorkflowRunTiming] {
    return [runId, t];
}

describe('CalcComputeCost', () => {
    it('aggregates run_duration_ms and billable per OS', () => {
        expect.hasAssertions();

        const runs: PipelineRun[] = [{ id: 1 }, { id: 2 }];
        const timingMap = new Map<number, WorkflowRunTiming>([
            timing(1, {
                run_duration_ms: 1000,
                billable: { UBUNTU: { total_ms: 60000, jobs: 2 }, MACOS: { total_ms: 30000, jobs: 1 } },
            }),
            timing(2, { run_duration_ms: 2000, billable: { UBUNTU: { total_ms: 60000, jobs: 1 } } }),
        ]);
        const result = calcComputeCost(runs, timingMap);

        expect(result.runCount).toBe(2);
        expect(result.totalDurationMs).toBe(3000);
        expect(result.totalBillableMs).toBe(150000);
        expect(result.billableMinutes).toBeCloseTo(2.5);
    });

    it('handles missing billable (duration-only runs)', () => {
        expect.hasAssertions();

        const runs: PipelineRun[] = [{ id: 1 }];
        const timingMap = new Map<number, WorkflowRunTiming>([timing(1, { run_duration_ms: 5000 })]);
        const result = calcComputeCost(runs, timingMap);

        expect(result.totalDurationMs).toBe(5000);
        expect(result.totalBillableMs).toBe(0);
        expect(result.billableMinutes).toBe(0);
    });

    it('safeguard: rejects negative / non-finite durations and billable', () => {
        expect.hasAssertions();

        const runs: PipelineRun[] = [{ id: 1 }, { id: 2 }, { id: 3 }];
        const timingMap = new Map<number, WorkflowRunTiming>([
            timing(1, { run_duration_ms: -100 }), // negative → skipped
            timing(2, { run_duration_ms: Number.NaN }), // non-finite → skipped
            timing(3, { run_duration_ms: 1000, billable: { UBUNTU: { total_ms: -5, jobs: 1 } } }), // negative billable → skipped
        ]);
        const result = calcComputeCost(runs, timingMap);

        expect(result.runCount).toBe(1);
        expect(result.totalDurationMs).toBe(1000);
        expect(result.totalBillableMs).toBe(0);
    });

    it('safeguard: non-array runs → empty result (no passthrough)', () => {
        expect.hasAssertions();

        // @ts-expect-error intentional invalid input
        const result = calcComputeCost(undefined, new Map());

        expect(result.runCount).toBe(0);
        expect(result.totalDurationMs).toBe(0);
    });

    it('safeguard: runs without matching timing are skipped', () => {
        expect.hasAssertions();

        const runs: PipelineRun[] = [{ id: 99 }];
        const result = calcComputeCost(runs, new Map());

        expect(result.runCount).toBe(0);
        expect(result.totalDurationMs).toBe(0);
    });
});
