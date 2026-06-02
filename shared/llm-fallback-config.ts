/**
 * LLM fallback configuration — types, Zod schemas, constants, tier configs,
 * and usage metrics.
 *
 * Extracted from llm-fallback.ts (F35 debt attack plan).
 * No dependency on HTTP, rate-limiter, or circuit-breaker modules.
 */
import Config from './config';
import { rootLogger } from './logger';
import { z } from 'zod';
import type { LlmTier, ResponseFormat } from './types';

// ---- types ----

export type ProviderFormat = 'openai' | 'gemini';

export interface ProviderConfig {
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
export const LlmErrorPayloadSchema = z.object({
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
export const LLM_TEMP_DEFAULT = 0.3;

export function getFetchRetries(): number {
    const val = Config.get('LLM_FETCH_RETRIES');
    return val ? parseInt(val, 10) : 3;
}

export const LLM_RETRY_BASE_WAIT_MS = 2000;
export const LLM_RETRY_MAX_WAIT_MS = 10000;
export const LLM_FETCH_TIMEOUT_MS = 30000;
export const LLM_ERROR_BODY_TRUNCATION = 200;

// ---- pricing tables (USD per 1K tokens) ----

interface ModelPricing {
    inputPer1K: number;
    outputPer1K: number;
}

const MODEL_PRICING: Record<string, ModelPricing> = {
    'google/gemini-2.0-flash-exp': { inputPer1K: 0.0001, outputPer1K: 0.0004 },
    'gemini-2.0-flash-exp': { inputPer1K: 0.0001, outputPer1K: 0.0004 },
    'gemini-2.0-flash-lite': { inputPer1K: 0.000075, outputPer1K: 0.0003 },
    'llama-3.1-8b-instant': { inputPer1K: 0.00005, outputPer1K: 0.00008 },
    'gpt-4o-mini': { inputPer1K: 0.00015, outputPer1K: 0.0006 },
    'meta/llama3-70b-instruct': { inputPer1K: 0.0009, outputPer1K: 0.0009 },
};

export function estimateCostUSD(model: string, promptTokens: number, completionTokens: number): number {
    const pricing = MODEL_PRICING[model] ?? MODEL_PRICING['google/gemini-2.0-flash-exp'];
    if (!pricing) return 0;
    return (promptTokens / 1000) * pricing.inputPer1K + (completionTokens / 1000) * pricing.outputPer1K;
}

export function getModelPricing(model: string): ModelPricing | undefined {
    return MODEL_PRICING[model];
}

export function hasPricingForModel(model: string): boolean {
    return model in MODEL_PRICING;
}

// ---- metrics (shared with llm-client.ts) ----

export interface LlmClientMetrics {
    cacheHits: number;
    cacheMisses: number;
    totalPromptTokens: number;
    totalCompletionTokens: number;
    requestsByProviderKey: Record<string, number>;
    totalCostUSD: number;
    costPerTier: Partial<Record<LlmTier, number>>;
}

export const _llmMetrics: LlmClientMetrics = {
    cacheHits: 0,
    cacheMisses: 0,
    totalPromptTokens: 0,
    totalCompletionTokens: 0,
    requestsByProviderKey: {},
    totalCostUSD: 0,
    costPerTier: {},
};

export function _trackUsage(data: Record<string, unknown>, providerKey: string, tier: LlmTier): void {
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

    // Track cost in USD
    const model = tierToConfig(tier).model;
    const cost = estimateCostUSD(model, promptTokens, completionTokens);
    _llmMetrics.totalCostUSD += cost;
    _llmMetrics.costPerTier[tier] = (_llmMetrics.costPerTier[tier] || 0) + cost;

    rootLogger.debug(
        'Token usage: prompt=' +
            promptTokens +
            ' completion=' +
            completionTokens +
            ' provider=' +
            providerKey +
            ' cost=$' +
            cost.toFixed(6),
    );
}

export function extractContent(data: Record<string, unknown>, format: ProviderFormat): string {
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
    _llmMetrics.totalCostUSD = 0;
    _llmMetrics.costPerTier = {};
}

// ---- tier configuration ----

const TIER_CONFIGS: Record<LlmTier, () => ProviderConfig> = {
    main: () => ({
        apiKey: Config.get('llmApiKey'),
        model: Config.get('llmModel'),
        baseUrl: Config.get('llmBaseUrl'),
        format: 'openai',
        temperature: LLM_TEMP_MAIN,
    }),
    fast: () => ({
        apiKey: Config.get('llmFastApiKey'),
        model: Config.get('llmFastModel'),
        baseUrl: Config.get('llmFastBaseUrl'),
        format: 'openai',
        temperature: LLM_TEMP_MAIN,
    }),
    reviewer: () => ({
        apiKey: Config.get('llmReviewApiKey') || Config.get('llmSmallApiKey'),
        model: Config.get('llmReviewModel') || Config.get('llmSmallModel'),
        baseUrl: Config.get('llmReviewBaseUrl') || 'https://generativelanguage.googleapis.com/v1beta',
        format: 'gemini',
        temperature: LLM_TEMP_REVIEWER,
    }),
    report: () => ({
        apiKey: Config.get('llmApiKey'),
        model: Config.get('llmModel'),
        baseUrl: Config.get('llmBaseUrl'),
        format: 'openai',
        temperature: LLM_TEMP_REPORT,
        responseFormat: 'json',
    }),
    fallback: () => ({
        apiKey: Config.get('llmFallbackApiKey'),
        model: Config.get('llmFallbackModel'),
        baseUrl: Config.get('llmFallbackBaseUrl'),
        format: 'openai',
        temperature: LLM_TEMP_FALLBACK,
    }),
    batch: () => ({
        apiKey: Config.get('llmBatchApiKey'),
        model: Config.get('llmBatchModel'),
        baseUrl: Config.get('llmBatchBaseUrl'),
        format: 'openai',
        temperature: LLM_TEMP_BATCH,
    }),
};

export function tierToConfig(tier: LlmTier): ProviderConfig {
    const factory = TIER_CONFIGS[tier];
    return factory ? factory() : TIER_CONFIGS.main();
}
