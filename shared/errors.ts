/**
 * @file Shared error classes and utilities.
 *
 * RULE: Every error MUST produce a human-readable message.
 * No silent failures. No empty strings. No `undefined` as error.
 */

// ─── LLM Error Classes ─────────────────────────────────────────────────────

/** Base error for all LLM-related failures. Extended by specific error types
 * so callers can catch with type guards and handle accordingly. */

export class LlmError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'LlmError';
    }
}

/** Thrown when the LLM provider returns a rate-limit response (HTTP 429). */
export class LlmRateLimitError extends LlmError {
    constructor(message: string) {
        super(message);
        this.name = 'LlmRateLimitError';
    }
}

/** Thrown when the LLM provider returns a server-side error (HTTP 5xx). */
export class LlmProviderError extends LlmError {
    constructor(message: string) {
        super(message);
        this.name = 'LlmProviderError';
    }
}

/** Thrown when the LLM request exceeds the configured timeout. */
export class LlmTimeoutError extends LlmError {
    constructor(message: string) {
        super(message);
        this.name = 'LlmTimeoutError';
    }
}

/** Thrown when the LLM provider rejects authentication (HTTP 401/403). */
export class LlmAuthError extends LlmError {
    constructor(message: string) {
        super(message);
        this.name = 'LlmAuthError';
    }
}

// ─── Type Guard ─────────────────────────────────────────────────────────────

/**
 * Type guard for CancelError — property-based check.
 * CancelError is thrown when the user cancels an interactive prompt.
 */
export function isCancelError(e: unknown): e is { name: string } {
    return e != null && (e as Record<string, unknown>)['name'] === 'CancelError';
}

// ─── Message Extraction ─────────────────────────────────────────────────────

/**
 * Safely extract message from caught value. In Node.js anything can be thrown
 * (string, number, object) — casting to Error and reading .message returns
 * undefined for non-Error values, producing "Failed: undefined" in logs.
 *
 * Guarantees a non-empty string. No silent failures.
 */
export function formatErr(err: unknown): string {
    if (typeof err === 'object' && err !== null && 'message' in err) {
        return String((err as { message: string }).message);
    }
    return String(err);
}

/**
 * Extract a human-readable error message from any caught value.
 * Alias for formatErr — prefer getErrorMessage for new code.
 */
export function getErrorMessage(e: unknown): string {
    return formatErr(e);
}

/**
 * Humanize an error into a descriptive, actionable message.
 * Use this when throwing or logging — never leave errors ambiguous.
 *
 * @example
 * throw new Error(humanizeError(err, 'Failed to load metrics store'));
 * // → "Failed to load metrics store: ENOENT: no such file or directory"
 */
export function humanizeError(e: unknown, context: string): string {
    const msg = formatErr(e);
    return `${context}: ${msg}`;
}
