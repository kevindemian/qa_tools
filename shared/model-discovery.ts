/**
 * model-discovery.ts — Provider model discovery via API adapters.
 *
 * Pipeline:
 *   1. Get the provider-specific adapter from model-adapter.ts
 *   2. Build the HTTP request via buildProbeRequest (llm-probe.ts)
 *   3. Execute GET /v1/models with timeout
 *   4. Parse the response via the adapter
 *   5. Fallback to empty array (caller uses registry)
 *
 * Each adapter knows the exact response schema of its provider.
 * No error probe, no generic switch(format), no regex parsing of HTML.
 *
 * Discovery runs on:
 *   - Init (day 0): async background, enriches registry silently
 *   - Weekly probe: via scripts/probe-registry.ts with OpenRouter
 *   - Runtime: LLM_DISCOVERY_MODE=auto calls provider's API with user key
 */
import { buildProbeRequest } from './llm-probe.js';
import { getAdapter } from './model-adapter.js';
import { rootLogger } from './logger.js';
import type { LlmProvider } from './llm-provider-profiles.js';
import type { RegistryModel } from './model-resolver.js';

const DISCOVERY_TIMEOUT_MS = 10_000;

/**
 * Discover available models for a given provider.
 *
 * Single-pass: uses the provider's adapter to call GET /v1/models
 * and parse the response. Returns RegistryModel[] with context
 * and capabilities where available.
 *
 * @param provider - Provider identifier
 * @param apiKey - API key for authentication
 * @returns Array of discovered models (may be empty — caller falls back to registry)
 */
export async function discoverModels(provider: LlmProvider, apiKey: string): Promise<RegistryModel[]> {
    const adapter = getAdapter(provider);
    if (!adapter) return [];

    const request = buildProbeRequest(provider, apiKey);
    if (!request) return [];

    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), DISCOVERY_TIMEOUT_MS);
        const response = await fetch(request.url, { ...request.init, signal: controller.signal });
        clearTimeout(timer);

        if (!response.ok) return [];

        const body = await response.json();
        const entries = adapter.parseListResponse(body);

        return entries.map((e) => {
            const base = {
                id: e.id,
                context: e.context ?? 0,
                costPer1kPrompt: 0,
                costPer1kCompletion: 0,
                tiers: [],
            } as RegistryModel;
            if (e.capabilities) base.capabilities = e.capabilities;
            return base;
        });
    } catch (err) {
        rootLogger.debug(`Discovery failed for ${provider}: ${err instanceof Error ? err.message : String(err)}`);
        return [];
    }
}

/**
 * Assign tier suggestions to discovered models based on heuristic.
 *
 * Heuristic rules:
 * - Models with "sonnet", "4o" (not mini/pro), "pro", "ultra", "70b", "exp" → high tier
 * - Models with "mini", "haiku", "flash-lite", "lite", "8b", "nano", "tiny" → fast/batch tier
 * - Unclassified models → assigned to tier based on context and position
 *
 * @param models - Discovered models (with capabilities if available)
 * @returns Same models with tiers populated
 */
export function assignTierHints(models: RegistryModel[]): RegistryModel[] {
    if (models.length === 0) return [];

    const highKeywords = /sonnet|(?<!mini-)4o(?!-mini)|pro\b|ultra|70b|exp|versatile/i;
    const lowKeywords = /mini|haiku|flash-lite|lite\b|8b|nano|tiny/i;

    const high: RegistryModel[] = [];
    const medium: RegistryModel[] = [];
    const low: RegistryModel[] = [];

    for (const m of models) {
        if (highKeywords.test(m.id)) {
            high.push(m);
        } else if (lowKeywords.test(m.id)) {
            low.push(m);
        } else {
            medium.push(m);
        }
    }

    const sortCtx = (a: RegistryModel, b: RegistryModel) => (b.context || 0) - (a.context || 0);
    high.sort(sortCtx);
    medium.sort(sortCtx);
    low.sort(sortCtx);

    const assign = (tier: string, pool: RegistryModel[]): void => {
        const modelTierKey = new Set<string>();

        const pick = (list: RegistryModel[]): void => {
            for (const m of list) {
                const key = m.id + ':' + tier;
                if (!modelTierKey.has(key)) {
                    m.tiers.push(tier);
                    modelTierKey.add(key);
                    return;
                }
            }
        };

        pick(pool);
    };

    assign('main', high);
    assign('main', medium);
    assign('main', low);

    assign('report', high);
    assign('report', medium);
    assign('report', low);

    assign('fast', low);
    assign('fast', medium);
    assign('fast', high);

    assign('reviewer', low);
    assign('reviewer', medium);
    assign('reviewer', high);

    assign('fallback', medium);
    assign('fallback', low);
    assign('fallback', high);

    assign('batch', low);
    assign('batch', medium);
    assign('batch', high);

    return models;
}
