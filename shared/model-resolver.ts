/**
 * model-resolver.ts — Deterministic tier-to-model resolution with async enrichment
 *                     and dynamic quality-aware reordering.
 *
 * Resolution pipeline (2-stage, fail-fast):
 *   Stage 1 — Registry lookup: filter by tier, sort by context desc + cost asc +
 *             latency asc, skip models with open circuit breaker
 *   Stage 2 — Profile fallback: ProviderProfile.tiers (hardcoded minimum)
 *
 * Async enrichment via initModelResolver():
 *   - Day-0: fetches OpenRouter model list (public, no key needed)
 *   - Merges context/capabilities into in-memory registry
 *   - Background: resolver works synchronously, returns enriched data when available
 *
 * User override (LLM_{TIER}_MODEL) is handled upstream by the caller
 * (tierToConfig in llm-fallback-config.ts) before reaching this function.
 *
 * Zero I/O at call time: registry is read once at module load.
 * Zero exceptions during resolveModel().
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { getProviderProfile } from './llm-provider-profiles.js';
import { getAdapter } from './model-adapter.js';
import { rootLogger } from './logger.js';
import { getDefaultMetrics } from './llm-metrics.js';
import { getCircuitState } from './circuit-breaker.js';
import type { LlmProvider } from './llm-provider-profiles.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REGISTRY_PATH = resolve(__dirname, '..', 'data', 'model-registry.json');
const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models';

export interface RegistryModel {
    id: string;
    context: number;
    costPer1kPrompt: number;
    costPer1kCompletion: number;
    tiers: string[];
    capabilities?: string[];
}

export interface RegistryData {
    version: number;
    updated: string;
    providers: Record<string, RegistryModel[]>;
}

export interface ResolveResult {
    id: string;
    context: number;
    costPer1kPrompt: number;
    costPer1kCompletion: number;
    capabilities?: string[];
    source: 'registry' | 'profile';
}

let _registry: RegistryData | null = null;
let _enriched: Map<string, { context?: number; capabilities?: string[] }> | null = null;

function loadRegistry(): RegistryData {
    if (_registry) return _registry;
    try {
        const content = readFileSync(REGISTRY_PATH, 'utf8');
        _registry = JSON.parse(content) as RegistryData;
    } catch (err) {
        rootLogger.warn(
            'model-resolver: failed to read registry, using defaults: ' +
                (err instanceof Error ? err.message : String(err)),
        );
        _registry = { version: 0, updated: '', providers: {} };
    }
    return _registry;
}

function enrichModel(m: RegistryModel, e: { context?: number; capabilities?: string[] }): RegistryModel {
    const ctx = e.context ?? m.context;
    const caps = e.capabilities;
    if (caps) return { ...m, context: ctx, capabilities: caps };
    if (ctx !== m.context) return { ...m, context: ctx };
    return m;
}

function applyEnrichment(models: RegistryModel[]): RegistryModel[] {
    const map = _enriched;
    if (!map) return models;
    return models.map((m) => {
        const e = map.get(m.id);
        if (!e) return m;
        return enrichModel(m, e);
    });
}

/** Get the loaded registry data with optional enrichment from async sources. */
export function getRegistry(): RegistryData {
    const base = loadRegistry();
    const map = _enriched;
    if (!map || map.size === 0) return base;
    const providers = new Map<string, RegistryModel[]>();
    for (const [provider, models] of Object.entries(base.providers)) {
        providers.set(provider, applyEnrichment(models));
    }
    return { ...base, providers: Object.fromEntries(providers) };
}

/**
 * Initialize async enrichment of the model registry.
 *
 * Fetches the OpenRouter model list (public, no key needed) and merges
 * context length and capabilities into the in-memory registry.
 *
 * Safe to call multiple times: only runs once.
 * Runs in background: resolver works synchronously.
 */
export async function initModelResolver(): Promise<void> {
    if (_enriched) return;
    _enriched = new Map();

    const adapter = getAdapter('openrouter');
    if (!adapter) return;

    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 10_000);
        const response = await fetch(OPENROUTER_MODELS_URL, { signal: controller.signal });
        clearTimeout(timer);

        if (!response.ok) {
            rootLogger.debug(`OpenRouter initModelResolver: HTTP ${response.status}`);
            return;
        }

        const body = await response.json();
        const entries = adapter.parseListResponse(body);

        for (const e of entries) {
            const entry: { context?: number; capabilities?: string[] } = {};
            if (e.context !== undefined) entry.context = e.context;
            if (e.capabilities !== undefined && e.capabilities.length > 0) entry.capabilities = e.capabilities;
            _enriched.set(e.id, entry);
        }

        rootLogger.debug(`initModelResolver: enriched ${_enriched.size} models from OpenRouter`);
    } catch (err) {
        rootLogger.debug(`initModelResolver failed: ${err instanceof Error ? err.message : String(err)}`);
    }
}

function sortByFitness(a: RegistryModel, b: RegistryModel): number {
    const ctxCmp = (b.context || 0) - (a.context || 0);
    if (ctxCmp !== 0) return ctxCmp;
    const costA = (a.costPer1kPrompt || 0) + (a.costPer1kCompletion || 0);
    const costB = (b.costPer1kPrompt || 0) + (b.costPer1kCompletion || 0);
    if (costA !== costB) return costA - costB;
    const latA = getDefaultMetrics().getModelAvgLatency(a.id);
    const latB = getDefaultMetrics().getModelAvgLatency(b.id);
    return latA - latB;
}

function pick(m: RegistryModel): ResolveResult {
    const base = {
        id: m.id,
        context: m.context || 0,
        costPer1kPrompt: m.costPer1kPrompt || 0,
        costPer1kCompletion: m.costPer1kCompletion || 0,
        source: 'registry' as const,
    };
    if (m.capabilities) return { ...base, capabilities: m.capabilities };
    return base;
}

/**
 * Resolve the best model for a given tier and provider.
 *
 * Resolution:
 *   1. Filter registry models by tier eligibility
 *   2. Sort by context desc, cost asc
 *   3. Pick best match
 *   4. If no match, fall back to ProviderProfile.tiers
 *
 * @param tier - Target tier
 * @param provider - Provider identifier
 * @param modelList - Optional override list (for testing or dynamic discovery).
 *                    If null, reads from compiled-in registry.
 * @returns ResolveResult with model id, metadata, and source indicator
 */
export function resolveModel(
    tier: string,
    provider: LlmProvider,
    modelList: RegistryModel[] | null = null,
): ResolveResult {
    const registry = loadRegistry();
    const baseModels = modelList ?? (Object.entries(registry.providers).find(([k]) => k === provider)?.[1] ?? []);
    const models = applyEnrichment(baseModels);

    if (models.length > 0) {
        const eligible = models.filter((m) => getCircuitState(m.id) !== 'OPEN');
        const explicit = eligible.filter((m) => m.tiers.includes(tier));
        if (explicit.length > 0) {
            const candidates = [...explicit].sort(sortByFitness);
            const first = candidates[0];
            if (first) return pick(first);
        }

        const unassigned = eligible.filter((m) => m.tiers.length === 0);
        if (unassigned.length > 0) {
            const candidates = [...unassigned].sort(sortByFitness);
            const first = candidates[0];
            if (first) return pick(first);
        }
    }

    const profile = getProviderProfile(provider);
    const id = profile?.tiers ? profile.tiers[tier as keyof typeof profile.tiers] : '';
    return {
        id: id || '',
        context: 0,
        costPer1kPrompt: 0,
        costPer1kCompletion: 0,
        source: 'profile',
    };
}
