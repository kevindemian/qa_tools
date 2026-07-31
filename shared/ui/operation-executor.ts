/** Operation executor — unified failure handling for Jira write operations.
 *
 *  Universal primitive (Rule 3/7): every write operation (create issue, steps,
 *  preconditions, links, clean-slate steps, bug report) routes failures through
 *  this single mechanism:
 *
 *  1. run() the operation
 *  2. transient error? auto-retry with exponential backoff (default 3x)
 *  3. persistent failure? ask onFailure (StepFailureHandler): retry | skip | abort | rollback
 *
 *  No silent failure is possible: every outcome is explicit (Rule 25). */
import type { StepFailureHandler, StepInfo, StepResult } from '../types/clean-slate.js';
import { isTransientError } from '../infra/transient-error.js';
import { rootLogger } from '../logger.js';

/** Retry budget for transient errors (network, 429, 5xx) before user decision.
 *  Mirrors SNAPSHOT_MAX_RETRIES and AUTH_MAX_RETRIES used elsewhere (§1 consistency). */
export const DEFAULT_MAX_TRANSIENT_RETRIES = 3;
/** Base delay for exponential backoff between transient retries (ms). */
export const TRANSIENT_BASE_DELAY_MS = 1000;
/** Retry budget for manual 'retry' decisions from the failure handler. */
export const MAX_MANUAL_RETRIES = 3;

export interface OperationContext {
    /** Human-readable operation label, e.g. `Step 2 de "Test"`. */
    label: string;
    /** Structured step identifier, e.g. `rebuild-steps`. */
    step: string;
    /** Total steps in the enclosing phase. */
    totalSteps: number;
    /** Steps already completed (with results). */
    completedSteps: StepResult[];
    /** Input that was being processed when the failure occurred. */
    currentInput?: unknown;
}

export interface OperationOutcome<T = void> {
    ok: boolean;
    /** User decision, only set when onFailure was called. */
    decision?: 'skip' | 'abort' | 'retry' | 'rollback';
    /** Total attempts (transient retries + manual retries + final). */
    attempts: number;
    /** Number of manual 'retry' decisions honored before success (0 on failure). */
    manualRetries?: number;
    error?: Error;
    /** Result of the last successful run() execution (or undefined on failure). */
    result?: T;
}

export interface ExecuteOperationOptions<T = void> {
    /** The operation to execute. May return a value captured as outcome.result. */
    run: () => Promise<T>;
    /** Operation context for error reporting. */
    ctx: OperationContext;
    /** Decision handler for persistent failures. If absent, defaults to rollback. */
    onFailure?: StepFailureHandler;
    /** Transient auto-retry budget (default 3). */
    maxTransientRetries?: number;
    /** Transient predicate (default: isTransientError). */
    isTransient?: (err: unknown) => boolean;
    /** Executed when the final decision is rollback. */
    onRollback?: () => Promise<void>;
    /** Executed when the final decision is skip (e.g. count a skipped step). */
    onSkip?: () => void;
}

function buildStepInfo(ctx: OperationContext, completedSteps: StepResult[], currentInput: unknown): StepInfo {
    return {
        step: ctx.step,
        totalSteps: ctx.totalSteps,
        completedSteps,
        currentInput,
    };
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function executeOperation<T>(opts: ExecuteOperationOptions<T>): Promise<OperationOutcome<T>> {
    const {
        run,
        ctx,
        onFailure,
        onRollback,
        onSkip,
        maxTransientRetries = DEFAULT_MAX_TRANSIENT_RETRIES,
        isTransient = isTransientError,
    } = opts;

    let attempts = 0;
    let lastError: Error | undefined;
    let result: T | undefined;
    let manualRetries = 0;

    // Phase 1: run + transient auto-retry with backoff.
    // attempts == number of run() executions. maxTransientRetries is the TOTAL
    // budget of run() executions in this phase (1 initial + retries).
    for (let attempt = 1; attempt <= maxTransientRetries; attempt++) {
        try {
            result = await run();
            attempts++;
            return { ok: true, attempts, manualRetries, result };
        } catch (err) {
            attempts++;
            lastError = err instanceof Error ? err : new Error(String(err));
            if (!isTransient(err)) break;
            if (attempt < maxTransientRetries) {
                const delay = TRANSIENT_BASE_DELAY_MS * Math.pow(2, attempt - 1);
                rootLogger.warn(
                    `[${ctx.label}] Transient error (attempt ${attempt}/${maxTransientRetries}): ` +
                        lastError.message +
                        ` — retrying in ${delay}ms`,
                );
                await sleep(delay);
            }
        }
    }

    if (!lastError) return { ok: true, attempts, manualRetries };

    // Phase 2: persistent failure — ask user via handler, or default to rollback
    if (!onFailure) {
        if (onRollback) await onRollback();
        rootLogger.warn(`[${ctx.label}] Falha sem handler — rollback: ${lastError.message}`);
        return { ok: false, decision: 'rollback', attempts, error: lastError };
    }

    const stepInfo = buildStepInfo(ctx, ctx.completedSteps, ctx.currentInput);
    for (let manual = 0; manual < MAX_MANUAL_RETRIES; manual++) {
        const decision = await onFailure(lastError, stepInfo);
        if (decision === 'abort') {
            return { ok: false, decision: 'abort', attempts, error: lastError };
        }
        if (decision === 'skip') {
            if (onSkip) onSkip();
            return { ok: false, decision: 'skip', attempts, error: lastError };
        }
        if (decision === 'rollback') {
            if (onRollback) await onRollback();
            return { ok: false, decision: 'rollback', attempts, error: lastError };
        }
        if (decision === 'retry') {
            manualRetries++;
            try {
                result = await run();
                attempts++;
                return { ok: true, attempts, manualRetries, result };
            } catch (err) {
                attempts++;
                lastError = err instanceof Error ? err : new Error(String(err));
            }
        }
    }

    // Manual retry budget exhausted — default to rollback
    rootLogger.warn(
        `[${ctx.label}] Retries manuais esgotados (${MAX_MANUAL_RETRIES}) — rollback: ` + lastError.message,
    );
    if (onRollback) await onRollback();
    return { ok: false, decision: 'rollback', attempts, error: lastError };
}
