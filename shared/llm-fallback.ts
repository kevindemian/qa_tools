/**
 * LLM provider fallback chain — tier configs, per-provider HTTP calls,
 * retry logic, circuit-breaker integration, and usage metrics.
 *
 * Extracted from llm-client.ts (F35 debt attack plan).
 * Depends on: llm-rate-limiter, llm-cache, circuit-breaker.
 * No dependency back to llm-client.ts.
 */
import { jitter, checkRateLimit } from './llm-rate-limiter';
import { configUniqueKey } from './llm-cache';
import { checkCircuitBreaker, recordCircuitFailure, recordCircuitSuccess } from './circuit-breaker';
import Config from './config';
import { rootLogger } from './logger';
import { sanitizeForLlm } from './sanitize';
import { z } from 'zod';
import { LlmError, LlmProviderError, LlmAuthError } from './errors';
import type { LlmTier, ResponseFormat } from './types';

// ---- types ----

type ProviderFormat = 'openai' | 'gemini';

interface ProviderConfig {
    apiKey: string;
    model: string;
    baseUrl: string;
    format: ProviderFormat;
    temperature: number;
    responseFormat?: ResponseFormat;
}

/** Zod schema for OpenAI-compatible token usage object. */
const LlmUsageSchema = z.object({
    prompt_tokens: z.number().int().nonnegative().optional(),
    completion_tokens: z.number().int().nonnegative().optional(),
    total_tokens: z.number().int().nonnegative().optional(),
});

/** Zod schema for Gemini-compatible usage metadata. */
const LlmUsageMetaSchema = z.object({
    promptTokenCount: z.number().int().nonnegative().optional(),
    candidatesTokenCount: z.number().int().nonnegative().optional(),
    totalTokenCount: z.number().int().nonnegative().optional(),
});

/** Zod schema for a Gemini candidate in the response. */
const LlmCandidateSchema = z.object({
    content: z
        .object({
            parts: z.array(z.object({ text: z.string().optional() })).optional(),
        })
        .optional(),
});

/** Zod schema for an OpenAI choice in the response. */
const LlmChoiceSchema = z.object({
    message: z
        .object({
            content: z.string().optional(),
        })
        .optional(),
});

/** Zod schema for an error payload returned by an LLM provider. */
const LlmErrorPayloadSchema = z.object({
    message: z.string().optional(),
    type: z.string().optional(),
    code: z.string().optional(),
});

// ---- constants ----

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

// ---- metrics (shared with llm-client.ts) ----

export interface LlmClientMetrics {
    cacheHits: number;
    cacheMisses: number;
    totalPromptTokens: number;
    totalCompletionTokens: number;
    requestsByProviderKey: Record<string, number>;
}

export const _llmMetrics: LlmClientMetrics = {
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
    const usageResult = LlmUsageSchema.safeParse(data.usage);
    if (usageResult.success) {
        promptTokens = usageResult.data.prompt_tokens || 0;
        completionTokens = usageResult.data.completion_tokens || 0;
    } else {
        const metaResult = LlmUsageMetaSchema.safeParse(data.usageMetadata);
        if (metaResult.success) {
            promptTokens = metaResult.data.promptTokenCount || 0;
            completionTokens = metaResult.data.candidatesTokenCount || 0;
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
        const result = z.array(LlmCandidateSchema).safeParse(data.candidates);
        return result.success ? result.data[0]?.content?.parts?.[0]?.text || '' : '';
    }
    const result = z.array(LlmChoiceSchema).safeParse(data.choices);
    return result.success ? result.data[0]?.message?.content || '' : '';
}

export function getLlmClientMetrics(): LlmClientMetrics {
    return _llmMetrics;
}

export function resetLlmClientMetrics(): void {
    _llmMetrics.cacheHits = 0;
    _llmMetrics.cacheMisses = 0;
    _llmMetrics.totalPromptTokens = 0;
    _llmMetrics.totalCompletionTokens = 0;
    _llmMetrics.requestsByProviderKey = {};
}

// ---- configuration ----

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

export function tierToConfig(tier: LlmTier): ProviderConfig {
    const factory = TIER_CONFIGS[tier];
    return factory ? factory() : TIER_CONFIGS.main();
}

// ---- payload builders ----

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

export function parseRawOnce(raw: string): Record<string, unknown> | null {
    try {
        return JSON.parse(raw) as Record<string, unknown>;
    } catch {
        return null;
    }
}

// ---- HTTP ----

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

/** @internal exported for testing */
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

    const errPayload = data.error;
    if (errPayload !== undefined) {
        if (typeof errPayload === 'string') throw new LlmProviderError('LLM API error: ' + errPayload);
        const errResult = LlmErrorPayloadSchema.safeParse(errPayload);
        if (errResult.success) {
            throw new LlmProviderError('LLM API error: ' + (errResult.data.message ?? JSON.stringify(errResult.data)));
        }
        throw new LlmProviderError('LLM API error: ' + JSON.stringify(errPayload));
    }

    _trackUsage(data, configUniqueKey(cfg));
    return extractContent(data, cfg.format);
}

export async function sendWithFallback(
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
