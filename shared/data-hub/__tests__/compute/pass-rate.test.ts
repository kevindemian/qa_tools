import { describe, it, expect } from 'vitest';
import type { PipelineRun } from '../../../types/ci-cd.js';
import type { MetricsRun } from '../../../metrics.js';
import {
    calcPipelinePassRate,
    calcPipelineFailRate,
    calcTestPassRate,
    calcExpWeightedPassRate,
    calcExecutionRate,
    calcExpWeightedExecutionRate,
} from '../../compute/pass-rate.js';

function makeRun(overrides?: Partial<PipelineRun>): PipelineRun {
    const run: PipelineRun = {
        id: 1,
        conclusion: 'success',
        head_branch: 'main',
        created_at: '2026-07-01T10:00:00Z',
        updated_at: '2026-07-01T10:05:00Z',
        run_started_at: '2026-07-01T10:00:00Z',
    };
    if (overrides) {
        return { ...run, ...overrides };
    }
    return run;
}

function makeMetricsRun(overrides?: Partial<MetricsRun>): MetricsRun {
    return {
        timestamp: '2026-07-01T10:00:00Z',
        project: 'test',
        total: 100,
        passed: 80,
        failed: 10,
        skipped: 10,
        duration: 60,
        tests: [],
        ...overrides,
    };
}

describe('Compute/pass-rate', () => {
    describe('CalcPipelinePassRate', () => {
        it('returns 0 for empty runs', () => {
            expect.hasAssertions();
            expect(calcPipelinePassRate([])).toBe(0);
        });

        it('returns 100 when all runs pass', () => {
            expect.hasAssertions();

            const runs = [
                makeRun({ conclusion: 'success' }),
                makeRun({ id: 2, conclusion: 'success' }),
                makeRun({ id: 3, conclusion: 'success' }),
            ];

            expect(calcPipelinePassRate(runs)).toBe(100);
        });

        it('returns 0 when all runs fail', () => {
            expect.hasAssertions();

            const runs = [makeRun({ conclusion: 'failure' }), makeRun({ id: 2, conclusion: 'failure' })];

            expect(calcPipelinePassRate(runs)).toBe(0);
        });

        it('calculates correct percentage for mixed results', () => {
            expect.hasAssertions();

            const runs = [
                makeRun({ conclusion: 'success' }),
                makeRun({ id: 2, conclusion: 'success' }),
                makeRun({ id: 3, conclusion: 'failure' }),
            ];

            expect(calcPipelinePassRate(runs)).toBeGreaterThanOrEqual(66.66);
            expect(calcPipelinePassRate(runs)).toBeLessThanOrEqual(66.68);
        });

        it('ignores runs without conclusion', () => {
            expect.hasAssertions();

            const runWithoutConclusion: PipelineRun = { id: 2, head_branch: 'main' };
            const runs = [makeRun({ conclusion: 'success' }), runWithoutConclusion, makeRun({ conclusion: 'failure' })];

            expect(calcPipelinePassRate(runs)).toBe(50);
        });

        it('handles single run', () => {
            expect.hasAssertions();
            expect(calcPipelinePassRate([makeRun({ conclusion: 'success' })])).toBe(100);
            expect(calcPipelinePassRate([makeRun({ conclusion: 'failure' })])).toBe(0);
        });
    });

    describe('CalcPipelineFailRate', () => {
        it('returns complement of pass rate', () => {
            expect.hasAssertions();

            const runs = [makeRun({ conclusion: 'success' }), makeRun({ id: 2, conclusion: 'failure' })];

            expect(calcPipelineFailRate(runs)).toBe(50);
        });

        it('returns 0 when all pass', () => {
            expect.hasAssertions();

            const runs = [makeRun({ conclusion: 'success' })];

            expect(calcPipelineFailRate(runs)).toBe(0);
        });
    });

    describe('CalcTestPassRate', () => {
        it('returns 0 for no executed tests', () => {
            expect.hasAssertions();
            expect(calcTestPassRate(makeMetricsRun({ passed: 0, failed: 0 }))).toBe(0);
        });

        it('returns 100 when all pass', () => {
            expect.hasAssertions();
            expect(calcTestPassRate(makeMetricsRun({ passed: 50, failed: 0 }))).toBe(100);
        });

        it('returns 0 when all fail', () => {
            expect.hasAssertions();
            expect(calcTestPassRate(makeMetricsRun({ passed: 0, failed: 50 }))).toBe(0);
        });

        it('calculates correct percentage', () => {
            expect.hasAssertions();
            expect(calcTestPassRate(makeMetricsRun({ passed: 3, failed: 1 }))).toBe(75);
        });
    });

    describe('CalcExpWeightedPassRate', () => {
        it('returns 0 for empty runs', () => {
            expect.hasAssertions();
            expect(calcExpWeightedPassRate([], 10)).toBe(0);
        });

        it('weights recent runs higher', () => {
            expect.hasAssertions();

            const runs = [
                makeMetricsRun({ passed: 0, failed: 100 }),
                makeMetricsRun({ passed: 0, failed: 100 }),
                makeMetricsRun({ passed: 0, failed: 100 }),
                makeMetricsRun({ passed: 100, failed: 0 }),
            ];
            const rate = calcExpWeightedPassRate(runs, 4);

            expect(rate).toBeGreaterThan(0);
            expect(rate).toBeLessThan(100);
        });
    });

    describe('CalcExecutionRate', () => {
        it('returns 0 when total is 0', () => {
            expect.hasAssertions();
            expect(calcExecutionRate(makeMetricsRun({ total: 0 }))).toBe(0);
        });

        it('returns correct percentage', () => {
            expect.hasAssertions();
            expect(calcExecutionRate(makeMetricsRun({ total: 100, passed: 80, failed: 10 }))).toBe(90);
        });
    });

    describe('CalcExpWeightedExecutionRate', () => {
        it('returns 0 for empty runs', () => {
            expect.hasAssertions();
            expect(calcExpWeightedExecutionRate([], 10)).toBe(0);
        });

        it('returns value for non-empty runs', () => {
            expect.hasAssertions();

            const runs = [makeMetricsRun({ total: 100, passed: 80, failed: 10 })];

            expect(calcExpWeightedExecutionRate(runs, 1)).toBeGreaterThan(0);
        });
    });
});
