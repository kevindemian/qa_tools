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
import Config from '../config-accessor.js';
import { rootLogger } from '../logger.js';
import { LlmError } from '../errors.js';

import { validateLlmResponse } from './llm-validation.js';
import { generateWithRetry } from '../quality/targeted-retry.js';
import { initModelResolver } from './model-resolver.js';
import {
    _llmMetrics,
    getLlmClientMetrics,
    resetLlmClientMetrics,
    parseRetryAfter,
    _estimateInputTokens,
    sendWithFallback,
    tierToConfig,
} from './llm-fallback.js';
import type {
    LlmTier,
    LlmPromptOptions,
    ResponseFormat,
    ZodSchema,
    ZodSchemaTyped,
    InferSchemaData,
} from '../types.js';

import {
    checkMemoryCache,
    checkDiskCache,
    cacheKey,
    configUniqueKey,
    setMemoryCache,
    setDiskCache,
    checkSchema,
    warnIfNotJson,
} from './llm-cache.js';

// ---- re-exports ----

export type { LlmPromptOptions } from '../types.js';
export { clearCache } from './llm-cache.js';
export { resetRateLimiter } from './llm-rate-limiter.js';
export { resetCircuitState } from '../infra/circuit-breaker.js';
export { getLlmClientMetrics, resetLlmClientMetrics, parseRetryAfter, _estimateInputTokens };
export type { LlmTier } from '../types.js';

// ---- token limits ----

/** Narrow a raw ZodSchema to a typed variant using the inferred data type.
 *  The type parameter T MUST match the schema's actual output type
 *  (callers should pass InferSchemaData<S> as T). */
function typedSchemaOf<T>(schema: ZodSchema): schema is ZodSchemaTyped<T> {
    return typeof schema.safeParse === 'function';
}

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
    schema: ZodSchemaTyped<T>;
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
    rootLogger.warn('LLM response failed schema validation — progressive retry via generateWithRetry');
    const optsForRetry = {
        tier,
        system,
        user,
        callerId: 'validate-retry',
        ...(responseFormat ? { responseFormat } : {}),
        schema,
    };
    const noopValidator = {
        validate: () => ({
            allPassed: true,
            results: [],
            totalInvariants: 0,
            passed: 0,
            failed: 0,
            warnings: 0,
        }),
    } as const;
    const retryResult = await generateWithRetry<T>(
        optsForRetry as Parameters<typeof generateWithRetry>[0],
        schema,
        llmPrompt,
        noopValidator,
        noopValidator,
        { inputRaw: user, artifactType: 'schema-validation' },
        {
            layer1: { maxRetries: 2, enabled: true },
            layer2: { maxRetries: 0, enabled: false },
            layer3: { maxRetries: 0, enabled: false },
        },
    );
    if (retryResult.data !== null) {
        setMemoryCache(cKey, JSON.stringify(retryResult.data));
        setDiskCache(cKey, JSON.stringify(retryResult.data));
        return retryResult.data;
    }
    const errMsg = 'LLM response failed schema validation after progressive retry';
    rootLogger.error(errMsg + ': ' + retryResult.finalErrors.join('; '));
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
export async function llmPrompt(opts: LlmPromptOptions<never>): Promise<string>;
export async function llmPrompt<S extends ZodSchema>(opts: LlmPromptOptions<S>): Promise<InferSchemaData<S>>;
export async function llmPrompt<S extends ZodSchema = never>(
    opts: LlmPromptOptions<S>,
): Promise<string | InferSchemaData<S>> {
    const { tier, system, user, callerId, responseFormat, schema } = opts;
    type T = [S] extends [never] ? string : InferSchemaData<NonNullable<S>>;
    const typedSchema = schema !== undefined && typedSchemaOf<T>(schema) ? schema : undefined;
    const cfgKey = configUniqueKey(tierToConfig(tier));
    const cKey = cacheKey(tier, cfgKey, system, user, callerId, responseFormat);

    const memResult = checkMemoryCache(cKey, tier, callerId, typedSchema, responseFormat);
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

    const diskResult = checkDiskCache(cKey, typedSchema, responseFormat);
    if (diskResult.data !== null) {
        _llmMetrics.cacheHits++;
        return diskResult.data;
    }

    // Auto-probe day-0: fire initModelResolver in background if never ran.
    // Safe to call multiple times — initModelResolver guards against re-entry.
    void initModelResolver();

    const response = await sendWithFallback(tier, system, user, responseFormat);

    await validateLlmResponse(response);

    if (typedSchema)
        return _validateWithRetry({
            tier,
            system,
            user,
            ...(responseFormat ? { responseFormat } : {}),
            schema: typedSchema,
            cKey,
            response,
        });

    if (responseFormat === 'json') warnIfNotJson(response);

    setMemoryCache(cKey, response);
    setDiskCache(cKey, response);
    return response;
}
