/**
 * llm-provider-profiles.ts — LLM provider registry.
 *
 * Single source of truth for provider metadata: base URLs, API formats,
 * default models per tier, key patterns, and documentation links.
 *
 * The profile system allows:
 * - Auto-detection of provider from API key pattern
 * - Auto-configuration of all 6 LLM tiers from a single provider selection
 * - Per-tier override via existing LLM_{TIER}_* env vars (backward compatible)
 * - Centralised validation of provider names
 *
 * ProviderFormat is extended from llm-fallback-config.ts to include 'anthropic'.
 */

// ---- types ----

export type ProviderFormat = 'openai' | 'gemini' | 'anthropic';

/** Provider identifier used in LLM_PROVIDER env var. */
export type LlmProvider =
    | 'opencode-go'
    | 'opencode-zen'
    | 'openrouter'
    | 'openai'
    | 'anthropic'
    | 'gemini'
    | 'groq'
    | 'github-models'
    | 'nvidia-nim'
    | 'custom';

/**
 * Per-tier model mapping within a provider profile.
 * Each tier can have a different default model under the same base URL.
 */
export interface TierDefaults {
    main: string;
    fast: string;
    reviewer: string;
    report: string;
    fallback: string;
    batch: string;
}

/** Provider metadata profile. */
export interface ProviderProfile {
    /** Human-readable display name. */
    displayName: string;
    /** API base URL for the primary endpoint. */
    baseUrl: string;
    /** Default API format. */
    format: ProviderFormat;
    /** Hint shown in the setup wizard. */
    keyHint: string;
    /** Documentation URL (optional). */
    docsUrl?: string;
    /** True if provider has a free tier or is completely free. */
    free?: boolean;
    /** Per-tier default models. */
    tiers: TierDefaults;
    /** If true, user must supply baseUrl via LLM_BASE_URL. */
    requiresBaseUrl?: boolean;
}

// ---- registry ----

export const PROVIDER_PROFILES: Readonly<Record<LlmProvider, ProviderProfile>> = {
    'opencode-go': {
        displayName: 'Opencode Go',
        baseUrl: 'https://opencode.ai/zen/go/v1',
        format: 'openai',
        keyHint: 'Cole sua API key do Opencode Zen (Settings → API Keys)',
        docsUrl: 'https://opencode.ai/docs/go/',
        tiers: {
            main: 'deepseek-v4-pro',
            fast: 'deepseek-v4-flash',
            reviewer: 'deepseek-v4-flash',
            report: 'deepseek-v4-pro',
            fallback: 'kimi-k2.5',
            batch: 'kimi-k2.5',
        },
    },
    'opencode-zen': {
        displayName: 'Opencode Zen',
        baseUrl: 'https://opencode.ai/zen/v1',
        format: 'openai',
        keyHint: 'Cole sua API key do Opencode Zen (Settings → API Keys)',
        docsUrl: 'https://opencode.ai/docs/zen/',
        free: false,
        tiers: {
            main: 'opencode/deepseek-v4-pro',
            fast: 'opencode/deepseek-v4-flash',
            reviewer: 'opencode/deepseek-v4-flash',
            report: 'opencode/deepseek-v4-pro',
            fallback: 'opencode/kimi-k2.5',
            batch: 'opencode/kimi-k2.5',
        },
    },
    openrouter: {
        displayName: 'OpenRouter',
        baseUrl: 'https://openrouter.ai/api/v1',
        format: 'openai',
        keyHint: 'Cole sua OpenRouter API key (sk-or-v1-...)',
        docsUrl: 'https://openrouter.ai/docs',
        tiers: {
            main: 'google/gemini-2.0-flash-exp',
            fast: 'meta-llama/llama-3.1-8b-instruct',
            reviewer: 'google/gemini-2.0-flash-exp',
            report: 'google/gemini-2.0-flash-exp',
            fallback: 'meta-llama/llama-3.1-70b-instruct',
            batch: 'openai/gpt-4o-mini',
        },
    },
    openai: {
        displayName: 'OpenAI',
        baseUrl: 'https://api.openai.com/v1',
        format: 'openai',
        keyHint: 'Cole sua OpenAI API key (sk-...)',
        docsUrl: 'https://platform.openai.com/docs',
        free: false,
        tiers: {
            main: 'gpt-4o',
            fast: 'gpt-4o-mini',
            reviewer: 'gpt-4o-mini',
            report: 'gpt-4o',
            fallback: 'gpt-4o-mini',
            batch: 'gpt-4o-mini',
        },
    },
    anthropic: {
        displayName: 'Anthropic',
        baseUrl: 'https://api.anthropic.com/v1',
        format: 'anthropic',
        keyHint: 'Cole sua Anthropic API key (sk-ant-...)',
        docsUrl: 'https://docs.anthropic.com',
        free: false,
        tiers: {
            main: 'claude-sonnet-4-20250514',
            fast: 'claude-haiku-3-5-20241022',
            reviewer: 'claude-haiku-3-5-20241022',
            report: 'claude-sonnet-4-20250514',
            fallback: 'claude-haiku-3-5-20241022',
            batch: 'claude-haiku-3-5-20241022',
        },
    },
    gemini: {
        displayName: 'Google Gemini',
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
        format: 'gemini',
        keyHint: 'Cole sua Gemini API key (AIza...)',
        docsUrl: 'https://ai.google.dev/gemini-api/docs',
        free: false,
        tiers: {
            main: 'gemini-2.0-flash-exp',
            fast: 'gemini-2.0-flash-lite',
            reviewer: 'gemini-2.0-flash-exp',
            report: 'gemini-2.0-flash-exp',
            fallback: 'gemini-2.0-flash-lite',
            batch: 'gemini-2.0-flash-lite',
        },
    },
    groq: {
        displayName: 'Groq',
        baseUrl: 'https://api.groq.com/openai/v1',
        format: 'openai',
        keyHint: 'Cole sua Groq API key (gsk_...)',
        docsUrl: 'https://console.groq.com/docs',
        free: true,
        tiers: {
            main: 'llama-3.3-70b-versatile',
            fast: 'llama-3.1-8b-instant',
            reviewer: 'mixtral-8x7b-32768',
            report: 'llama-3.3-70b-versatile',
            fallback: 'mixtral-8x7b-32768',
            batch: 'llama-3.1-8b-instant',
        },
    },
    'github-models': {
        displayName: 'GitHub Models',
        baseUrl: 'https://models.inference.ai.azure.com',
        format: 'openai',
        keyHint: 'Usa seu GitHub Token (GITHUB_TOKEN) — sem custo adicional',
        docsUrl: 'https://docs.github.com/en/github-models',
        free: true,
        tiers: {
            main: 'gpt-4o-mini',
            fast: 'gpt-4o-mini',
            reviewer: 'gpt-4o-mini',
            report: 'gpt-4o-mini',
            fallback: 'gpt-4o-mini',
            batch: 'gpt-4o-mini',
        },
    },
    'nvidia-nim': {
        displayName: 'NVIDIA NIM',
        baseUrl: 'https://integrate.api.nvidia.com/v1',
        format: 'openai',
        keyHint: 'Cole sua NVIDIA API key (nvapi-...)',
        docsUrl: 'https://build.nvidia.com/docs',
        free: true,
        tiers: {
            main: 'meta/llama3-70b-instruct',
            fast: 'meta/llama3-8b-instruct',
            reviewer: 'meta/llama3-70b-instruct',
            report: 'meta/llama3-70b-instruct',
            fallback: 'meta/llama3-70b-instruct',
            batch: 'meta/llama3-8b-instruct',
        },
    },
    custom: {
        displayName: 'Custom (OpenAI-compatible)',
        baseUrl: '',
        format: 'openai',
        keyHint: 'Cole sua API key do endpoint customizado',
        requiresBaseUrl: true,
        tiers: {
            main: '',
            fast: '',
            reviewer: '',
            report: '',
            fallback: '',
            batch: '',
        },
    },
};

/** Ordered list of known provider IDs (for validation and wizard display). */
export const KNOWN_PROVIDERS: readonly LlmProvider[] = [
    'opencode-go',
    'opencode-zen',
    'openrouter',
    'openai',
    'anthropic',
    'gemini',
    'groq',
    'github-models',
    'nvidia-nim',
    'custom',
];

// ---- helpers ----

/**
 * Get a provider profile by ID.
 * Returns undefined for unknown providers.
 */
export function getProviderProfile(provider: string): ProviderProfile | undefined {
    return PROVIDER_PROFILES[provider as LlmProvider];
}

/**
 * Check if a provider ID is known.
 */
export function isKnownProvider(provider: string): provider is LlmProvider {
    return provider in PROVIDER_PROFILES;
}

/**
 * Infer provider from an API key pattern.
 * Returns null when the key does not match any known pattern.
 */
export function inferProviderFromKey(apiKey: string): LlmProvider | null {
    if (apiKey.startsWith('sk-or-v1-')) return 'openrouter';
    if (apiKey.startsWith('sk-ant-')) return 'anthropic';
    if (apiKey.startsWith('gsk_')) return 'groq';
    if (apiKey.startsWith('AIza')) return 'gemini';
    if (apiKey.startsWith('nvapi-')) return 'nvidia-nim';
    if (apiKey.startsWith('sk-')) return 'openai';
    return null;
}

/**
 * Human-readable provider list for CLI display.
 */
export function formatProviderList(): string {
    return KNOWN_PROVIDERS.filter((p) => p !== 'custom')
        .map((p) => {
            const profile = Object.entries(PROVIDER_PROFILES).find(([k]) => k === p)?.[1];
            if (!profile) return '';
            const freeTag = profile.free ? ' (free)' : '';
            return `  ${p}: ${profile.displayName}${freeTag}`;
        })
        .join('\n');
}
