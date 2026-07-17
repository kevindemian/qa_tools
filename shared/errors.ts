/**
 * @file Shared error classes and utilities.
 *
 * RULE: Every error MUST produce a human-readable message.
 * No silent failures. No empty strings. No `undefined` as error.
 *
 * ERROR HANDLING PATTERNS (error-handling-enforcement.md):
 *
 * 1. Safeguard Clauses (input validation):
 *    throw new DataIntegrityError('functionName: description of invalid state');
 *
 * 2. I/O failure propagation:
 *    throw new DataFetchError(`operation failed: ${msg}`, { cause: err });
 *
 * 3. Catch block must re-throw:
 *    catch (err) {
 *        const msg = formatErr(err);
 *        rootLogger.error(`module: failed — ${humanizeError(msg, 'context')}`);
 *        throw err; // or throw new DataFetchError(msg, { cause: err })
 *    }
 *
 * PROIBIDO:
 *    return 0 / return null / return [] / return {} / return undefined em catch blocks
 *    bare catch sem bind de erro (violacao EH-7)
 *    ?? 0 em funções de métricas
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

// ─── Data Integrity Errors ──────────────────────────────────────────────────

/** Thrown when data fails integrity validation.
 * Use for: NaN inputs, empty arrays where non-empty expected, out-of-bounds values,
 * corrupted data, missing required fields. */
export class DataIntegrityError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'DataIntegrityError';
    }
}

/** Thrown when an I/O operation fails (API call, file read, parsing).
 * Use for: network errors, filesystem errors, JSON parse errors, HTTP errors. */
export class DataFetchError extends Error {
    constructor(message: string, options?: ErrorOptions) {
        super(message, options);
        this.name = 'DataFetchError';
    }
}

// ─── External (typed) error: exact, non-silent failure info ────────────
// Substitui o `handleError(... returnNull)` que colapsava 401/403/404/500
// num `null` indistinguível. Qualquer erro externo vira um `ExternalError` com
// kind/status/scope/resource/operation/remediation explícitos.

export type ExternalErrorKind = 'auth' | 'permission' | 'notFound' | 'rateLimit' | 'network' | 'server' | 'unknown';

export interface ExternalErrorContext {
    operation: string;
    status?: number | undefined;
    scope?: string | undefined;
    resource?: string | undefined;
    remediation?: string | undefined;
    response?: { status?: number; data?: unknown } | undefined;
}

export class ExternalError extends Error {
    readonly kind: ExternalErrorKind;
    readonly status?: number | undefined;
    readonly scope?: string | undefined;
    readonly resource?: string | undefined;
    readonly operation: string;
    readonly remediation?: string | undefined;
    readonly response?: { status?: number; data?: unknown } | undefined;
    constructor(kind: ExternalErrorKind, message: string, ctx: ExternalErrorContext) {
        super(message);
        this.name = 'ExternalError';
        this.kind = kind;
        this.status = ctx.status;
        this.scope = ctx.scope;
        this.resource = ctx.resource;
        this.operation = ctx.operation;
        this.remediation = ctx.remediation;
        this.response = ctx.response;
    }
}

const NETWORK_CODES = new Set([
    'ECONNRESET',
    'ECONNREFUSED',
    'ENOTFOUND',
    'ETIMEDOUT',
    'ECONNABORTED',
    'EPIPE',
    'ECONNRESET',
]);

interface AxiosLikeErr {
    response?: { status?: number; data?: unknown };
    message?: string;
    code?: string;
    config?: { url?: string };
}

/**
 * Classifica um erro de provedor git (GitHub/GitLab) em `ExternalError` com
 * informação exata. 401/403 recebem scope/remediation para que o usuário saiba
 * exatamente o que está faltando (ex.: "token sem contents:read").
 */
export function classifyGitError(err: unknown, ctx: ExternalErrorContext): ExternalError {
    const e = err as AxiosLikeErr;
    const status = e.response?.status;
    const url = e.config?.url;
    const ctxWithResponse: ExternalErrorContext = { ...ctx, response: e.response };
    const base = `operação "${ctx.operation}" falhou`;
    if (status === 401) {
        return new ExternalError('auth', `${base}: token inválido ou expirado (HTTP 401)`, {
            ...ctxWithResponse,
            status,
            resource: url,
            remediation: 'Token inválido ou expirado. Reconfigure via /setup ou edite o arquivo .env.',
        });
    }
    if (status === 403) {
        const scopeNote = ctx.scope ? ` para ${ctx.scope}` : '';
        return new ExternalError('permission', `${base}: token sem permissão${scopeNote} (HTTP 403)`, {
            ...ctxWithResponse,
            status,
            resource: url,
            remediation: ctx.scope
                ? `O token não possui o escopo "${ctx.scope}". Conceda o escopo necessário ou use um token com acesso ao recurso.`
                : 'O token não tem permissão para esta operação. Conceda o escopo necessário ou use um token com acesso.',
        });
    }
    if (status === 404) {
        return new ExternalError('notFound', `${base}: recurso não encontrado (HTTP 404)`, {
            ...ctxWithResponse,
            status,
            resource: url,
        });
    }
    if (status === 429) {
        return new ExternalError('rateLimit', `${base}: rate limit atingido (HTTP 429)`, {
            ...ctxWithResponse,
            status,
            resource: url,
            remediation: 'Muitas requisições. Aguarde e tente novamente.',
        });
    }
    if (status !== undefined && status >= 500) {
        return new ExternalError('server', `${base}: erro no servidor (HTTP ${status})`, {
            ...ctxWithResponse,
            status,
            resource: url,
        });
    }
    if (e.code && NETWORK_CODES.has(e.code)) {
        return new ExternalError('network', `${base}: erro de rede (${e.code})`, {
            ...ctxWithResponse,
            resource: url,
            remediation: 'Verifique a conexão de rede e tente novamente.',
        });
    }
    return new ExternalError('unknown', `${base}: ${e.message || 'erro desconhecido'}`, {
        ...ctxWithResponse,
        status,
        resource: url,
    });
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
