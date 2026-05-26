import crypto from 'crypto';
import Config from './config';
import { rootLogger } from './logger';
import { sanitizeForLlm } from './sanitize';

export type LlmTier = 'main' | 'small' | 'fast' | 'reviewer' | 'report' | 'fallback' | 'batch';
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

interface CacheEntry {
    response: string;
    expiresAt: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_CLEANUP_INTERVAL_MS = CACHE_TTL_MS / 2;
const LLM_TEMP_MAIN = 0.3;
const LLM_TEMP_SMALL = 0.1;
const LLM_TEMP_REVIEWER = 0.2;
const LLM_TEMP_REPORT = 0.2;
const LLM_TEMP_FALLBACK = 0.3;
const LLM_TEMP_BATCH = 0.5;
const LLM_TEMP_DEFAULT = 0.3;
const LLM_FETCH_RETRIES = 3;
const LLM_RETRY_BASE_WAIT_MS = 2000;
const LLM_RETRY_MAX_WAIT_MS = 10000;
const LLM_ERROR_BODY_TRUNCATION = 200;
const LLM_RATE_LIMIT_PER_TIER = 30;
const LLM_RATE_WINDOW_MS = 60000;
const LLM_CIRCUIT_BREAK_THRESHOLD = 5;
const LLM_CIRCUIT_BREAK_MS = 30000;

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

function _mainTierConfig(): ProviderConfig {
    return {
        apiKey: Config.llmApiKey,
        model: Config.llmModel,
        baseUrl: Config.llmBaseUrl,
        format: 'openai',
        temperature: LLM_TEMP_MAIN,
    };
}

function _smallFastTierConfig(): ProviderConfig {
    return {
        apiKey: Config.llmFastApiKey,
        model: Config.llmFastModel,
        baseUrl: Config.llmFastBaseUrl,
        format: 'openai',
        temperature: LLM_TEMP_SMALL,
    };
}

function _reviewerTierConfig(): ProviderConfig {
    return {
        apiKey: Config.llmReviewApiKey || Config.llmSmallApiKey,
        model: Config.llmReviewModel || Config.llmSmallModel,
        baseUrl: Config.llmReviewBaseUrl || 'https://generativelanguage.googleapis.com/v1beta',
        format: 'gemini',
        temperature: LLM_TEMP_REVIEWER,
    };
}

function _reportTierConfig(): ProviderConfig {
    return {
        apiKey: Config.llmApiKey,
        model: Config.llmModel,
        baseUrl: Config.llmBaseUrl,
        format: 'openai',
        temperature: LLM_TEMP_REPORT,
        responseFormat: 'json',
    };
}

function _fallbackTierConfig(): ProviderConfig {
    return {
        apiKey: Config.llmFallbackApiKey,
        model: Config.llmFallbackModel,
        baseUrl: Config.llmFallbackBaseUrl,
        format: 'openai',
        temperature: LLM_TEMP_FALLBACK,
    };
}

function _batchTierConfig(): ProviderConfig {
    return {
        apiKey: Config.llmBatchApiKey,
        model: Config.llmBatchModel,
        baseUrl: Config.llmBatchBaseUrl,
        format: 'openai',
        temperature: LLM_TEMP_BATCH,
    };
}

function tierToConfig(tier: LlmTier): ProviderConfig {
    switch (tier) {
        case 'main':
            return _mainTierConfig();
        case 'small':
            rootLogger.warn('Tier "small" is deprecated, use "fast" instead');
            return _smallFastTierConfig();
        case 'fast':
            return _smallFastTierConfig();
        case 'reviewer':
            return _reviewerTierConfig();
        case 'report':
            return _reportTierConfig();
        case 'fallback':
            return _fallbackTierConfig();
        case 'batch':
            return _batchTierConfig();
    }
}

function cacheKey(tier: LlmTier, system: string, user: string, callerId?: string): string {
    return crypto
        .createHash('sha256')
        .update((callerId || '') + '|' + tier + '|' + system + '|' + user)
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
            resp = await fetch(url, options);
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
    const timestamps = _rateTimestamps.get(tier) || [];
    const windowed = timestamps.filter((t) => now - t < LLM_RATE_WINDOW_MS);
    if (windowed.length >= LLM_RATE_LIMIT_PER_TIER) {
        throw new Error(
            'Rate limit exceeded for tier ' +
                tier +
                ' (' +
                LLM_RATE_LIMIT_PER_TIER +
                ' req/' +
                LLM_RATE_WINDOW_MS / 1000 +
                's)',
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
    _circuitState.delete(tier);
}

function jitter(waitMs: number): number {
    return Math.round(waitMs * (0.5 + Math.random() * 0.5));
}

function parseRetryAfter(resp: Response, defaultMs: number): number {
    const header = resp.headers.get('Retry-After');
    if (!header) return defaultMs;
    const seconds = parseInt(header, 10);
    if (!isNaN(seconds) && seconds > 0) return Math.min(seconds * 1000, LLM_RETRY_MAX_WAIT_MS);
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

    // Per-tier fallback chain
    const fallbackMap: Partial<Record<LlmTier, LlmTier[]>> = {
        main: ['fallback', 'batch'],
        fast: ['main', 'fallback', 'batch'],
        report: ['main', 'fallback'],
        small: ['fast', 'main'],
    };
    const fallbacks = fallbackMap[tier] || [];
    for (const t of fallbacks) {
        candidates.push(tierToConfig(t));
    }

    for (const cfg of candidates) {
        try {
            const result = await sendToProvider(cfg, tier, system, user);
            recordCircuitSuccess(tier);
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

export function clearCache(): void {
    cache.clear();
}
