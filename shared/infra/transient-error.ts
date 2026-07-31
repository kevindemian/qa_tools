/** Transient-error detection shared across retry layers.
 *
 *  Consolidates predicates previously duplicated in issue-snapshot.ts,
 *  xray-cloud-client.ts and http-client.ts into a single source of truth.
 *  A transient error is one where retrying the same operation has a
 *  reasonable chance of success (network hiccup, rate limit, 5xx). */

export interface RetryableLike {
    code?: string;
    response?: { status?: number };
}

const TRANSIENT_CODES = ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EINVAL', 'EAI_AGAIN', 'ECONNABORTED'] as const;

const TRANSIENT_MESSAGE = /read EINVAL|ECONNRESET/i;

/** Return `true` when the error is transient (retryable).
 *  Covers: network error codes, connection messages, HTTP 429 and 5xx.
 *  NaN/undefined-safe: non-objects and missing codes/status resolve to false (§24). */
export function isTransientError(err: unknown): boolean {
    if (!err || typeof err !== 'object') return false;
    const candidate = err as RetryableLike;
    if (typeof candidate.code === 'string' && (TRANSIENT_CODES as readonly string[]).includes(candidate.code)) {
        return true;
    }
    const status = candidate.response?.status;
    if (typeof status === 'number' && (status === 429 || status >= 500)) return true;
    if (err instanceof Error && TRANSIENT_MESSAGE.test(err.message)) return true;
    return false;
}

/** Return `true` for network-only transient codes that warrant silent auto-retry. */
export function isNetworkTransient(code: string | undefined): boolean {
    if (!code) return false;
    return (TRANSIENT_CODES as readonly string[]).includes(code);
}
