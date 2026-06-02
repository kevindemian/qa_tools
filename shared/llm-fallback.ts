/**
 * LLM fallback barrel — re-exports all public API from sub-modules and
 * provides the sendWithFallback orchestrator + token estimator.
 *
 * Dependencies:
 *   - llm-fallback-config  → types, schemas, constants, metrics, tier configs
 *   - llm-fallback-http    → payload builders, fetchWithRetry, sendToProvider
 *   - llm-rate-limiter     → per-tier rate limiting
 *   - llm-cache            → configUniqueKey for deduplication
 *   - circuit-breaker      → per-provider circuit state tracking
 */
import { checkRateLimit } from './llm-rate-limiter';
import { configUniqueKey } from './llm-cache';
import { recordCircuitFailure, recordCircuitSuccess } from './circuit-breaker';
import { rootLogger } from './logger';
import { LlmProviderError } from './errors';
import type { LlmTier, ResponseFormat } from './types';
import { tierToConfig, ProviderConfig } from './llm-fallback-config';
import { sendToProvider } from './llm-fallback-http';

// -- barrel re-exports --

export * from './llm-fallback-config';
export * from './llm-fallback-http';

// -- orchestrator --

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
            const result = await sendToProvider(cfg, system, user, tier);
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
