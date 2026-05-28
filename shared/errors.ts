export class LlmError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'LlmError';
    }
}

export class LlmRateLimitError extends LlmError {
    constructor(message: string) {
        super(message);
        this.name = 'LlmRateLimitError';
    }
}

export class LlmProviderError extends LlmError {
    constructor(message: string) {
        super(message);
        this.name = 'LlmProviderError';
    }
}

export class LlmTimeoutError extends LlmError {
    constructor(message: string) {
        super(message);
        this.name = 'LlmTimeoutError';
    }
}

export class LlmAuthError extends LlmError {
    constructor(message: string) {
        super(message);
        this.name = 'LlmAuthError';
    }
}
