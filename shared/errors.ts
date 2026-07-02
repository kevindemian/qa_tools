/** Base error for all LLM-related failures. Extended by specific error types
 * so callers can catch with `instanceof` and handle accordingly. */

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

/** Safely extract message from caught value. In Node.js anything can be thrown
 *  (string, number, object) — casting to Error and reading .message returns
 *  undefined for non-Error values, producing "Failed: undefined" in logs. */
export function formatErr(err: unknown): string {
    if (typeof err === 'object' && err !== null && 'message' in err) {
        return String((err as { message: string }).message);
    }
    return String(err);
}
