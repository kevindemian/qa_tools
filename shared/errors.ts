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
