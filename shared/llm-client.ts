import crypto from 'crypto';
import Config from './config';
import { rootLogger } from './logger';
import { sanitizeForLlm } from './sanitize';

/**
 * Multi-tier LLM client with automatic fallback, caching, rate limiting,
 * and circuit-breaker protection.
 *
 * Architecture
 * ------------
 * Six named tiers (main, fast, reviewer, report, fallback, batch) each map
 * to a distinct model/provider configuration via Config.  On failure the
 * client transparently walks the tier's fallback chain (e.g. main →
 * fallback → batch).  Responses are cached by SHA-256 hash for 5 minutes
 * to avoid redundant calls.  Per-tier rate limiting and a circuit breaker
 * (5 failures → 30 s cooldown) protect upstream providers.
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
const LLM_FETCH_RETRIES = 3;
const LLM_RETRY_BASE_WAIT_MS = 2000;
const LLM_RETRY_MAX_WAIT_MS = 10000;
const LLM_FETCH_TIMEOUT_MS = 30000;
const LLM_ERROR_BODY_TRUNCATION = 200;
const LLM_RATE_WINDOW_MS = 60000;
const LLM_CIRCUIT_BREAK_THRESHOLD = 5;
const LLM_CIRCUIT_BREAK_MS = 30000;

function getRateLimitPerTier(): number {
    const val = Config.get('LLM_RATE_LIMIT');
    return val ? parseInt(val, 10) : 30;
}

const cache = new Map<string, CacheEntry>();
const _rateTimestamps = new Map<LlmTier, number[]>();
const _circuitState = new Map<LlmTier, { failures: number; breakUntil: number }>();
let _cleanupTimer: ReturnType<typeof setInterval> | null = null;

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
    return cfg.baseUrl + '|' + cfg.model + '|' + cfg.temperature + '|' + (cfg.responseFormat || 'text');
}

function cacheKey(tier: LlmTier, system: string, user: string, callerId?: string): string {
    return crypto
        .createHash('sha256')
        .update((callerId || '') + '|' + tier + '|' + configUniqueKey(tierToConfig(tier)) + '|' + system + '|' + user)
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
        contents: [
            {
                role: 'user',
                parts: [{ text: system + '\n\n' + user }],
            },
        ],
    });
}

function parseOpenAiResponse(raw: string): string {
    try {
        const data = JSON.parse(raw);
        return data.choices?.[0]?.message?.content || '';
    } catch {
        return '';
    }
}

function parseGeminiResponse(raw: string): string {
    try {
        const data = JSON.parse(raw);
        return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    } catch {
        return '';
    }
}

async function fetchWithRetry(url: string, options: RequestInit, retries = LLM_FETCH_RETRIES): Promise<Response> {
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
        throw new Error(
            'LLM API error: HTTP ' + resp.status + ' ' + sanitizeForLlm(body).slice(0, LLM_ERROR_BODY_TRUNCATION),
        );
    }
    throw new Error('LLM max retries exceeded');
}

function checkRateLimit(tier: LlmTier): void {
    const now = Date.now();
    const limit = getRateLimitPerTier();
    const timestamps = _rateTimestamps.get(tier) || [];
    const windowed = timestamps.filter((t) => now - t < LLM_RATE_WINDOW_MS);
    if (windowed.length >= limit) {
        throw new Error(
            'Rate limit exceeded for tier ' + tier + ' (' + limit + ' req/' + LLM_RATE_WINDOW_MS / 1000 + 's)',
        );
    }
    windowed.push(now);
    _rateTimestamps.set(tier, windowed);
}

function checkCircuitBreaker(tier: LlmTier): void {
    const state = _circuitState.get(tier);
    if (state && state.failures >= LLM_CIRCUIT_BREAK_THRESHOLD && Date.now() < state.breakUntil) {
        throw new Error(
            'Circuit breaker open for tier ' +
                tier +
                ' (retry after ' +
                Math.ceil((state.breakUntil - Date.now()) / 1000) +
                's)',
        );
    }
}

function recordCircuitFailure(tier: LlmTier): void {
    const state = _circuitState.get(tier) || { failures: 0, breakUntil: 0 };
    state.failures++;
    if (state.failures >= LLM_CIRCUIT_BREAK_THRESHOLD) {
        state.breakUntil = Date.now() + LLM_CIRCUIT_BREAK_MS;
        rootLogger.warn('Circuit breaker opened for tier ' + tier + ' for ' + LLM_CIRCUIT_BREAK_MS / 1000 + 's');
    }
    _circuitState.set(tier, state);
}

function recordCircuitSuccess(tier: LlmTier): void {
    const state = _circuitState.get(tier);
    if (state) {
        state.failures = 0;
        state.breakUntil = 0;
    }
}

function jitter(waitMs: number): number {
    return Math.round(waitMs * (0.5 + Math.random() * 0.5));
}

function parseRetryAfter(resp: Response, defaultMs: number): number {
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

async function sendToProvider(cfg: ProviderConfig, tier: LlmTier, system: string, user: string): Promise<string> {
    checkCircuitBreaker(tier);
    if (!cfg.apiKey) throw new Error('API key missing for tier');

    if (cfg.format === 'gemini') {
        const payload = buildGeminiPayload(system, user);
        const url = cfg.baseUrl + '/models/' + cfg.model + ':generateContent';
        const resp = await fetchWithRetry(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': cfg.apiKey },
            body: payload,
        });
        const raw = await resp.text();
        return parseGeminiResponse(raw);
    }

    const payload = buildOpenAiPayload(system, user, cfg.model, cfg.temperature, cfg.responseFormat);
    const url = cfg.baseUrl.replace(/\/+$/, '') + '/chat/completions';
    const resp = await fetchWithRetry(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + cfg.apiKey,
        },
        body: payload,
    });
    const raw = await resp.text();
    return parseOpenAiResponse(raw);
}

async function sendWithFallback(tier: LlmTier, system: string, user: string): Promise<string> {
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

    for (let i = 0; i < candidates.length; i++) {
        const cfg = candidates[i]!;
        try {
            const result = await sendToProvider(cfg, tier, system, user);
            if (i === 0) recordCircuitSuccess(tier);
            return result;
        } catch (err) {
            const msg = (err as Error).message;
            errors.push(cfg.model + '@' + cfg.baseUrl + ': ' + msg);
            rootLogger.warn('LLM provider failed: ' + msg + ' — trying next');
            if (/HTTP 429/i.test(msg)) recordCircuitFailure(tier);
        }
    }

    throw new Error('All LLM providers failed: ' + errors.join('; '));
}

/**
 * Send a prompt to the LLM with caching, rate limiting, and tier fallback.
 *
 * Checks the in-memory cache first (keyed by tier + system + user +
 * optional callerId).  On miss, dispatches through the selected tier's
 * primary provider; if that fails, walks the tier's fallback chain
 * (e.g. main → fallback → batch).  The result is cached for 5 minutes
 * before being returned.
 *
 * @param tier     - Which model/provider tier to route through.
 * @param system   - System-level instruction (role: system in OpenAI
 *                   format, prepended in Gemini format).
 * @param user     - User message content (role: user).
 * @param callerId - Optional identifier mixed into the cache key to
 *                   prevent collisions between unrelated callers.
 * @returns The LLM response text.
 * @throws When every provider in the tier's fallback chain has failed.
 */
export async function llmPrompt(tier: LlmTier, system: string, user: string, callerId?: string): Promise<string> {
    const cKey = cacheKey(tier, system, user, callerId);
    const cached = cache.get(cKey);
    if (cached && cached.expiresAt > Date.now()) {
        rootLogger.info('LLM cache hit for tier=' + tier);
        return cached.response;
    }

    rootLogger.info('LLM request tier=' + tier + ' system_len=' + system.length + ' user_len=' + user.length);
    const response = await sendWithFallback(tier, system, user);

    cache.set(cKey, { response, expiresAt: Date.now() + CACHE_TTL_MS });
    return response;
}

/** Evict all cached LLM responses. Useful in tests or when provider config changes at runtime. */
export function clearCache(): void {
    cache.clear();
}

/** Reset per-tier rate-limit tracking. Typically called in test teardown. */
export function resetRateLimiter(): void {
    _rateTimestamps.clear();
}

/** Reset all circuit-breaker failure counts. Typically called in test teardown. */
export function resetCircuitState(): void {
    _circuitState.clear();
}
