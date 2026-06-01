/**
 * Multi-tier LLM client with automatic fallback, caching, rate limiting,
 * and circuit-breaker protection.
 *
 * Architecture
 * ------------
 * Six named tiers (main, fast, reviewer, report, fallback, batch) each map
 * to a distinct model/provider configuration via Config.  On failure the
 * client transparently walks the tier's fallback chain (e.g. main →
 * fallback → batch).  Responses are cached by SHA-256 hash — first in
 * memory (5 minutes) then on disk (1 hour, configurable via
 * LLM_DISK_CACHE_DIR) — to avoid redundant calls.  Per-tier rate limiting
 * and a circuit breaker (5 failures → 30 s cooldown) protect upstream
 * providers.
 *
 * Layer breakdown (extracted modules):
 *   llm-rate-limiter  — per-tier client-side rate limiting
 *   llm-cache         — in-memory + disk response cache
 *   llm-fallback      — tier configs, provider calls, fallback chain
 */
import { z } from 'zod';
import Config from './config';
import { rootLogger } from './logger';
import { LlmError } from './errors';

import {
    _llmMetrics,
    getLlmClientMetrics,
    resetLlmClientMetrics,
    parseRetryAfter,
    _estimateInputTokens,
    sendWithFallback,
    parseRawOnce,
    tierToConfig,
} from './llm-fallback';
import type { LlmTier, ResponseFormat } from './types';

import {
    checkMemoryCache,
    checkDiskCache,
    cacheKey,
    configUniqueKey,
    setMemoryCache,
    setDiskCache,
    checkSchema,
    warnIfNotJson,
} from './llm-cache';

// ---- re-exports ----

export { clearCache } from './llm-cache';
export { resetRateLimiter } from './llm-rate-limiter';
export { resetCircuitState } from './circuit-breaker';
export { getLlmClientMetrics, resetLlmClientMetrics, parseRetryAfter, _estimateInputTokens };
export type { LlmTier } from './types';

// ---- token limits ----

function _checkTotalTokenLimit(): void {
    const maxTotal = Config.get<number>('llmMaxTotalTokens');
    if (maxTotal <= 0) return;
    const current = _llmMetrics.totalPromptTokens + _llmMetrics.totalCompletionTokens;
    if (current >= maxTotal) {
        throw new LlmError(
            `Total token limit reached: ${current} tokens used, limit is ${maxTotal}. ` +
                `Increase LLM_MAX_TOTAL_TOKENS or reset metrics via resetLlmClientMetrics().`,
        );
    }
}

function _checkTokenLimit(system: string, user: string): void {
    const maxTokens = Config.get<number>('llmMaxTokens');
    const estimated = _estimateInputTokens(system, user);
    if (estimated > maxTokens) {
        throw new LlmError(
            `Input too large: estimated ${estimated} tokens exceeds limit of ${maxTokens}. ` +
                `Reduce prompt size or increase LLM_MAX_TOKENS_PER_OP.`,
        );
    }
}

// ---- schema validation with retry ----

interface ValidateWithRetryOptions<T> {
    tier: LlmTier;
    system: string;
    user: string;
    responseFormat?: ResponseFormat;
    schema: z.ZodType<T>;
    cKey: string;
    response: string;
}

async function _validateWithRetry<T>(opts: ValidateWithRetryOptions<T>): Promise<T> {
    const { tier, system, user, responseFormat, schema, cKey, response } = opts;
    const valid = checkSchema(response, schema);
    if (valid !== null) {
        setMemoryCache(cKey, response);
        setDiskCache(cKey, response);
        return valid;
    }
    rootLogger.warn('LLM response failed schema validation — retrying with hint');
    const parsed = parseRawOnce(response);
    const parseResult = parsed && schema.safeParse(parsed);
    const hints = parseResult?.error
        ? parseResult.error.issues
              .map((i) => `- ${i.path.join('.')}: ${i.message} (received: ${JSON.stringify(parsed)})`)
              .join('\n')
        : 'Response was not valid JSON. Return ONLY valid JSON matching the required schema.';
    const retryResponse = await sendWithFallback(
        tier,
        system + '\n\n[SCHEMA VALIDATION FAILED]\n' + hints,
        user,
        responseFormat,
    );
    const retryValid = checkSchema(retryResponse, schema);
    if (retryValid !== null) {
        setMemoryCache(cKey, retryResponse);
        setDiskCache(cKey, retryResponse);
        return retryValid;
    }
    const errMsg = 'LLM response failed schema validation after retry';
    rootLogger.error(errMsg);
    throw new LlmError(errMsg);
}

// ---- main prompt API ----

/**
 * Send a prompt to the LLM with caching, rate limiting, tier fallback,
 * optional Zod schema validation (with 1 automatic retry on failure).
 *
 * @param tier           - Which model/provider tier to route through.
 * @param system         - System-level instruction.
 * @param user           - User message content.
 * @param callerId       - Optional identifier for cache key disambiguation.
 * @param responseFormat - Override response format for this call.
 * @param schema         - Optional Zod schema for response validation.
 * @returns The LLM response text (or parsed data when schema is provided).
 * @throws When every provider in the fallback chain fails, or schema validation fails after retry.
 */
export interface LlmPromptOptions<T> {
    tier: LlmTier;
    system: string;
    user: string;
    callerId?: string;
    responseFormat?: ResponseFormat;
    schema?: z.ZodType<T>;
}

export async function llmPrompt<T = string>(opts: LlmPromptOptions<T>): Promise<T> {
    const { tier, system, user, callerId, responseFormat, schema } = opts;
    const cfgKey = configUniqueKey(tierToConfig(tier));
    const cKey = cacheKey(tier, cfgKey, system, user, callerId, responseFormat);

    const memResult = checkMemoryCache(cKey, tier, callerId, schema, responseFormat);
    if (memResult.data !== null) {
        _llmMetrics.cacheHits++;
        return memResult.data;
    }

    _llmMetrics.cacheMisses++;
    rootLogger.info(
        'LLM request tier=' +
            tier +
            ' system_len=' +
            system.length +
            ' user_len=' +
            user.length +
            (callerId ? ' callerId=' + callerId : ''),
    );

    _checkTokenLimit(system, user);
    _checkTotalTokenLimit();

    const diskResult = checkDiskCache(cKey, schema, responseFormat);
    if (diskResult.data !== null) {
        _llmMetrics.cacheHits++;
        return diskResult.data;
    }

    const response = await sendWithFallback(tier, system, user, responseFormat);

    if (schema) return _validateWithRetry({ tier, system, user, responseFormat, schema, cKey, response });

    if (responseFormat === 'json' && !schema) warnIfNotJson(response);

    setMemoryCache(cKey, response);
    setDiskCache(cKey, response);
    return response as unknown as T;
}
