import { describe, it, expect } from 'vitest';
import type { PipelineRun } from '../../../types/ci-cd.js';
import { calcPipelinePassRate } from '../../compute/pass-rate.js';

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

        it('filters by branch when branch param provided (Gap 3)', () => {
            expect.hasAssertions();

            const runs = [
                makeRun({ head_branch: 'main', conclusion: 'success' }),
                makeRun({ id: 2, head_branch: 'main', conclusion: 'success' }),
                makeRun({ id: 3, head_branch: 'feature/x', conclusion: 'failure' }),
            ];

            expect(calcPipelinePassRate(runs, 'main')).toBe(100);

            expect(calcPipelinePassRate(runs, 'feature/x')).toBe(0);

            expect(calcPipelinePassRate(runs)).toBeCloseTo(66.67, 2);
        });
    });
});
