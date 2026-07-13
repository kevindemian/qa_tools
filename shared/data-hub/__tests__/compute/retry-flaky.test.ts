/**
 * Unit tests for calcRetryFlaky (LA-2).
 *
 * Retry/flaky rollup from run-attempt signals. A run is retry-flaky when it
 * needed >1 attempt to pass (GitHub run_attempt>1, or GitLab retried===true)
 * and eventually succeeded.
 */
import { describe, it, expect } from 'vitest';
import { calcRetryFlaky } from '../../compute/retry-flaky.js';
import type { PipelineRun } from '../../../types/ci-cd.js';

function run(overrides: Partial<PipelineRun>): PipelineRun {
    return { id: 1, conclusion: 'success', ...overrides };
}

describe('CalcRetryFlaky', () => {
    it('gitHub: counts a run that passed on attempt 2 as flaky-retry', () => {
        expect.hasAssertions();

        const runs = [
            run({ id: 1, run_number: 10, run_attempt: 1, conclusion: 'failure' }),
            run({ id: 2, run_number: 10, run_attempt: 2, conclusion: 'success' }),
        ];
        const result = calcRetryFlaky(runs);

        expect(result.retriedRuns).toBe(1);
        expect(result.flakyRetryRuns).toBe(1);
        expect(result.maxAttempts).toBe(2);
        expect(result.totalRuns).toBe(2);
        expect(result.rate).toBeCloseTo(50);
    });

    it('gitHub: attempt 1 failure with no retry is NOT flaky', () => {
        expect.hasAssertions();

        const runs = [run({ run_attempt: 1, conclusion: 'failure' })];
        const result = calcRetryFlaky(runs);

        expect(result.retriedRuns).toBe(0);
        expect(result.flakyRetryRuns).toBe(0);
        expect(result.maxAttempts).toBe(1);
    });

    it('gitHub: a retry that still failed is retried but NOT flaky-retry', () => {
        expect.hasAssertions();

        const runs = [run({ run_attempt: 3, conclusion: 'failure' })];
        const result = calcRetryFlaky(runs);

        expect(result.retriedRuns).toBe(1);
        expect(result.flakyRetryRuns).toBe(0);
        expect(result.maxAttempts).toBe(3);
    });

    it('gitLab: retried===true and passed counts as flaky-retry', () => {
        expect.hasAssertions();

        const runs = [run({ retried: true, conclusion: 'success' })];
        const result = calcRetryFlaky(runs);

        expect(result.retriedRuns).toBe(1);
        expect(result.flakyRetryRuns).toBe(1);
        expect(result.maxAttempts).toBe(1);
    });

    it('gitLab: retried with no boolean does not count', () => {
        expect.hasAssertions();

        const runs = [run({ conclusion: 'success' })];
        const result = calcRetryFlaky(runs);

        expect(result.retriedRuns).toBe(0);
    });

    it('safeguard: empty runs → NaN rate (never a passing 0)', () => {
        expect.hasAssertions();

        const result = calcRetryFlaky([]);

        expect(result.totalRuns).toBe(0);
        expect(Number.isNaN(result.rate)).toBeTruthy();
    });

    it('safeguard: non-array input → NaN rate', () => {
        expect.hasAssertions();

        // @ts-expect-error intentional invalid input
        const result = calcRetryFlaky(undefined);

        expect(Number.isNaN(result.rate)).toBeTruthy();
    });

    it('safeguard: null runs are skipped without throwing', () => {
        expect.hasAssertions();

        const runs = [run({ run_attempt: 2, conclusion: 'success' }), null] as unknown as PipelineRun[];
        const result = calcRetryFlaky(runs);

        expect(result.flakyRetryRuns).toBe(1);
        expect(result.totalRuns).toBe(2);
    });

    it('safeguard: non-finite run_attempt ignored (treated as single attempt)', () => {
        expect.hasAssertions();

        const runs = [run({ run_attempt: Number.NaN, conclusion: 'success' })];
        const result = calcRetryFlaky(runs);

        expect(result.retriedRuns).toBe(0);
        expect(result.maxAttempts).toBe(1);
    });
});
