import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeOperation } from '../ui/operation-executor.js';
import type { StepFailureHandler } from '../types/clean-slate.js';

describe('executeOperation', () => {
    let run: ReturnType<typeof vi.fn<() => Promise<void>>>;
    const baseCtx = { label: 'op', step: 'rebuild-steps', totalSteps: 8, completedSteps: [] };

    beforeEach(() => {
        run = vi.fn<() => Promise<void>>();
    });

    it('returns ok:true with attempts:1 on success', async () => {
        run.mockResolvedValue(undefined);
        const outcome = await executeOperation({ run, ctx: baseCtx });
        expect(outcome).toMatchObject({ ok: true, attempts: 1 });
        expect(run).toHaveBeenCalledTimes(1);
    });

    it('auto-retries transient errors up to maxTransientRetries then calls handler', async () => {
        const transient = new Error('ECONNRESET');
        run.mockRejectedValue(transient);
        const onFailure = vi.fn<StepFailureHandler>().mockResolvedValue('abort');
        const outcome = await executeOperation({
            run,
            ctx: baseCtx,
            onFailure,
            maxTransientRetries: 3,
            isTransient: () => true,
        });
        expect(outcome).toMatchObject({ ok: false, decision: 'abort', attempts: 3 });
        expect(run).toHaveBeenCalledTimes(3);
        expect(onFailure).toHaveBeenCalledTimes(1);
    });

    it('calls handler immediately for non-transient errors', async () => {
        const error = new Error('permission denied');
        run.mockRejectedValue(error);
        const onFailure = vi.fn<StepFailureHandler>().mockResolvedValue('skip');
        const outcome = await executeOperation({ run, ctx: baseCtx, onFailure });
        expect(outcome).toMatchObject({ ok: false, decision: 'skip', attempts: 1 });
        expect(onFailure).toHaveBeenCalledWith(error, expect.objectContaining({ step: 'rebuild-steps' }));
    });

    it('re-executes run when handler returns retry', async () => {
        run.mockRejectedValueOnce(new Error('fail 1'))
            .mockRejectedValueOnce(new Error('fail 2'))
            .mockResolvedValueOnce(undefined);
        const onFailure = vi.fn<StepFailureHandler>().mockResolvedValueOnce('retry').mockResolvedValueOnce('retry');
        const outcome = await executeOperation({ run, ctx: baseCtx, onFailure });
        expect(outcome).toMatchObject({ ok: true, attempts: 3 });
        expect(run).toHaveBeenCalledTimes(3);
    });

    it('calls onSkip when handler returns skip', async () => {
        run.mockRejectedValue(new Error('fail'));
        const onSkip = vi.fn();
        const onFailure = vi.fn<StepFailureHandler>().mockResolvedValue('skip');
        const outcome = await executeOperation({ run, ctx: baseCtx, onFailure, onSkip });
        expect(outcome).toMatchObject({ ok: false, decision: 'skip', attempts: 1 });
        expect(onSkip).toHaveBeenCalledTimes(1);
    });

    it('calls onRollback when handler returns rollback', async () => {
        run.mockRejectedValue(new Error('fail'));
        const onRollback = vi.fn().mockResolvedValue(undefined);
        const onFailure = vi.fn<StepFailureHandler>().mockResolvedValue('rollback');
        const outcome = await executeOperation({ run, ctx: baseCtx, onFailure, onRollback });
        expect(outcome).toMatchObject({ ok: false, decision: 'rollback', attempts: 1 });
        expect(onRollback).toHaveBeenCalledTimes(1);
    });

    it('defaults to rollback when no handler is provided', async () => {
        run.mockRejectedValue(new Error('fail'));
        const onRollback = vi.fn().mockResolvedValue(undefined);
        const outcome = await executeOperation({ run, ctx: baseCtx, onRollback });
        expect(outcome).toMatchObject({ ok: false, decision: 'rollback', attempts: 1 });
        expect(onRollback).toHaveBeenCalledTimes(1);
    });

    it('defaults isTransient to isTransientError helper', async () => {
        const transient = Object.assign(new Error('boom'), { code: 'ECONNRESET' });
        run.mockRejectedValueOnce(transient).mockResolvedValueOnce(undefined);
        const outcome = await executeOperation({ run, ctx: baseCtx, maxTransientRetries: 2 });
        expect(outcome).toMatchObject({ ok: true, attempts: 2 });
    });
});
