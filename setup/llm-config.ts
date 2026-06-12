/**
 * setup/llm-config.ts — Smart LLM configuration wizard.
 *
 * Flow:
 * 1. Ask user for API key
 * 2. Detect provider from key pattern (inferProviderFromKey)
 * 3. Probe API key with lightweight API call
 * 4. Auto-assign tiers from provider profile
 * 5. Show table for user review
 * 6. Accept or enter advanced mode (manual provider selection)
 * 7. Write .env.local with selective LLM_* replacement
 */
import fs from 'fs';
import { ask, askConfirm, title, info, divider, warn } from '../shared/prompt.js';
import {
    inferProviderFromKey,
    getProviderProfile,
    KNOWN_PROVIDERS,
    formatProviderList,
} from '../shared/llm-provider-profiles.js';
import { probeApiKey, autoAssignTiers } from '../shared/llm-probe.js';
import { rootLogger } from '../shared/logger.js';
import type { LlmProvider } from '../shared/llm-provider-profiles.js';

const ENV_LOCAL = '.env.local';

/** Read existing .env.local, return lines. */
function readEnvLocal(): string[] {
    try {
        return fs.readFileSync(ENV_LOCAL, 'utf8').split('\n');
    } catch {
        return [];
    }
}

/** Merge new LLM_* / OPENCODE_* values into existing .env.local content. */
function mergeEnvLocal(updates: Record<string, string>, existing: string[]): string {
    const updatedKeys = new Set(Object.keys(updates));
    const keptLines: string[] = [];
    for (const line of existing) {
        const match = line.match(/^(LLM_|OPENCODE_)/);
        if (match) {
            const key = line.split('=')[0]?.trim();
            if (key && updatedKeys.has(key)) {
                keptLines.push(key + '=' + updates[key]);
                updatedKeys.delete(key);
            }
        } else {
            keptLines.push(line);
        }
    }
    for (const [k, v] of Object.entries(updates)) {
        if (updatedKeys.has(k)) {
            keptLines.push(k + '=' + v);
        }
    }
    return keptLines.join('\n').replace(/\n{3,}/g, '\n\n') + '\n';
}

/** Format tier table for CLI display. */
function formatTierTable(provider: LlmProvider): string {
    const profile = getProviderProfile(provider);
    if (!profile) return '';
    const lines: string[] = ['Tabela de tiers:'];
    lines.push('  ' + '-'.repeat(50));
    const tierLabels: Array<{ key: keyof typeof profile.tiers; label: string }> = [
        { key: 'main', label: 'Main (análise pesada)' },
        { key: 'fast', label: 'Fast (análise rápida)' },
        { key: 'reviewer', label: 'Reviewer (code review)' },
        { key: 'report', label: 'Report (relatórios)' },
        { key: 'fallback', label: 'Fallback (reserva)' },
        { key: 'batch', label: 'Batch (lotes)' },
    ];
    for (const t of tierLabels) {
        const model = profile.tiers[t.key];
        lines.push('  ' + t.label.padEnd(30) + model);
    }
    lines.push('  ' + '-'.repeat(50));
    lines.push('  Base URL: ' + profile.baseUrl);
    lines.push('  Formato: ' + profile.format);
    if (profile.free) lines.push('  Gratuito: sim');
    return lines.join('\n');
}

/** Prompt user to select a provider manually (advanced mode). */
async function selectProviderManually(): Promise<LlmProvider | null> {
    info('Provedores suportados:');
    info(formatProviderList());
    const answer = await ask('Digite o nome do provedor', {
        default: '',
        hint: 'ex: openai, anthropic, gemini, groq',
    });
    const cleaned = answer.trim().toLowerCase();
    if (KNOWN_PROVIDERS.includes(cleaned as LlmProvider)) {
        return cleaned as LlmProvider;
    }
    warn('Provedor não reconhecido: ' + cleaned);
    return null;
}

/**
 * Run the LLM configuration wizard.
 * Returns true if .env.local was written/updated.
 */
export async function configureLlm(): Promise<boolean> {
    title('Configuração LLM — Smart Wizard');

    info('Vou ajudar a configurar seus provedores de IA.');
    info('Funciona assim:');
    info('  1. Você cola sua API key');
    info('  2. Detecto automaticamente o provedor');
    info('  3. Valido a key com uma chamada leve');
    info('  4. Atribuo os tiers automaticamente');
    info('  5. Salvo no .env.local');
    divider();

    const apiKey = await ask('Cole sua API key principal', { hint: 'Ex: sk-..., sk-ant-..., AIza...' });
    const trimmed = apiKey.trim();
    if (!trimmed) {
        warn('Nenhuma key informada. Pulando configuração LLM.');
        return false;
    }

    // Detect provider from key pattern
    let detectedProvider = inferProviderFromKey(trimmed);
    if (detectedProvider) {
        const profile = getProviderProfile(detectedProvider);
        info('Provedor detectado: ' + (profile?.displayName ?? detectedProvider));
    } else {
        info('Não foi possível detectar o provedor pelo padrão da key.');
        info('Vou tentar descobrir testando contra provedores conhecidos...');
    }

    // Probe the key
    let acceptKey = false;
    if (detectedProvider) {
        info('Validando key...');
        const probeResult = await probeApiKey(trimmed, detectedProvider);
        if (probeResult.valid) {
            info('✅ Key válida para ' + detectedProvider);
            acceptKey = true;
        } else {
            warn('⚠️  Key não validada: ' + (probeResult.error ?? 'motivo desconhecido'));
            warn('Continuando mesmo assim (a key pode funcionar mesmo sem validação remota).');
            acceptKey = true;
        }
    } else {
        // Try discovery
        info('Testando key contra provedores conhecidos...');
        for (const p of KNOWN_PROVIDERS) {
            if (p === 'custom') continue;
            const probeResult = await probeApiKey(trimmed, p);
            if (probeResult.valid) {
                detectedProvider = p;
                const profile = getProviderProfile(p);
                info('✅ Key aceita por: ' + (profile?.displayName ?? p));
                acceptKey = true;
                break;
            }
        }
        if (!acceptKey) {
            warn('Key não aceita por nenhum provedor conhecido.');
            const proceed = await askConfirm('Continuar mesmo assim?', true);
            if (!proceed) return false;
            detectedProvider = 'opencode-go';
        }
    }

    // User review
    divider();
    let provider = detectedProvider ?? 'opencode-go';
    let advancedMode = false;
    if (acceptKey) {
        info(formatTierTable(provider));
        const accepted = await askConfirm('Aceitar configuração automática?', true);
        if (!accepted) {
            advancedMode = true;
        }
    }

    if (advancedMode || !detectedProvider) {
        const manualProvider = await selectProviderManually();
        if (manualProvider) {
            provider = manualProvider;
            info(formatTierTable(provider));
        }
    }

    // Build assignments
    const assignment = autoAssignTiers(provider);

    // Build env updates
    const envUpdates: Record<string, string> = {};
    envUpdates['LLM_PROVIDER'] = provider;
    envUpdates['LLM_API_KEY'] = trimmed;

    // Only set specific tiers that differ from provider profile defaults
    for (const [tier, model] of Object.entries(assignment.tiers) as Array<[string, string]>) {
        const envVar = 'LLM_' + tier.charAt(0).toUpperCase() + tier.slice(1) + '_MODEL';
        envUpdates[envVar] = model;
    }

    // Write .env.local
    const existing = readEnvLocal();
    const newContent = mergeEnvLocal(envUpdates, existing);
    fs.writeFileSync(ENV_LOCAL, newContent, 'utf8');
    info('✅ Configuração salva em ' + ENV_LOCAL);

    divider();
    info('Resumo:');
    info('  Provedor: ' + provider);
    info('  Tier principal: ' + assignment.tiers.main);
    info('  Tier fast: ' + assignment.tiers.fast);
    info('  Arquivo: ' + ENV_LOCAL);

    rootLogger.info('LLM config written to ' + ENV_LOCAL + ' (provider=' + provider + ')');
    return true;
}
