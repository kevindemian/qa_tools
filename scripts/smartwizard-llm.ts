#!/usr/bin/env node
/**
 * smartwizard-llm.ts — SmartWizard LLM: configuração multi-provedor simplificada.
 *
 * Fluxo:
 *   1. Coleta chaves de API do usuário (loop: cola → detecta → valida síncrono → repete)
 *   2. Validação instantânea via inferProviderFromKey() — zero I/O, zero custo
 *   3. Mostra config sugerida via autoAssignTiers() (defaults do profile)
 *   4. Usuário aceita ou entra em modo Avançado (edição manual)
 *   5. Escreve .env.local com atomicidade + chmod 0o600
 *   6. Salva state flags (_llmConfigured, etc.)
 *   7. Dispara discovery em background (detached, unref — sem bloquear)
 *
 *   Sessão seguinte: se _llmConfigSuggestions.pending, menu pergunta se deseja atualizar
 *
 * Uso:
 *   npx tsx scripts/smartwizard-llm.ts --review   # Modo revisão (sugestões pendentes)
 *   npx tsx scripts/smartwizard-llm.ts             # Modo normal
 */
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inferProviderFromKey, KNOWN_PROVIDERS } from '../shared/llm/llm-provider-profiles.js';
import { autoAssignTiers, probeApiKey, type TierAssignment } from '../shared/llm/llm-probe.js';
import { reloadDotenv } from '../shared/env-loader.js';
import { updateTyped as updateState } from '../shared/state.js';
import { ask, askConfirm, title, info, warn, divider } from '../shared/ui/prompt.js';
import { rootLogger } from '../shared/logger.js';
import type { LlmProvider } from '../shared/llm/llm-provider-profiles.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ENV_LOCAL = resolve(__dirname, '..', '.env.local');
const TSX_BIN = resolve(__dirname, '..', 'node_modules', '.bin', 'tsx');

// ───────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────

function readEnvLocal(): string[] {
    try {
        return fs.readFileSync(ENV_LOCAL, 'utf8').split('\n');
    } catch (err) {
        rootLogger.debug('smartwizard-llm: failed to read .env.local: ' + String(err));
        return [];
    }
}

function replaceOrUpdateKey(line: string, updates: Record<string, string>): string | null {
    const key = line.split('=')[0]?.trim();
    if (!key || !(key in updates)) return null;
    return key + '=' + updates[key];
}

function mergeEnvLocal(updates: Record<string, string>, existing: string[]): string {
    const updatedKeys = new Set(Object.keys(updates));
    const keptLines: string[] = [];
    for (const line of existing) {
        const match = /^(LLM_|OPENCODE_)/.exec(line);
        if (!match) {
            keptLines.push(line);
            continue;
        }
        const replacement = replaceOrUpdateKey(line, updates);
        if (replacement) {
            keptLines.push(replacement);
            const key = line.split('=')[0]?.trim();
            if (key) updatedKeys.delete(key);
        }
    }
    appendNewKeys(keptLines, updates, updatedKeys);
    return keptLines.join('\n') + '\n';
}

function appendNewKeys(keptLines: string[], updates: Record<string, string>, updatedKeys: Set<string>): void {
    for (const [key, val] of Object.entries(updates)) {
        if (!updatedKeys.has(key)) continue;
        if (keptLines.length > 0 && keptLines[keptLines.length - 1] !== '') {
            keptLines.push('');
        }
        keptLines.push(key + '=' + val);
    }
}

function writeEnvLocal(content: string): void {
    const tmpPath = ENV_LOCAL + '.tmp';
    fs.writeFileSync(tmpPath, content, 'utf8');
    fs.chmodSync(tmpPath, 0o600);
    fs.renameSync(tmpPath, ENV_LOCAL);
}

function maskKey(key: string): string {
    if (key.length <= 8) return key;
    return key.slice(0, 4) + '*'.repeat(key.length - 8) + key.slice(-4);
}

// ───────────────────────────────────────────
// Core wizard
// ───────────────────────────────────────────

function runDiscoveryBackground(providers: Map<LlmProvider, string>): void {
    const scriptPath = resolve(__dirname, 'smartwizard-discovery.ts');
    const args: string[] = [];
    for (const [provider, key] of providers) {
        args.push('--provider', provider, '--key', key);
    }

    const child = spawn(process.execPath, [TSX_BIN, scriptPath, ...args], {
        stdio: 'ignore',
        detached: true,
        cwd: resolve(__dirname, '..'),
    });
    child.unref();
}

async function processProviderKey(trimmed: string, providers: Map<LlmProvider, string>): Promise<void> {
    const detected = inferProviderFromKey(trimmed);
    if (!detected) {
        info('Padrão não reconhecido. Testando provedores conhecidos...');
        const found = await probeUnknownKey(trimmed, providers);
        if (!found) {
            warn('Chave não reconhecida por nenhum provedor conhecido. Ignorando.');
        }
        return;
    }
    if (providers.has(detected)) {
        warn(`Provider ${detected} já registrado. Ignorando duplicata.`);
    } else {
        providers.set(detected, trimmed);
        info(`✓ ${detected} detectado`);
    }
}

async function collectProviderKeys(): Promise<Map<LlmProvider, string>> {
    const providers = new Map<LlmProvider, string>();
    let addMore = true;
    while (addMore) {
        const keyRaw = await ask(providers.size === 0 ? 'Cole sua chave de API:' : 'Cole a próxima chave de API:');
        const trimmed = keyRaw.trim();

        if (!trimmed) {
            if (providers.size === 0) {
                warn('Nenhuma chave informada. Cancelando.');
                return providers;
            }
            break;
        }

        await processProviderKey(trimmed, providers);

        if (providers.size === 0) continue;

        addMore = await askConfirm('Registrar outra chave? (s/N)', false);
    }
    return providers;
}

async function probeUnknownKey(trimmed: string, providers: Map<LlmProvider, string>): Promise<boolean> {
    for (const p of KNOWN_PROVIDERS) {
        if (p === 'custom') continue;
        if (providers.has(p)) continue;
        const result = await probeApiKey(trimmed, p);
        if (result.valid) {
            providers.set(p, trimmed);
            info(`✓ ${p} — chave válida`);
            return true;
        }
    }
    return false;
}

function displayConfigTable(firstProvider: LlmProvider, assignment: TierAssignment): void {
    divider();
    info('Configuração sugerida:');
    info(`  Provedor principal: ${firstProvider}`);
    info('');
    info('  Tier     | Modelo');
    info('  ---------|----------------------------');
    for (const [tier, model] of Object.entries(assignment.tiers)) {
        info(`  ${tier.padEnd(9)}| ${model}`);
    }
    divider();
}

function displayAdditionalProviders(firstProvider: LlmProvider, providers: Map<LlmProvider, string>): void {
    if (providers.size <= 1) return;
    info('Provedores adicionais registrados:');
    for (const [p, key] of providers) {
        if (p === firstProvider) continue;
        info(`  • ${p} (chave: ${maskKey(key)})`);
    }
    divider();
}

function writeEnvConfig(
    firstProvider: LlmProvider,
    firstKey: string,
    assignment: TierAssignment,
    providers: Map<LlmProvider, string>,
): void {
    const envUpdates = new Map<string, string>();
    envUpdates.set('LLM_PROVIDER', firstProvider);
    envUpdates.set('LLM_API_KEY', firstKey);

    for (const [tier, model] of Object.entries(assignment.tiers)) {
        const envVar = 'LLM_' + tier.charAt(0).toUpperCase() + tier.slice(1) + '_MODEL';
        envUpdates.set(envVar, String(model));
    }

    for (const [p, key] of providers) {
        if (p === firstProvider) continue;
        const envVar = 'LLM_' + p.charAt(0).toUpperCase() + p.slice(1).replace(/-/g, '_') + '_API_KEY';
        envUpdates.set(envVar, key);
    }

    const existing = readEnvLocal();
    const updates: Record<string, string> = Object.fromEntries(envUpdates);
    const newContent = mergeEnvLocal(updates, existing);
    writeEnvLocal(newContent);
}

export async function main(): Promise<void> {
    const isReview = process.argv.includes('--review');

    title(isReview ? 'Revisar Configuração de IA' : 'Configurar Provedor de IA');

    if (!isReview) {
        divider();
        info('Cole suas chaves de API dos provedores de IA.');
        info('O sistema detecta automaticamente o provedor e valida a chave.');
        info('Você pode registrar um ou mais provedores.');
        divider();
    }

    // ── Coleta de chaves ──
    const providers = new Map<LlmProvider, string>();

    if (!isReview) {
        const collected = await collectProviderKeys();
        for (const [k, v] of collected) {
            providers.set(k, v);
        }

        if (providers.size === 0) {
            warn('Nenhum provedor configurado. Cancelando.');
            return;
        }
    }

    // ── Geração de config sugerida ──
    divider();
    info('Gerando configuração sugerida...');

    // Usa o primeiro provedor para autoAssignTiers (compatibilidade)
    // Em multi-provedor, cada tier pode vir de um provedor diferente
    const providerList = [...providers.keys()];
    const firstProvider: LlmProvider = providerList[0] as LlmProvider;
    const firstKey: string = providers.get(firstProvider) ?? '';
    const assignment = autoAssignTiers(firstProvider);

    displayConfigTable(firstProvider, assignment);
    displayAdditionalProviders(firstProvider, providers);

    const accepted = await askConfirm('Aceitar configuração? (S/n)', true);

    if (!accepted) {
        info('Modo Avançado: edite manualmente o arquivo .env.local');
        info(`  ${ENV_LOCAL}`);
        info('Depois edite as variáveis LLM_*_MODEL conforme desejado.');
        updateState((s) => {
            s._llmConfigured = true;
            delete s._llmConfigSuggestions;
        });
        return;
    }

    writeEnvConfig(firstProvider, firstKey, assignment, providers);

    // Atualiza env no processo atual
    reloadDotenv();

    // ── State flags ──
    updateState((s) => {
        s._llmConfigured = true;
        s._llmConfigAttempts = 0;
        s._llmConfigLastAttempt = new Date().toISOString();
        delete s._llmConfigError;
        delete s._llmConfigSuggestions;
    });

    info('✅ Configuração salva em .env.local');
    divider();
    info('ℹ️  O QA Tools verificará seus provedores em background.');
    info('   Se houver sugestões de ajuste, você será notificado');
    info('   na próxima execução.');

    // ── Background discovery ──
    // Fire-and-forget: não bloqueia o usuário
    try {
        runDiscoveryBackground(providers);
    } catch (err) {
        rootLogger.debug(`Background discovery spawn failed: ${String(err)}`);
    }
}

if (!process.env['VITEST'] && process.argv[1]?.includes('smartwizard-llm')) {
    main().catch((err) => {
        process.stderr.write(`SmartWizard LLM failed: ${String(err)}\n`);
        process.exit(1);
    });
}
