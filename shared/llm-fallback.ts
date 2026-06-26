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
import { checkRateLimit } from './llm-rate-limiter.js';
import { configUniqueKey } from './llm-cache.js';
import { recordCircuitFailure, recordCircuitSuccess } from './circuit-breaker.js';
import { rootLogger } from './logger.js';
import { LlmProviderError } from './errors.js';
import type { LlmTier, ResponseFormat } from './types.js';
import { tierToConfig, ProviderConfig } from './llm-fallback-config.js';
import { sendToProvider } from './llm-fallback-http.js';

// -- barrel re-exports (only symbols consumed from this barrel) --

export { _llmMetrics, getLlmClientMetrics, resetLlmClientMetrics, tierToConfig } from './llm-fallback-config.js';
export { parseRawOnce, parseRetryAfter } from './llm-fallback-http.js';

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

    const fallbackMap = new Map<string, LlmTier[]>([
        ['main', ['fallback', 'batch']],
        ['fast', ['main', 'fallback', 'batch']],
        ['report', ['fallback', 'batch']],
    ]);
    const fallbacks = fallbackMap.get(tier) || [];
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

    for (const [, cfg] of candidates.entries()) {
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
 * Estimate input token count.
 * CJK chars → 1 token each, other chars → 1 token per 4.
 * @internal
 */
export function _estimateInputTokens(system: string, user: string): number {
    const combined = system + user;
    const cjkCount = (combined.match(/[\u4E00-\u9FFF\u3000-\u303F\uFF00-\uFFEF]/g) ?? []).length;
    const regCount = combined.length - cjkCount;
    return Math.ceil(regCount / 4) + cjkCount;
}
