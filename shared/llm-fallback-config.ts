/**
 * LLM fallback configuration — types, Zod schemas, constants, tier configs,
 * and usage metrics.
 *
 * tierToConfig now resolves config in two layers:
 * 1. Explicit LLM_{TIER}_API_KEY env vars (existing, backward compatible)
 * 2. LLM_PROVIDER → provider profile → auto-fill baseUrl/format/model per tier
 *
 * This allows users to set just LLM_PROVIDER + LLM_API_KEY and get all
 * 6 tiers configured automatically.
 */
import Config from './config.js';
import { rootLogger } from './logger.js';
import { z } from 'zod';
import type { LlmTier, ResponseFormat } from './types.js';
import { getProviderProfile, inferProviderFromKey, isKnownProvider } from './llm-provider-profiles.js';
import type { LlmProvider } from './llm-provider-profiles.js';
import { resolveModel } from './model-resolver.js';
import type { ProviderFormat } from './llm-provider-profiles.js';

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
    const pricingEntries = Object.entries(MODEL_PRICING);
    const entry = pricingEntries.find(([k]) => k === model) ?? pricingEntries.find(([k]) => k === 'google/gemini-2.0-flash-exp');
    const pricing = entry?.[1];
    if (!pricing) return 0;
    return (promptTokens / 1000) * pricing.inputPer1K + (completionTokens / 1000) * pricing.outputPer1K;
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
    const providerEntries = Object.entries(_llmMetrics.requestsByProviderKey);
    const existingProviderEntry = providerEntries.find(([k]) => k === providerKey);
    const existingProvider = existingProviderEntry?.[1] ?? 0;
    const newProviderEntries = providerEntries.filter(([k]) => k !== providerKey);
    newProviderEntries.push([providerKey, existingProvider + 1]);
    _llmMetrics.requestsByProviderKey = Object.fromEntries(newProviderEntries);
    let promptTokens = 0;
    let completionTokens = 0;
    const dataEntries = Object.entries(data);
    const usageEntry = dataEntries.find(([k]) => k === 'usage');
    const usageResult = LlmUsageSchema.safeParse(usageEntry?.[1]);
    if (usageResult.success) {
        promptTokens = usageResult.data.prompt_tokens || 0;
        completionTokens = usageResult.data.completion_tokens || 0;
    } else {
        const metaEntry = dataEntries.find(([k]) => k === 'usageMetadata');
        const metaResult = LlmUsageMetaSchema.safeParse(metaEntry?.[1]);
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
    const tierEntries = Object.entries(_llmMetrics.costPerTier);
    const existingTierEntry = tierEntries.find(([k]) => k === tier);
    const existingTier = existingTierEntry?.[1] ?? 0;
    const newTierEntries = tierEntries.filter(([k]) => k !== tier);
    newTierEntries.push([tier, existingTier + cost]);
    _llmMetrics.costPerTier = Object.fromEntries(newTierEntries);

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

const LlmAnthropicContentSchema = z.object({
    type: z.string(),
    text: z.string().optional(),
});

export function extractContent(data: Record<string, unknown>, format: ProviderFormat): string {
    const dataEntries = Object.entries(data);
    if (format === 'gemini') {
        const candidatesEntry = dataEntries.find(([k]) => k === 'candidates');
        const result = z.array(LlmCandidateSchema).safeParse(candidatesEntry?.[1]);
        return result.success ? result.data[0]?.content?.parts?.[0]?.text || '' : '';
    }
    if (format === 'anthropic') {
        const contentEntry = dataEntries.find(([k]) => k === 'content');
        const result = z.array(LlmAnthropicContentSchema).safeParse(contentEntry?.[1]);
        return result.success ? result.data.map((c) => c.text ?? '').join('') : '';
    }
    const choicesEntry = dataEntries.find(([k]) => k === 'choices');
    const result = z.array(LlmChoiceSchema).safeParse(choicesEntry?.[1]);
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

/** Temperature values per tier. */
const TIER_TEMPS = new Map<LlmTier, number>([
    ['main', LLM_TEMP_MAIN],
    ['fast', LLM_TEMP_MAIN],
    ['reviewer', LLM_TEMP_REVIEWER],
    ['report', LLM_TEMP_REPORT],
    ['fallback', LLM_TEMP_FALLBACK],
    ['batch', LLM_TEMP_BATCH],
]);

/** Config key prefix for a given tier. */
function tierPrefix(tier: LlmTier): string {
    if (tier === 'reviewer') return 'llmReview';
    if (tier === 'main' || tier === 'report') return 'llm';
    return 'llm' + tier.charAt(0).toUpperCase() + tier.slice(1);
}

/** Get tier-specific Config key: e.g. tierKey('fast', 'ApiKey') → 'llmFastApiKey'. */
function tierKey(tier: LlmTier, prop: string): string {
    return tierPrefix(tier) + prop;
}

/**
 * Build a ProviderConfig from explicit tier-specific env vars.
 * Used when the user has set LLM_{TIER}_API_KEY (fast, reviewer, fallback, batch).
 * Main and report tiers always resolve through the provider profile path
 * since they share LLM_API_KEY.
 */
function configFromExplicit(tier: LlmTier): ProviderConfig | null {
    if (tier === 'main' || tier === 'report') return null;
    const apiKey = Config.get(tierKey(tier, 'ApiKey'));
    if (!apiKey) return null;
    const temp = TIER_TEMPS.get(tier) ?? 0;
    const model = Config.get(tierKey(tier, 'Model'));
    const baseUrl = Config.get(tierKey(tier, 'BaseUrl'));
    return {
        apiKey,
        model,
        baseUrl,
        format: tier === 'reviewer' ? 'gemini' : 'openai',
        temperature: temp,
    };
}

/**
 * Resolve provider ID with fallback chain:
 * 1. LLM_PROVIDER env var
 * 2. Auto-detect from LLM_API_KEY pattern
 * 3. Default to opencode-go
 */
function resolveProvider(): LlmProvider {
    const explicit = Config.get('llmProvider');
    if (explicit && isKnownProvider(explicit)) return explicit;
    const mainKey = Config.get('llmApiKey');
    if (mainKey) {
        const detected = inferProviderFromKey(mainKey);
        if (detected) return detected;
    }
    return 'opencode-go';
}

/**
 * Resolve LLM provider config for a given tier.
 *
 * Resolution order:
 * 1. Explicit LLM_{TIER}_API_KEY env var (backward compatible)
 * 2. LLM_PROVIDER → provider profile → auto-fill baseUrl/format/model
 * 3. Fallback: main-like config with whatever keys are available
 */
export function tierToConfig(tier: LlmTier): ProviderConfig {
    const temp = TIER_TEMPS.get(tier) ?? 0;

    // 1. Explicit tier-specific config
    const explicit = configFromExplicit(tier);
    if (explicit) return explicit;

    // 2. Provider profile resolution
    const provider = resolveProvider();
    const profile = getProviderProfile(provider);
    if (profile) {
        const apiKey = Config.get('llmApiKey');
        const explicitModel = Config.get('llmModel') || Config.get(tierKey(tier, 'Model'));
        const explicitBaseUrl = Config.get('llmBaseUrl') || Config.get(tierKey(tier, 'BaseUrl'));
        let tierDefault = profile.tiers.main;
        switch (tier) {
            case 'main': tierDefault = profile.tiers.main; break;
            case 'fast': tierDefault = profile.tiers.fast; break;
            case 'reviewer': tierDefault = profile.tiers.reviewer; break;
            case 'report': tierDefault = profile.tiers.report; break;
            case 'fallback': tierDefault = profile.tiers.fallback; break;
            case 'batch': tierDefault = profile.tiers.batch; break;
        }
        const model = explicitModel || resolveModel(tier, provider).id || tierDefault;
        return {
            apiKey,
            model,
            baseUrl: explicitBaseUrl || profile.baseUrl,
            format: profile.format,
            temperature: temp,
            ...(tier === 'report' ? { responseFormat: 'json' as const } : {}),
        };
    }

    // 3. Fallback: empty config (should not happen with valid provider)
    return { apiKey: '', model: '', baseUrl: '', format: 'openai', temperature: temp };
}
