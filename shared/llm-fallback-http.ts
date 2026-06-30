/**
 * LLM fallback HTTP layer — payload builders, fetch with retry, Retry-After
 * parsing, and per-provider send logic with circuit-breaker integration.
 *
 * Extracted from llm-fallback.ts (F35 debt attack plan).
 * Depends on: llm-fallback-config, llm-rate-limiter, llm-cache, circuit-breaker.
 */
import { jitter } from './llm-rate-limiter.js';
import { configUniqueKey } from './llm-cache.js';
import { checkCircuitBreaker } from './circuit-breaker.js';
import { recordModelLatency } from './llm-metrics.js';
import { rootLogger } from './logger.js';
import { sanitizeForLlm } from './sanitize.js';
import { z } from 'zod';
import { LlmError, LlmProviderError, LlmAuthError } from './errors.js';
import type { LlmTier, ResponseFormat } from './types.js';
import {
    ProviderConfig,
    LLM_TEMP_DEFAULT,
    LLM_RETRY_BASE_WAIT_MS,
    LLM_RETRY_MAX_WAIT_MS,
    LLM_FETCH_TIMEOUT_MS,
    LLM_ERROR_BODY_TRUNCATION,
    getFetchRetries,
    _trackUsage,
    extractContent,
    LlmErrorPayloadSchema,
} from './llm-fallback-config.js';

// ---- payload builders ----

export function buildOpenAiPayload(
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
        payload['response_format'] = { type: 'json_object' };
    }
    return JSON.stringify(payload);
}

export function buildGeminiPayload(system: string, user: string): string {
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

export function buildAnthropicPayload(
    system: string,
    user: string,
    model: string,
    temperature?: number,
    responseFormat?: ResponseFormat,
): string {
    const payload: Record<string, unknown> = {
        model,
        max_tokens: 4096,
        temperature: temperature ?? LLM_TEMP_DEFAULT,
        messages: [{ role: 'user', content: user }],
    };
    if (system) {
        payload['system'] = system;
    }
    if (responseFormat === 'json') {
        payload['metadata'] = { response_format: 'json' };
    }
    return JSON.stringify(payload);
}

const RawRecordSchema = z.record(z.string(), z.unknown());

export function parseRawOnce(raw: string): Record<string, unknown> | null {
    try {
        const parsed: unknown = JSON.parse(raw);
        return RawRecordSchema.parse(parsed);
    } catch (err) {
        rootLogger.debug(
            'llm-fallback-http: failed to parse raw record: ' + (err instanceof Error ? err.message : String(err)),
        );
        return null;
    }
}

// ---- HTTP ----

export async function fetchWithRetry(
    url: string,
    options: RequestInit,
    retries = getFetchRetries(),
): Promise<Response> {
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
        const body = await resp.text().catch(() => {
            rootLogger.debug(
                'Failed to read HTTP response body on status ' + resp.status + ' — propagating primary error',
            );
            return '';
        });
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

function stripTrailingSlashes(s: string): string {
    let end = s.length;
    while (end > 0 && s.charCodeAt(end - 1) === 47) end--;
    return s.slice(0, end);
}

function buildProviderHeaders(cfg: ProviderConfig): Record<string, string> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (cfg.format === 'gemini') {
        headers['X-Goog-Api-Key'] = cfg.apiKey;
    } else if (cfg.format === 'anthropic') {
        headers['x-api-key'] = cfg.apiKey;
        headers['anthropic-version'] = '2023-06-01';
    } else {
        headers['Authorization'] = 'Bearer ' + cfg.apiKey;
    }
    return headers;
}

export async function sendToProvider(
    cfg: ProviderConfig,
    system: string,
    user: string,
    tier?: LlmTier,
): Promise<string> {
    checkCircuitBreaker(configUniqueKey(cfg));
    if (!cfg.apiKey) throw new LlmAuthError('API key missing for tier');

    const baseUrl = stripTrailingSlashes(cfg.baseUrl);
    let url: string;
    if (cfg.format === 'gemini') {
        url = cfg.baseUrl + '/models/' + cfg.model + ':generateContent';
    } else if (cfg.format === 'anthropic') {
        url = baseUrl + '/messages';
    } else {
        url = baseUrl + '/chat/completions';
    }

    let payload: string;
    if (cfg.format === 'gemini') {
        payload = buildGeminiPayload(system, user);
    } else if (cfg.format === 'anthropic') {
        payload = buildAnthropicPayload(system, user, cfg.model, cfg.temperature, cfg.responseFormat);
    } else {
        payload = buildOpenAiPayload(system, user, cfg.model, cfg.temperature, cfg.responseFormat);
    }

    const headers = buildProviderHeaders(cfg);

    const start = performance.now();
    const resp = await fetchWithRetry(url, { method: 'POST', headers, body: payload });
    const raw = await resp.text();
    const elapsed = Math.round(performance.now() - start);

    recordModelLatency(cfg.model, elapsed);

    const data = parseRawOnce(raw);
    if (!data) {
        rootLogger.warn('LLM provider returned non-JSON response on 200 OK (raw length: ' + raw.length + ')');
        return '';
    }

    const errPayload = data['error'];
    if (errPayload !== undefined) {
        if (typeof errPayload === 'string') throw new LlmProviderError('LLM API error: ' + errPayload);
        const errResult = LlmErrorPayloadSchema.safeParse(errPayload);
        if (errResult.success) {
            throw new LlmProviderError('LLM API error: ' + (errResult.data.message ?? JSON.stringify(errResult.data)));
        }
        throw new LlmProviderError('LLM API error: ' + JSON.stringify(errPayload));
    }

    _trackUsage(data, configUniqueKey(cfg), tier ?? 'main');
    return extractContent(data, cfg.format);
}
