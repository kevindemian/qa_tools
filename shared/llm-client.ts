import crypto from 'crypto';
import Config from './config';
import { rootLogger } from './logger';

export type LlmTier = 'main' | 'small' | 'fast' | 'reviewer' | 'fallback' | 'batch';
type ProviderFormat = 'openai' | 'gemini';

interface ProviderConfig {
    apiKey: string;
    model: string;
    baseUrl: string;
    format: ProviderFormat;
}

interface CacheEntry {
    response: string;
    expiresAt: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, CacheEntry>();

function tierToConfig(tier: LlmTier): ProviderConfig {
    switch (tier) {
        case 'main':
            return { apiKey: Config.llmApiKey, model: Config.llmModel, baseUrl: Config.llmBaseUrl, format: 'openai' };
        case 'small':
        case 'fast':
            return {
                apiKey: Config.llmFastApiKey,
                model: Config.llmFastModel,
                baseUrl: Config.llmFastBaseUrl,
                format: 'openai',
            };
        case 'reviewer':
            return {
                apiKey: Config.llmReviewApiKey || Config.llmSmallApiKey,
                model: Config.llmReviewModel || Config.llmSmallModel,
                baseUrl: Config.llmReviewBaseUrl || 'https://generativelanguage.googleapis.com/v1beta',
                format: 'gemini',
            };
        case 'fallback':
            return {
                apiKey: Config.llmFallbackApiKey,
                model: Config.llmFallbackModel,
                baseUrl: Config.llmFallbackBaseUrl,
                format: 'openai',
            };
        case 'batch':
            return {
                apiKey: Config.llmBatchApiKey,
                model: Config.llmBatchModel,
                baseUrl: Config.llmBatchBaseUrl,
                format: 'openai',
            };
    }
}

function tierOrder(): LlmTier[] {
    return ['main', 'fallback', 'batch'];
}

function cacheKey(tier: LlmTier, system: string, user: string): string {
    return crypto
        .createHash('sha256')
        .update(tier + '|' + system + '|' + user)
        .digest('hex');
}

function buildOpenAiPayload(system: string, user: string, model: string): string {
    return JSON.stringify({
        model,
        messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
        ],
    });
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

async function fetchWithRetry(url: string, options: RequestInit, retries = 3): Promise<Response> {
    for (let attempt = 1; attempt <= retries; attempt++) {
        let resp: Response;
        try {
            resp = await fetch(url, options);
        } catch (err) {
            if (attempt < retries) {
                const wait = Math.min(2000 * Math.pow(2, attempt - 1), 10000);
                rootLogger.warn('LLM fetch error, retrying in ' + wait + 'ms: ' + (err as Error).message);
                await new Promise((resolve) => setTimeout(resolve, wait));
                continue;
            }
            throw err;
        }
        if (resp.ok) return resp;
        if (resp.status === 429 || resp.status >= 500) {
            if (attempt < retries) {
                const wait = Math.min(2000 * Math.pow(2, attempt - 1), 10000);
                rootLogger.warn('LLM HTTP ' + resp.status + ', retrying in ' + wait + 'ms');
                await new Promise((resolve) => setTimeout(resolve, wait));
                continue;
            }
        }
        const body = await resp.text().catch(() => '');
        throw new Error('LLM API error: HTTP ' + resp.status + ' ' + body.slice(0, 200));
    }
    throw new Error('LLM max retries exceeded');
}

async function sendToProvider(cfg: ProviderConfig, system: string, user: string): Promise<string> {
    if (!cfg.apiKey) throw new Error('API key missing for tier');

    if (cfg.format === 'gemini') {
        const payload = buildGeminiPayload(system, user);
        const url = cfg.baseUrl + '/models/' + cfg.model + ':generateContent?key=' + cfg.apiKey;
        const resp = await fetchWithRetry(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: payload,
        });
        const raw = await resp.text();
        return parseGeminiResponse(raw);
    }

    const payload = buildOpenAiPayload(system, user, cfg.model);
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
    const primary = tierToConfig(tier);
    const errors: string[] = [];

    const candidates: ProviderConfig[] = [primary];

    // Add fallback chain only for main tier (analysis)
    if (tier === 'main') {
        const fallbackOrder = tierOrder();
        for (const t of fallbackOrder) {
            if (t === tier) continue;
            candidates.push(tierToConfig(t));
        }
    }

    for (const cfg of candidates) {
        try {
            return await sendToProvider(cfg, system, user);
        } catch (err) {
            const msg = (err as Error).message;
            errors.push(cfg.model + '@' + cfg.baseUrl + ': ' + msg);
            rootLogger.warn('LLM provider failed: ' + msg + ' — trying next');
        }
    }

    throw new Error('All LLM providers failed: ' + errors.join('; '));
}

export async function llmPrompt(tier: LlmTier, system: string, user: string): Promise<string> {
    const cKey = cacheKey(tier, system, user);
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
