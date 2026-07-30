/** Step reporter — wraps each clean-slate step with spinner + structured tracing.
 *
 *  In TTY mode: spinner → ✓ done / ⚠ failed (1 line per step).
 *  In CI mode: no spinner, structured log to file only.
 *  Always records duration and returns StepResult. */
import type { StepResult } from '../types/clean-slate.js';
import { Output } from './output.js';
import { isQuiet } from './prompt-ui.js';
import { success, warn } from './prompt-format.js';
import { rootLogger } from '../logger.js';

// ─────────────────────────────────────────────────────────────────
// ORA DYNAMIC IMPORT
// ─────────────────────────────────────────────────────────────────

interface OraInstance {
    start: () => OraInstance;
    succeed: (text?: string) => void;
    fail: (text?: string) => void;
}

let _ora: ((opts: Record<string, unknown>) => OraInstance) | null = null;

/** Override ora dependency (used by tests). */
export function __setOraDep(mod: unknown): void {
    _ora = mod as (opts: Record<string, unknown>) => OraInstance;
}

// ─────────────────────────────────────────────────────────────────
// RUN STEP
// ─────────────────────────────────────────────────────────────────

export interface RunStepOptions {
    /** Suppress spinner (for nested steps or CI). Default: false. */
    quiet?: boolean;
    /** Force TTY behavior (for testing). */
    tty?: boolean;
}

/**
 * Run an async function with a terminal spinner and return a StepResult.
 *
 * TTY mode: shows spinner while running, then ✓ or ⚠ on completion.
 * CI/quiet mode: runs directly, logs result to file.
 */
export async function runStep<T>(
    name: string,
    fn: () => Promise<T>,
    opts?: RunStepOptions,
): Promise<StepResult & { data?: T }> {
    const useTTY = opts?.tty ?? (Output.isTTY() && !isQuiet());
    const useSpinner = useTTY && !opts?.quiet && !Output.isCI();

    const start = Date.now();
    let spinner: OraInstance | null = null;

    if (useSpinner) {
        if (!_ora) _ora = (await import('ora')).default;
        spinner = _ora({ text: name, color: 'cyan', spinner: 'dots' }).start();
    }

    try {
        const data = await fn();
        const duration = Date.now() - start;
        const detail = typeof data === 'string' ? data : `${name} ok`;

        if (spinner) {
            spinner.succeed(`${name} — ${detail} (${duration}ms)`);
        } else if (useTTY) {
            success(`${name} — ${detail} (${duration}ms)`);
        }

        rootLogger.info(`step: ${name}`, { ok: true, detail, duration });

        return { ok: true, step: name, detail, duration, data };
    } catch (err) {
        const duration = Date.now() - start;
        const errorMsg = err instanceof Error ? err.message : String(err);

        if (spinner) {
            spinner.fail(`${name} — ${errorMsg} (${duration}ms)`);
        } else if (useTTY) {
            warn(`${name} — ${errorMsg} (${duration}ms)`);
        }

        rootLogger.info(`step: ${name}`, { ok: false, error: errorMsg, duration });

        return {
            ok: false,
            step: name,
            detail: errorMsg,
            error: errorMsg,
            duration,
        };
    }
}

// ─────────────────────────────────────────────────────────────────
// RUN STEP WITH RETRY
// ─────────────────────────────────────────────────────────────────

export interface RetryOptions {
    /** Maximum number of attempts. Default: 3. */
    maxAttempts?: number;
    /** Base delay in ms for exponential backoff. Default: 1000. */
    baseDelayMs?: number;
}

/**
 * Run a step with automatic retry (exponential backoff).
 * Returns StepResult with the outcome of the final attempt.
 */
export async function runStepWithRetry<T>(
    name: string,
    fn: () => Promise<T>,
    opts?: RetryOptions & RunStepOptions,
): Promise<StepResult & { data?: T }> {
    const maxAttempts = opts?.maxAttempts ?? 3;
    const baseDelayMs = opts?.baseDelayMs ?? 1000;

    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const result = await runStep(name, fn, { ...opts, quiet: true });
        if (result.ok) {
            // Log success with attempt info if > 1
            if (attempt > 1) {
                rootLogger.info(`step: ${name} succeeded after ${attempt} attempts`);
            }
            return result;
        }
        lastError = new Error(result.error);

        if (attempt < maxAttempts) {
            const delay = baseDelayMs * Math.pow(2, attempt - 1);
            rootLogger.warn(`step: ${name} failed (attempt ${attempt}/${maxAttempts}), retrying in ${delay}ms`);
            await new Promise((r) => setTimeout(r, delay));
        }
    }

    // All attempts exhausted — return final failure with context
    const duration = 0; // total duration tracked by individual runStep calls
    const errorMsg = lastError?.message ?? 'Unknown error';
    rootLogger.warn(`step: ${name} failed after ${maxAttempts} attempts`);

    return {
        ok: false,
        step: name,
        detail: `${errorMsg} (${maxAttempts}/${maxAttempts} retries exhausted)`,
        error: errorMsg,
        duration,
        context: { issueKey: '', input: null, attempts: maxAttempts },
    };
}
