/**
 * llm-probe.ts — LLM key detection, API validation, and tier auto-assignment.
 *
 * Responsibilities:
 * 1. Detect provider from an API key pattern (delegates to inferProviderFromKey)
 * 2. Validate an API key by making a lightweight probe API call
 * 3. Auto-assign tier models from provider profile
 *
 * The probe never consumes user quota — it uses free endpoints like /models
 * (OpenAI format) or checks header-derived auth errors.
 */
import { getProviderProfile, inferProviderFromKey, KNOWN_PROVIDERS } from './llm-provider-profiles.js';
import { resolveModel } from './model-resolver.js';
import { recordLlmRequest } from './llm-metrics.js';
import { rootLogger } from '../logger.js';
import type { LlmProvider } from './llm-provider-profiles.js';
import type { TierDefaults } from './llm-provider-profiles.js';

function stripTrailingSlashes(s: string): string {
    let end = s.length;
    while (end > 0 && s.charCodeAt(end - 1) === 47) end--;
    return s.slice(0, end);
}

const PROBE_TIMEOUT_MS = 5_000;

/** Result of a key probe operation. */
export interface ProbeResult {
    valid: boolean;
    provider: LlmProvider | null;
    detected: boolean;
    error?: string;
}

/** Result of a full tier auto-assignment. */
export interface TierAssignment {
    provider: LlmProvider;
    tiers: TierDefaults;
}

/**
 * Detect provider from an API key pattern.
 * Wraps inferProviderFromKey with null-safe handling.
 */
export function detectProvider(apiKey: string): LlmProvider | null {
    if (!apiKey || typeof apiKey !== 'string') return null;
    return inferProviderFromKey(apiKey.trim());
}

/**
 * Build a probe URL and headers for a given provider.
 * Uses free/cheap endpoints that don't consume quota.
 *
 * Exported for reuse by model-discovery.ts and probe-registry.ts.
 */
export function buildProbeRequest(provider: LlmProvider, apiKey: string): { url: string; init: RequestInit } | null {
    const profile = getProviderProfile(provider);
    if (!profile) return null;
    if (!profile.baseUrl && profile.requiresBaseUrl) return null;

    const base = stripTrailingSlashes(profile.baseUrl);
    const controller = new AbortController();
    setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);

    const common = { signal: controller.signal } as const;

    switch (profile.format) {
        case 'openai': {
            return {
                url: `${base}/models`,
                init: {
                    ...common,
                    method: 'GET',
                    headers: {
                        Authorization: `Bearer ${apiKey}`,
                        'Content-Type': 'application/json',
                    },
                },
            };
        }
        case 'gemini': {
            return {
                url: `${base}/models?key=${apiKey}`,
                init: {
                    ...common,
                    method: 'GET',
                    headers: { 'Content-Type': 'application/json' },
                },
            };
        }
        case 'anthropic': {
            return {
                url: `${base}/messages`,
                init: {
                    ...common,
                    method: 'POST',
                    headers: {
                        'x-api-key': apiKey,
                        'anthropic-version': '2023-06-01',
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        model: 'claude-haiku-3-5-20241022',
                        max_tokens: 1,
                        messages: [{ role: 'user', content: '.' }],
                    }),
                },
            };
        }
        default:
            return null;
    }
}

/**
 * Validate an API key by making a lightweight probe call.
 * Returns ProbeResult with validity status and detected provider.
 *
 * Never consumes user quota — uses free endpoints (/models for OpenAI format)
 * or minimal token probes with known error handling.
 */
export async function probeApiKey(apiKey: string, provider: LlmProvider): Promise<ProbeResult> {
    const cleanedKey = apiKey.trim();
    const request = buildProbeRequest(provider, cleanedKey);
    if (!request) {
        return { valid: false, provider, detected: false, error: 'Unsupported provider for probing' };
    }

    try {
        const start = performance.now();
        const response = await fetch(request.url, request.init);
        const elapsed = Math.round(performance.now() - start);

        recordLlmRequest('probe' as never, elapsed, `probe:${provider}`);

        if (response.ok) {
            return { valid: true, provider, detected: true };
        }

        if (response.status === 401 || response.status === 403) {
            return { valid: false, provider, detected: true, error: `Invalid API key (HTTP ${response.status})` };
        }

        return { valid: true, provider, detected: true, error: `Unexpected response (HTTP ${response.status})` };
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        rootLogger.debug(`LLM probe failed for ${provider}: ${msg}`);
        return { valid: false, provider, detected: true, error: msg };
    }
}

/**
 * Try to detect and validate a key against all known providers.
 * Returns the first provider that accepts the key.
 * If no provider accepts, returns the pattern-based detection with probe failure.
 */
export async function discoverProvider(apiKey: string): Promise<ProbeResult> {
    const cleanedKey = apiKey.trim();
    const patternMatch = detectProvider(cleanedKey);

    // Try pattern-matched provider first
    if (patternMatch) {
        const result = await probeApiKey(cleanedKey, patternMatch);
        if (result.valid) return result;
    }

    // Probe remaining known providers
    for (const p of KNOWN_PROVIDERS) {
        if (p === patternMatch || p === 'custom') continue;
        const result = await probeApiKey(cleanedKey, p);
        if (result.valid) return result;
        if (result.error?.includes('timeout') || result.error?.includes('abort')) continue;
    }

    return {
        valid: false,
        provider: patternMatch,
        detected: patternMatch !== null,
        error: patternMatch
            ? 'Key pattern matched but provider rejected the key'
            : 'Could not detect provider from key pattern or probe',
    };
}

/**
 * Auto-assign tier defaults from a provider profile.
 * Returns the tier mapping for all 6 tiers.
 */
/**
 * Auto-assign tier defaults using the model resolver.
 * Uses registry first, falls back to provider profile.
 * Returns the tier mapping for all 6 tiers.
 */
export function autoAssignTiers(provider: LlmProvider): TierAssignment {
    const profile = getProviderProfile(provider);
    if (!profile) {
        throw new Error(`Unknown provider: ${provider}`);
    }
    const tierNames = ['main', 'fast', 'reviewer', 'report', 'fallback', 'batch'] as const;
    const tiersMap = new Map<string, string>();
    for (const t of tierNames) {
        tiersMap.set(t, resolveModel(t, provider).id);
    }
    const tiers = {
        main: tiersMap.get('main') ?? '',
        fast: tiersMap.get('fast') ?? '',
        reviewer: tiersMap.get('reviewer') ?? '',
        report: tiersMap.get('report') ?? '',
        fallback: tiersMap.get('fallback') ?? '',
        batch: tiersMap.get('batch') ?? '',
    };
    return { provider, tiers };
}
