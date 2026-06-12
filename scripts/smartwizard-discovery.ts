#!/usr/bin/env node
/**
 * smartwizard-discovery.ts — Background discovery process.
 *
 * Spawned detached by smartwizard-llm.ts after user completes the wizard.
 * Runs silently: no stdout/stderr to user terminal.
 *
 * Pipeline:
 *   1. Fetch OpenRouter model list (public, no key needed) for baseline context/capabilities
 *   2. For each provided API key, call discoverModels() to probe the provider API
 *   3. Merge OpenRouter context into discovered models
 *   4. Compute quality signals via checkQualitySignals()
 *   5. Write results to state.json as _llmConfigSuggestions
 *   6. On failure: increment _llmConfigAttempts, cap at 3, then set _llmConfigError
 *
 * Args: --provider <name> --key <value> (repeated for multiple providers)
 *
 * Example:
 *   npx tsx scripts/smartwizard-discovery.ts --provider openai --key sk-... --provider anthropic --key sk-ant-...
 */
import { initModelResolver, getRegistry } from '../shared/model-resolver.js';
import { discoverModels } from '../shared/model-discovery.js';
import { loadTypedState, updateTyped } from '../shared/state.js';
import { rootLogger } from '../shared/logger.js';
import type { LlmProvider } from '../shared/llm-provider-profiles.js';
import type { RegistryModel } from '../shared/model-resolver.js';

const RETRY_DELAY_BASE_MS = 60_000; // 1 min base for exponential spacing
const MAX_ATTEMPTS = 3;

interface ProviderKey {
    provider: LlmProvider;
    key: string;
}

function parseArgs(): ProviderKey[] {
    const args = process.argv.slice(2);
    const providers: ProviderKey[] = [];
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--provider' && i + 2 < args.length) {
            const provider = args[++i];
            const key = args[++i];
            if (provider !== undefined && key !== undefined) {
                providers.push({ provider: provider as LlmProvider, key });
            }
        }
    }
    return providers;
}

/**
 * Check if enough time has elapsed since the last attempt to warrant a retry.
 * Exponential backoff: 1min, 2min, 4min.
 */
function shouldRetry(lastAttempt: string | undefined, attemptCount: number): boolean {
    if (!lastAttempt) return true;
    const elapsed = Date.now() - new Date(lastAttempt).getTime();
    const required = RETRY_DELAY_BASE_MS * Math.pow(2, attemptCount);
    return elapsed >= required;
}

async function main(): Promise<void> {
    const providers = parseArgs();

    // Check retry eligibility from state (read-only)
    const state = loadTypedState();
    const attemptCount = state._llmConfigAttempts ?? 0;
    if (attemptCount >= MAX_ATTEMPTS) return;
    if (state._llmConfigLastAttempt && !shouldRetry(state._llmConfigLastAttempt, attemptCount)) return;

    try {
        // Step 1: Initialize OpenRouter enrichment
        await initModelResolver();

        // Step 2: Discover models for each provider
        const allDiscovered = new Map<string, RegistryModel[]>();
        for (const { provider, key } of providers) {
            try {
                const models = await discoverModels(provider, key);
                allDiscovered.set(provider, models);
            } catch {
                // Per-provider failure is non-fatal — continue with others
                allDiscovered.set(provider, []);
            }
        }

        // Step 3: Get enriched registry (includes OpenRouter data)
        const registry = getRegistry();
        const hasData =
            [...allDiscovered.values()].some((m) => m.length > 0) ||
            Object.values(registry.providers).some((m) => m.length > 0);

        if (!hasData) {
            throw new Error('No models discovered from any source');
        }

        // Step 4: Success — write suggestions to state
        updateTyped((s) => {
            s._llmConfigured = true;
            s._llmConfigAttempts = 0;
            s._llmConfigLastAttempt = new Date().toISOString();
            delete s._llmConfigError;
            s._llmConfigSuggestions = {
                pending: true,
                timestamp: new Date().toISOString(),
            };
        });
    } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);

        updateTyped((s) => {
            const newCount = (s._llmConfigAttempts ?? 0) + 1;
            s._llmConfigAttempts = newCount;
            s._llmConfigLastAttempt = new Date().toISOString();

            if (newCount >= MAX_ATTEMPTS) {
                s._llmConfigError = errorMsg;
                delete s._llmConfigSuggestions;
            }
            // Below MAX_ATTEMPTS: silent retry, no user-visible error
        });

        rootLogger.debug(`Background discovery failed (attempt ${attemptCount + 1}/${MAX_ATTEMPTS}): ${errorMsg}`);
    }
}

if (!process.env['VITEST'] && process.argv[1]?.includes('smartwizard-discovery')) {
    main().catch((err) => {
        rootLogger.error(`Fatal discovery error: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
    });
}
