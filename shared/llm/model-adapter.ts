/**
 * model-adapter.ts — Provider-specific API response adapters.
 *
 * Each provider exposes GET /v1/models (or /models) with a different
 * response schema. This module provides a normalized ModelAdapter interface
 * and concrete implementations for every known provider.
 *
 * Adapters parse raw API responses into a canonical RawModelEntry format
 * (id + optional context + optional capabilities). Metadata that the
 * provider's API does not return (e.g., pricing) comes from the registry.
 *
 * Supported providers:
 *   - OpenAI (IDs only — no context in API response)
 *   - Anthropic (max_input_tokens + capabilities)
 *   - Gemini (inputTokenLimit, name prefixed with "models/")
 *   - OpenRouter (context_length + supported_parameters)
 *   - Groq (IDs only — OpenAI-compatible format)
 *   - GitHub Models (IDs only — OpenAI-compatible)
 *   - NVIDIA NIM (IDs only — OpenAI-compatible)
 */
import type { LlmProvider } from './llm-provider-profiles.js';

/**
 * Canonical model entry extracted from a provider API response.
 */
export interface RawModelEntry {
    id: string;
    context?: number;
    capabilities?: string[];
}

/**
 * Provider API response adapter.
 * Each provider implements parseListResponse to translate its
 * native JSON structure into RawModelEntry[].
 */
export interface ModelAdapter {
    name: string;
    parseListResponse(raw: unknown): RawModelEntry[];
}

function safeEntry(id: string, context?: number, capabilities?: string[]): RawModelEntry {
    const entry: RawModelEntry = { id };
    if (context !== undefined) entry.context = context;
    if (capabilities !== undefined && capabilities.length > 0) entry.capabilities = capabilities;
    return entry;
}

function arr<T>(raw: Record<string, unknown>, key: string): T[] | null {
    const entries = Object.entries(raw);
    const entry = entries.find(([k]) => k === key);
    const val = entry?.[1];
    return Array.isArray(val) ? (val as T[]) : null;
}

/**
 * Strip OpenRouter prefix from model IDs.
 * "openai/gpt-4o" → "gpt-4o"
 * "google/gemini-2.0-flash" → "gemini-2.0-flash"
 * "anthropic/claude-sonnet-4-20250514" → "claude-sonnet-4-20250514"
 */
function stripOpenRouterPrefix(id: string): string {
    const slashIndex = id.indexOf('/');
    if (slashIndex === -1) return id;
    return id.slice(slashIndex + 1);
}

/**
 * Parse OpenRouter supported_parameters and architecture into
 * canonical capability strings.
 */
function openRouterCapabilities(raw: Record<string, unknown>): string[] {
    const caps: string[] = [];

    const params = arr<string>(raw, 'supported_parameters');
    if (params) {
        if (params.includes('tools')) caps.push('function_calling');
        if (params.includes('structured_outputs')) caps.push('structured_outputs');
        if (params.includes('vision')) caps.push('vision');
    }

    const arch = raw['architecture'] as Record<string, unknown> | undefined;
    if (arch) {
        const modalities = arr<string>(arch, 'input_modalities');
        if (modalities && modalities.includes('image') && !caps.includes('vision')) {
            caps.push('vision');
        }
    }

    return caps;
}

/**
 * Parse Anthropic capabilities object into canonical capability strings.
 */
function anthropicCapabilities(raw: Record<string, unknown>): string[] {
    const caps: string[] = [];
    const capObj = raw['capabilities'] as Record<string, unknown> | undefined;
    if (!capObj) return caps;

    const tools = capObj['tools'] as Record<string, unknown> | undefined;
    if (tools?.['supported'] === true) caps.push('function_calling');

    const structured = capObj['structured_outputs'] as Record<string, unknown> | undefined;
    if (structured?.['supported'] === true) caps.push('structured_outputs');

    const vision = capObj['image_input'] as Record<string, unknown> | undefined;
    if (vision?.['supported'] === true) caps.push('vision');

    return caps;
}

/**
 * Extract string ID from a raw model entry, or null if missing/invalid.
 */
function extractId(raw: Record<string, unknown>): string | null {
    const id = raw['id'];
    return typeof id === 'string' ? id : null;
}

function extractNumber(raw: Record<string, unknown>, key: string): number | undefined {
    const entries = Object.entries(raw);
    const entry = entries.find(([k]) => k === key);
    const val = entry?.[1];
    return typeof val === 'number' ? val : undefined;
}

// ─── Provider Adapters ──────────────────────────────────────────

/**
 * OpenAI adapter — IDs only.
 * GET /v1/models returns { data: [{ id, object, created, owned_by }] }
 * with no context or pricing metadata.
 */
const openaiAdapter: ModelAdapter = {
    name: 'openai',
    parseListResponse(raw: unknown): RawModelEntry[] {
        const root = raw as Record<string, unknown> | undefined;
        const data = arr<Record<string, unknown>>(root ?? {}, 'data');
        if (!data) return [];
        const result: RawModelEntry[] = [];
        for (const entry of data) {
            const id = extractId(entry);
            if (id) result.push(safeEntry(id));
        }
        return result;
    },
};

/**
 * Anthropic adapter — ID + context (max_input_tokens) + capabilities.
 * GET /v1/models returns { data: [{ id, display_name, max_input_tokens,
 *   capabilities: { tools: { supported: bool }, ... } }] }
 *
 * @see https://docs.anthropic.com/en/api/models-list
 */
const anthropicAdapter: ModelAdapter = {
    name: 'anthropic',
    parseListResponse(raw: unknown): RawModelEntry[] {
        const root = raw as Record<string, unknown> | undefined;
        const data = arr<Record<string, unknown>>(root ?? {}, 'data');
        if (!data) return [];
        const result: RawModelEntry[] = [];
        for (const entry of data) {
            const id = extractId(entry);
            if (!id) continue;
            const context = extractNumber(entry, 'max_input_tokens');
            const capabilities = anthropicCapabilities(entry);
            result.push(safeEntry(id, context, capabilities.length > 0 ? capabilities : undefined));
        }
        return result;
    },
};

/**
 * Gemini adapter — ID (strip "models/" prefix) + context (inputTokenLimit).
 * GET /models returns { models: [{ name: "models/gemini-...", inputTokenLimit,
 *   outputTokenLimit, supportedGenerationMethods }] }
 *
 * @see https://ai.google.dev/api/models
 */
const geminiAdapter: ModelAdapter = {
    name: 'gemini',
    parseListResponse(raw: unknown): RawModelEntry[] {
        const root = raw as Record<string, unknown> | undefined;
        const models = arr<Record<string, unknown>>(root ?? {}, 'models');
        if (!models) return [];
        const result: RawModelEntry[] = [];
        for (const entry of models) {
            const name = entry['name'];
            if (typeof name !== 'string') continue;
            const id = name.startsWith('models/') ? name.slice(7) : name;
            const context = extractNumber(entry, 'inputTokenLimit');
            const methods = arr<string>(entry, 'supportedGenerationMethods');
            const caps: string[] = [];
            if (methods && methods.includes('generateContent')) caps.push('chat');
            result.push(safeEntry(id, context, caps.length > 0 ? caps : undefined));
        }
        return result;
    },
};

/**
 * OpenRouter adapter — full metadata (context + capabilities).
 * GET /v1/models returns { data: [{ id: "provider/model", context_length: number,
 *   supported_parameters: string[], architecture: { input_modalities: string[] } }] }
 * Does NOT require API key.
 *
 * @see https://openrouter.ai/docs/api/api-reference/models/get-models
 */
const openrouterAdapter: ModelAdapter = {
    name: 'openrouter',
    parseListResponse(raw: unknown): RawModelEntry[] {
        const root = raw as Record<string, unknown> | undefined;
        const data = arr<Record<string, unknown>>(root ?? {}, 'data');
        if (!data) return [];
        const result: RawModelEntry[] = [];
        for (const entry of data) {
            const rawId = extractId(entry);
            if (!rawId) continue;
            const id = stripOpenRouterPrefix(rawId);
            const context = extractNumber(entry, 'context_length');
            const capabilities = openRouterCapabilities(entry);
            result.push(safeEntry(id, context, capabilities.length > 0 ? capabilities : undefined));
        }
        return result;
    },
};

/**
 * Generic OpenAI-compatible adapter (for Groq, GitHub Models, NVIDIA NIM, custom).
 * GET /v1/models returns { data: [{ id, object, created }] }
 * No context or pricing metadata.
 */
function createOpenAICompatibleAdapter(name: string): ModelAdapter {
    return {
        name,
        parseListResponse(raw: unknown): RawModelEntry[] {
            const root = raw as Record<string, unknown> | undefined;
            const data = arr<Record<string, unknown>>(root ?? {}, 'data');
            if (!data) return [];
            const result: RawModelEntry[] = [];
            for (const entry of data) {
                const id = extractId(entry);
                if (id) result.push(safeEntry(id));
            }
            return result;
        },
    };
}

// ─── Adapter Registry ───────────────────────────────────────────

const ADAPTERS: Record<string, ModelAdapter> = {
    openai: openaiAdapter,
    anthropic: anthropicAdapter,
    gemini: geminiAdapter,
    openrouter: openrouterAdapter,
    groq: createOpenAICompatibleAdapter('groq'),
    'github-models': createOpenAICompatibleAdapter('github-models'),
    'nvidia-nim': createOpenAICompatibleAdapter('nvidia-nim'),
    custom: createOpenAICompatibleAdapter('custom'),
};

/**
 * Get the adapter for a given provider.
 * Returns null if no adapter is registered for the provider.
 */
export function getAdapter(provider: LlmProvider): ModelAdapter | null {
    const entries = Object.entries(ADAPTERS);
    const entry = entries.find(([k]) => k === provider);
    return entry?.[1] ?? null;
}

/**
 * Get all registered adapter names.
 */
export function getRegisteredAdapters(): string[] {
    return Object.keys(ADAPTERS);
}
