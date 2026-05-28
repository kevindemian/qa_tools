import crypto from 'crypto';
import { z } from 'zod';
import Config from './config';
import { rootLogger } from './logger';
import { sanitizeForLlm } from './sanitize';
import { checkCircuitBreaker, recordCircuitFailure, recordCircuitSuccess } from './circuit-breaker';
import { diskCacheGet, diskCacheSet, clearDiskCache } from './disk-cache';
import { LlmError, LlmProviderError, LlmRateLimitError, LlmAuthError } from './errors';

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
 */

/**
 * Named tier selecting which LLM model/provider configuration to use.
 *
 * Each tier corresponds to a distinct set of Config keys (model, API key,
 * base URL, temperature).  Tiers also define a fallback chain used when
 * the primary provider fails.
 */
export type LlmTier = 'main' | 'fast' | 'reviewer' | 'report' | 'fallback' | 'batch';
type ProviderFormat = 'openai' | 'gemini';
type ResponseFormat = 'text' | 'json';

interface ProviderConfig {
    apiKey: string;
    model: string;
    baseUrl: string;
    format: ProviderFormat;
    temperature: number;
    responseFormat?: ResponseFormat;
}

/** A cached LLM response with an absolute expiration timestamp. */
interface CacheEntry {
    /** The response text returned by the LLM. */
    response: string;
    /** Epoch ms after which this entry is considered stale. */
    expiresAt: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_CLEANUP_INTERVAL_MS = CACHE_TTL_MS / 2;
const LLM_TEMP_MAIN = 0.3;
const LLM_TEMP_REVIEWER = 0.2;
const LLM_TEMP_REPORT = 0.2;
const LLM_TEMP_FALLBACK = 0.3;
const LLM_TEMP_BATCH = 0.5;
const LLM_TEMP_DEFAULT = 0.3;
function getFetchRetries(): number {
    const val = Config.get('LLM_FETCH_RETRIES');
    return val ? parseInt(val, 10) : 3;
}
const LLM_RETRY_BASE_WAIT_MS = 2000;
const LLM_RETRY_MAX_WAIT_MS = 10000;
const LLM_FETCH_TIMEOUT_MS = 30000;
const LLM_ERROR_BODY_TRUNCATION = 200;
const LLM_RATE_WINDOW_MS = 60000;

function getRateLimitPerTier(): number {
    const val = Config.get('LLM_RATE_LIMIT');
    return val ? parseInt(val, 10) : 30;
}

const cache = new Map<string, CacheEntry>();
const _rateTimestamps = new Map<LlmTier, number[]>();
let _cleanupTimer: ReturnType<typeof setInterval> | null = null;

interface LlmClientMetrics {
    cacheHits: number;
    cacheMisses: number;
    totalPromptTokens: number;
    totalCompletionTokens: number;
    requestsByProviderKey: Record<string, number>;
}

const _llmMetrics: LlmClientMetrics = {
    cacheHits: 0,
    cacheMisses: 0,
    totalPromptTokens: 0,
    totalCompletionTokens: 0,
    requestsByProviderKey: {},
};

function _trackUsage(data: Record<string, unknown>, providerKey: string): void {
    _llmMetrics.requestsByProviderKey[providerKey] = (_llmMetrics.requestsByProviderKey[providerKey] || 0) + 1;
    let promptTokens = 0;
    let completionTokens = 0;
    const usage = data.usage as Record<string, number> | undefined;
    if (usage) {
        promptTokens = usage.prompt_tokens || 0;
        completionTokens = usage.completion_tokens || 0;
    } else {
        const usageMeta = data.usageMetadata as Record<string, number> | undefined;
        if (usageMeta) {
            promptTokens = usageMeta.promptTokenCount || 0;
            completionTokens = usageMeta.candidatesTokenCount || 0;
        }
    }
    _llmMetrics.totalPromptTokens += promptTokens;
    _llmMetrics.totalCompletionTokens += completionTokens;
    rootLogger.debug(
        'Token usage: prompt=' + promptTokens + ' completion=' + completionTokens + ' provider=' + providerKey,
    );
}

function extractContent(data: Record<string, unknown>, format: ProviderFormat): string {
    if (format === 'gemini') {
        const candidates = data.candidates as Array<{ content?: { parts?: Array<{ text?: string }> } }> | undefined;
        return candidates?.[0]?.content?.parts?.[0]?.text || '';
    }
    const choices = data.choices as Array<{ message?: { content?: string } }> | undefined;
    return choices?.[0]?.message?.content || '';
}

/** Snapshot the current LLM metrics counters (cache hits, misses, tokens). */
export function getLlmClientMetrics(): LlmClientMetrics {
    return _llmMetrics;
}

/** Reset all LLM metrics counters to zero. */
export function resetLlmClientMetrics(): void {
    _llmMetrics.cacheHits = 0;
    _llmMetrics.cacheMisses = 0;
    _llmMetrics.totalPromptTokens = 0;
    _llmMetrics.totalCompletionTokens = 0;
    _llmMetrics.requestsByProviderKey = {};
}

function startCacheCleanup(): void {
    if (_cleanupTimer !== null) return;
    _cleanupTimer = setInterval(() => {
        const now = Date.now();
        for (const [key, entry] of cache) {
            if (entry.expiresAt <= now) cache.delete(key);
        }
    }, CACHE_CLEANUP_INTERVAL_MS);
    if (_cleanupTimer && typeof _cleanupTimer === 'object' && 'unref' in _cleanupTimer) {
        _cleanupTimer.unref();
    }
}

startCacheCleanup();

const TIER_CONFIGS: Record<LlmTier, () => ProviderConfig> = {
    main: () => ({
        apiKey: Config.llmApiKey,
        model: Config.llmModel,
        baseUrl: Config.llmBaseUrl,
        format: 'openai',
        temperature: LLM_TEMP_MAIN,
    }),
    fast: () => ({
        apiKey: Config.llmFastApiKey,
        model: Config.llmFastModel,
        baseUrl: Config.llmFastBaseUrl,
        format: 'openai',
        temperature: LLM_TEMP_MAIN,
    }),
    reviewer: () => ({
        apiKey: Config.llmReviewApiKey || Config.llmSmallApiKey,
        model: Config.llmReviewModel || Config.llmSmallModel,
        baseUrl: Config.llmReviewBaseUrl || 'https://generativelanguage.googleapis.com/v1beta',
        format: 'gemini',
        temperature: LLM_TEMP_REVIEWER,
    }),
    report: () => ({
        apiKey: Config.llmApiKey,
        model: Config.llmModel,
        baseUrl: Config.llmBaseUrl,
        format: 'openai',
        temperature: LLM_TEMP_REPORT,
        responseFormat: 'json',
    }),
    fallback: () => ({
        apiKey: Config.llmFallbackApiKey,
        model: Config.llmFallbackModel,
        baseUrl: Config.llmFallbackBaseUrl,
        format: 'openai',
        temperature: LLM_TEMP_FALLBACK,
    }),
    batch: () => ({
        apiKey: Config.llmBatchApiKey,
        model: Config.llmBatchModel,
        baseUrl: Config.llmBatchBaseUrl,
        format: 'openai',
        temperature: LLM_TEMP_BATCH,
    }),
};

function tierToConfig(tier: LlmTier): ProviderConfig {
    const factory = TIER_CONFIGS[tier];
    return factory ? factory() : TIER_CONFIGS.main();
}

function configUniqueKey(cfg: ProviderConfig): string {
    return (
        cfg.baseUrl +
        '|' +
        cfg.model +
        '|' +
        cfg.temperature +
        '|' +
        (cfg.responseFormat || 'text') +
        '|' +
        (cfg.apiKey ? crypto.createHash('sha256').update(cfg.apiKey).digest('hex').slice(0, 8) : '')
    );
}

function cacheKey(
    tier: LlmTier,
    system: string,
    user: string,
    callerId?: string,
    responseFormat?: ResponseFormat,
): string {
    return crypto
        .createHash('sha256')
        .update(
            (callerId || '') +
                '|' +
                tier +
                '|' +
                configUniqueKey(tierToConfig(tier)) +
                '|' +
                (responseFormat || 'text') +
                '|' +
                system +
                '|' +
                user,
        )
        .digest('hex');
}

function buildOpenAiPayload(
    system: string,
    user: string,
    model: string,
    temperature?: number,
    responseFormat?: ResponseFormat,
): string {
    const payload: Record<string, unknown> = {
        model,
        temperature: temperature ?? LLM_TEMP_DEFAULT,
        messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
        ],
    };
    if (responseFormat === 'json') {
        payload.response_format = { type: 'json_object' };
    }
    return JSON.stringify(payload);
}

function buildGeminiPayload(system: string, user: string): string {
    return JSON.stringify({
        system_instruction: { parts: [{ text: system }] },
        contents: [
            {
                role: 'user',
                parts: [{ text: user }],
            },
        ],
    });
}

function parseRawOnce(raw: string): Record<string, unknown> | null {
    try {
        return JSON.parse(raw) as Record<string, unknown>;
    } catch {
        return null;
    }
}

async function fetchWithRetry(url: string, options: RequestInit, retries = getFetchRetries()): Promise<Response> {
    for (let attempt = 1; attempt <= retries; attempt++) {
        let resp: Response;
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), LLM_FETCH_TIMEOUT_MS);
            try {
                resp = await fetch(url, { ...options, signal: controller.signal });
            } finally {
                clearTimeout(timeout);
            }
        } catch (err) {
            if (attempt < retries) {
                const wait = jitter(Math.min(LLM_RETRY_BASE_WAIT_MS * Math.pow(2, attempt - 1), LLM_RETRY_MAX_WAIT_MS));
                rootLogger.warn('LLM fetch error, retrying in ' + wait + 'ms: ' + (err as Error).message);
                await new Promise((resolve) => setTimeout(resolve, wait));
                continue;
            }
            throw err;
        }
        if (resp.ok) return resp;
        if (resp.status === 429 || resp.status >= 500) {
            if (attempt < retries) {
                const wait = jitter(
                    parseRetryAfter(
                        resp,
                        Math.min(LLM_RETRY_BASE_WAIT_MS * Math.pow(2, attempt - 1), LLM_RETRY_MAX_WAIT_MS),
                    ),
                );
                rootLogger.warn('LLM HTTP ' + resp.status + ', retrying in ' + wait + 'ms');
                await new Promise((resolve) => setTimeout(resolve, wait));
                continue;
            }
        }
        const body = await resp.text().catch(() => '');
        throw new LlmProviderError(
            'LLM API error: HTTP ' + resp.status + ' ' + sanitizeForLlm(body).slice(0, LLM_ERROR_BODY_TRUNCATION),
        );
    }
    throw new LlmError('LLM max retries exceeded');
}

function checkRateLimit(tier: LlmTier): void {
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

function jitter(waitMs: number): number {
    return Math.round(waitMs * Math.random());
}

/** @internal exported for testing */
/** Parse the `Retry-After` header from an HTTP response, falling back to `defaultMs`. */
export function parseRetryAfter(resp: Response, defaultMs: number): number {
    const header = resp.headers.get('Retry-After');
    if (!header) return defaultMs;
    const seconds = parseInt(header, 10);
    if (!isNaN(seconds) && seconds > 0) return Math.min(seconds * 1000, LLM_RETRY_MAX_WAIT_MS);
    const dateMs = Date.parse(header);
    if (!isNaN(dateMs)) {
        const diff = dateMs - Date.now();
        if (diff > 0) return Math.min(diff, LLM_RETRY_MAX_WAIT_MS);
    }
    return defaultMs;
}

async function sendToProvider(cfg: ProviderConfig, system: string, user: string): Promise<string> {
    checkCircuitBreaker(configUniqueKey(cfg));
    if (!cfg.apiKey) throw new LlmAuthError('API key missing for tier');

    const url =
        cfg.format === 'gemini'
            ? cfg.baseUrl + '/models/' + cfg.model + ':generateContent'
            : cfg.baseUrl.replace(/\/+$/, '') + '/chat/completions';

    const payload =
        cfg.format === 'gemini'
            ? buildGeminiPayload(system, user)
            : buildOpenAiPayload(system, user, cfg.model, cfg.temperature, cfg.responseFormat);

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (cfg.format === 'gemini') {
        headers['X-Goog-Api-Key'] = cfg.apiKey;
    } else {
        headers['Authorization'] = 'Bearer ' + cfg.apiKey;
    }

    const resp = await fetchWithRetry(url, { method: 'POST', headers, body: payload });
    const raw = await resp.text();
    const data = parseRawOnce(raw);
    if (!data) {
        rootLogger.warn('LLM provider returned non-JSON response on 200 OK (raw length: ' + raw.length + ')');
        return '';
    }

    const errPayload = data.error as Record<string, unknown> | string | undefined;
    if (errPayload) {
        const msg =
            typeof errPayload === 'string' ? errPayload : (errPayload.message as string) || JSON.stringify(errPayload);
        throw new LlmProviderError('LLM API error: ' + msg);
    }

    _trackUsage(data, configUniqueKey(cfg));
    return extractContent(data, cfg.format);
}

async function sendWithFallback(
    tier: LlmTier,
    system: string,
    user: string,
    responseFormat?: ResponseFormat,
): Promise<string> {
    checkRateLimit(tier);
    const primary = tierToConfig(tier);
    const errors: string[] = [];

    const candidates: ProviderConfig[] = [primary];

    const fallbackMap: Partial<Record<LlmTier, LlmTier[]>> = {
        main: ['fallback', 'batch'],
        fast: ['main', 'fallback', 'batch'],
        report: ['fallback', 'batch'],
    };
    const fallbacks = fallbackMap[tier] || [];
    const seenKeys = new Set<string>();
    seenKeys.add(configUniqueKey(primary));
    for (const t of fallbacks) {
        const cfg = tierToConfig(t);
        const key = configUniqueKey(cfg);
        if (!seenKeys.has(key)) {
            candidates.push(cfg);
            seenKeys.add(key);
        }
    }

    if (responseFormat) {
        for (const cfg of candidates) cfg.responseFormat = responseFormat;
    }

    for (let i = 0; i < candidates.length; i++) {
        const cfg = candidates[i];
        if (!cfg) continue;
        const cfgKey = configUniqueKey(cfg);
        try {
            const result = await sendToProvider(cfg, system, user);
            recordCircuitSuccess(cfgKey);
            return result;
        } catch (err) {
            const msg = (err as Error).message;
            errors.push(cfg.model + '@' + cfg.baseUrl + ': ' + msg);
            rootLogger.warn('LLM provider failed: ' + msg + ' — trying next');
            recordCircuitFailure(cfgKey);
        }
    }

    throw new LlmProviderError('All LLM providers failed: ' + errors.join('; '));
}

/**
 * Estimate input token count (chars / 4 heuristic).
 * @internal
 */
export function _estimateInputTokens(system: string, user: string): number {
    return Math.ceil((system.length + user.length) / 4);
}

function _checkTotalTokenLimit(): void {
    const maxTotal = Config.llmMaxTotalTokens;
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
    const maxTokens = Config.llmMaxTokens;
    const estimated = _estimateInputTokens(system, user);
    if (estimated > maxTokens) {
        throw new LlmError(
            `Input too large: estimated ${estimated} tokens exceeds limit of ${maxTokens}. ` +
                `Reduce prompt size or increase LLM_MAX_TOKENS_PER_OP.`,
        );
    }
}

function _validateWithSchema<T>(raw: string, schema: z.ZodType<T>): T | null {
    const parsed = parseRawOnce(raw);
    if (!parsed) return null;
    const result = schema.safeParse(parsed);
    if (result.success) return result.data;
    return null;
}

/** Basic sanity-check: ensure the response is valid JSON. Used when responseFormat='json' and no Zod schema is provided. */
function _warnIfNotJson(raw: string): void {
    const parsed = parseRawOnce(raw);
    if (!parsed) {
        rootLogger.warn('LLM response expected JSON but was not parseable — returning raw text');
    }
}

/**
 * Send a prompt to the LLM with caching, rate limiting, tier fallback,
 * optional Zod schema validation (with 1 automatic retry on failure).
 *
 * Checks the in-memory cache first (keyed by tier + system + user +
 * optional callerId).  On miss, dispatches through the selected tier's
 * primary provider; if that fails, walks the tier's fallback chain
 * (e.g. main → fallback → batch).  The result is cached for 5 minutes
 * before being returned.
 *
 * When a Zod schema is provided, the LLM response is validated against it.
 * If validation fails, a single retry is performed with the schema errors
 * injected as a hint.  Cache hits are also re-validated; stale/invalid
 * cache entries trigger a re-request.
 *
 * @param tier           - Which model/provider tier to route through.
 * @param system         - System-level instruction (role: system in OpenAI
 *                         format, prepended in Gemini format).
 * @param user           - User message content (role: user).
 * @param callerId       - Optional identifier mixed into the cache key to
 *                         prevent collisions between unrelated callers.
 * @param responseFormat - Override response format for this call (tier default
 *                         otherwise).
 * @param schema         - Optional Zod schema for response validation.
 * @returns The LLM response text (or parsed data when schema is provided).
 * @throws When every provider in the tier's fallback chain has failed, or
 *         when schema validation fails even after a retry.
 */
export async function llmPrompt<T = string>(
    tier: LlmTier,
    system: string,
    user: string,
    callerId?: string,
    responseFormat?: ResponseFormat,
    schema?: z.ZodType<T>,
): Promise<T> {
    const cKey = cacheKey(tier, system, user, callerId, responseFormat);
    const cached = cache.get(cKey);
    if (cached && cached.expiresAt > Date.now()) {
        _llmMetrics.cacheHits++;
        rootLogger.info('LLM cache hit for tier=' + tier + (callerId ? ' callerId=' + callerId : ''));
        if (schema) {
            const valid = _validateWithSchema(cached.response, schema);
            if (valid !== null) return valid;
            rootLogger.warn('LLM cache hit but schema invalid — re-requesting');
            cache.delete(cKey);
        } else {
            if (responseFormat === 'json') _warnIfNotJson(cached.response);
            return cached.response as unknown as T;
        }
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

    const diskCached = diskCacheGet(cKey);
    if (diskCached !== null) {
        if (schema) {
            const valid = _validateWithSchema(diskCached, schema);
            if (valid !== null) {
                cache.set(cKey, { response: diskCached, expiresAt: Date.now() + CACHE_TTL_MS });
                return valid;
            }
            rootLogger.warn('LLM disk cache hit but schema invalid — re-requesting');
        } else {
            if (responseFormat === 'json') _warnIfNotJson(diskCached);
            cache.set(cKey, { response: diskCached, expiresAt: Date.now() + CACHE_TTL_MS });
            return diskCached as unknown as T;
        }
    }

    const response = await sendWithFallback(tier, system, user, responseFormat);

    if (schema) {
        const valid = _validateWithSchema(response, schema);
        if (valid !== null) {
            cache.set(cKey, { response, expiresAt: Date.now() + CACHE_TTL_MS });
            diskCacheSet(cKey, response);
            return valid;
        }

        rootLogger.warn('LLM response failed schema validation — retrying with hint');
        const parsed = parseRawOnce(response);
        const hints =
            parsed && schema.safeParse(parsed).error
                ? schema
                      .safeParse(parsed)
                      .error!.issues.map(
                          (i) => `- ${i.path.join('.')}: ${i.message} (received: ${JSON.stringify(parsed)})`,
                      )
                      .join('\n')
                : 'Response was not valid JSON. Return ONLY valid JSON matching the required schema.';

        const retryResponse = await sendWithFallback(
            tier,
            system + '\n\n[SCHEMA VALIDATION FAILED]\n' + hints,
            user,
            responseFormat,
        );
        const retryValid = _validateWithSchema(retryResponse, schema);
        if (retryValid !== null) {
            cache.set(cKey, { response: retryResponse, expiresAt: Date.now() + CACHE_TTL_MS });
            diskCacheSet(cKey, retryResponse);
            return retryValid;
        }

        const errMsg = 'LLM response failed schema validation after retry';
        rootLogger.error(errMsg);
        throw new LlmError(errMsg);
    }

    if (responseFormat === 'json' && !schema) _warnIfNotJson(response);

    cache.set(cKey, { response, expiresAt: Date.now() + CACHE_TTL_MS });
    diskCacheSet(cKey, response);
    return response as unknown as T;
}

/** Evict all cached LLM responses (memory + disk). Useful in tests or when provider config changes at runtime. */
/** Clear both the in-memory and disk LLM response caches. */
export function clearCache(): void {
    cache.clear();
    clearDiskCache();
}

/** Reset per-tier rate-limit tracking. Typically called in test teardown. */
/** Reset the per-tier rate limiter state (used in tests). */
export function resetRateLimiter(): void {
    _rateTimestamps.clear();
}

export { resetCircuitState, getCircuitState } from './circuit-breaker';
