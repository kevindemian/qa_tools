/**
 * Per-tier client-side rate limiter for LLM providers.
 * Tracks request timestamps per tier and enforces a sliding-window limit.
 */
import type { LlmTier } from './types.js';
import crypto from 'crypto';
import { LlmRateLimitError } from './errors.js';
import Config from './config-accessor.js';

export const LLM_RATE_WINDOW_MS = 60000;

const _rateTimestamps = new Map<LlmTier, number[]>();

function getRateLimitPerTier(): number {
    const val = Config.get('LLM_RATE_LIMIT');
    return val ? parseInt(val, 10) : 30;
}

/** Random jitter: 0..waitMs (for exponential backoff). */
export function jitter(waitMs: number): number {
    const rand = crypto.getRandomValues(new Uint32Array(1));
    return Math.round(waitMs * ((rand[0] ?? 0) / 0xffffffff));
}

/** Throws LlmRateLimitError if the tier has exceeded its request quota in the current window. */
export function checkRateLimit(tier: LlmTier): void {
    const now = Date.now();
    const limit = getRateLimitPerTier();
    const timestamps = _rateTimestamps.get(tier) || [];
    const windowed = timestamps.filter((t) => now - t < LLM_RATE_WINDOW_MS);
    if (windowed.length >= limit) {
        throw new LlmRateLimitError(
            'Client-side rate limit exceeded for tier ' +
                tier +
                ' (' +
                limit +
                ' req/' +
                LLM_RATE_WINDOW_MS / 1000 +
                's)',
        );
    }
    windowed.push(now);
    _rateTimestamps.set(tier, windowed);
}

/** Reset the per-tier rate limiter state (used in tests). */
export function resetRateLimiter(): void {
    _rateTimestamps.clear();
}
