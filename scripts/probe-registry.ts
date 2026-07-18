#!/usr/bin/env node
/**
 * probe-registry.ts — Weekly registry sweep: probe provider APIs + OpenRouter,
 * diff against registry, report changes, and optionally create a PR.
 *
 * Multi-source merge:
 *   1. Fetch OpenRouter model list (public, no key needed) for baseline context/capabilities
 *   2. Probe each configured provider API with its API key
 *   3. Merge OpenRouter context/capabilities into discovered models
 *   4. Diff against existing registry, report changes
 *
 * Usage:
 *   npx tsx scripts/probe-registry.ts                        # Probe all providers
 *   npx tsx scripts/probe-registry.ts --provider openai      # Probe specific provider
 *   npx tsx scripts/probe-registry.ts --pr                   # Create PR with changes
 *   npx tsx scripts/probe-registry.ts --dry-run              # Probe but don't write
 *
 * Environment variables (one per provider):
 *   LLM_API_KEY - used to probe the currently configured provider
 */
import path from 'path';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { discoverModels, assignTierHints } from '../shared/llm/model-discovery.js';
import { getAdapter } from '../shared/llm/model-adapter.js';
import type { RegistryModel } from '../shared/llm/model-resolver.js';
import type { LlmProvider } from '../shared/llm/llm-provider-profiles.js';
import { rootLogger } from '../shared/logger.js';

export { diffModels, writeMarkdownReport, parseArgs, getProviderModels, enrichFromOpenRouter };

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REGISTRY_PATH = resolve(__dirname, '..', 'data', 'model-registry.json');
const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models';
const OPENROUTER_TIMEOUT_MS = 10_000;

interface DiffItem {
    model: string;
}

interface ChangedItem extends DiffItem {
    field: string;
    old: unknown;
    new: unknown;
}

interface ProviderDiff {
    provider: string;
    added: DiffItem[];
    removed: DiffItem[];
    changed: ChangedItem[];
}

/**
 * Fetch OpenRouter model list (public, no key required) and return
 * a map of model ID → { context, capabilities } for enrichment.
 */
async function fetchOpenRouterContext(): Promise<Map<string, { context?: number; capabilities?: string[] }>> {
    const map = new Map<string, { context?: number; capabilities?: string[] }>();
    const adapter = getAdapter('openrouter');
    if (!adapter) return map;

    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), OPENROUTER_TIMEOUT_MS);
        const response = await fetch(OPENROUTER_MODELS_URL, { signal: controller.signal });
        clearTimeout(timer);

        if (!response.ok) return map;

        const body = await response.json();
        const entries = adapter.parseListResponse(body);

        for (const e of entries) {
            const entry: { context?: number; capabilities?: string[] } = {};
            if (e.context !== undefined) entry.context = e.context;
            if (e.capabilities !== undefined && e.capabilities.length > 0) entry.capabilities = e.capabilities;
            map.set(e.id, entry);
        }
    } catch (err) {
        rootLogger.warn('probe-registry: OpenRouter unavailable: ' + String(err));
    }
    return map;
}

/**
 * Enrich discovered models with OpenRouter context/capabilities.
 * OpenRouter data takes precedence for context (more accurate).
 */
function enrichFromOpenRouter(
    models: RegistryModel[],
    orMap: Map<string, { context?: number; capabilities?: string[] }>,
): void {
    for (const m of models) {
        const or = orMap.get(m.id);
        if (!or) continue;
        if (or.context !== undefined && or.context > 0) m.context = or.context;
        if (or.capabilities !== undefined && or.capabilities.length > 0) m.capabilities = or.capabilities;
    }
}

function loadRegistry(): { [key: string]: unknown } {
    const content = readFileSync(REGISTRY_PATH, 'utf8');
    return JSON.parse(content) as { [key: string]: unknown };
}

function getProviderModels(registry: { [key: string]: unknown }, provider: string): RegistryModel[] {
    const providers = registry['providers'] as { [key: string]: unknown } | undefined;
    if (!providers) return [];
    const providerEntries = Object.entries(providers);
    const providerEntry = providerEntries.find(([k]) => k === provider);
    const models = providerEntry?.[1];
    if (!Array.isArray(models)) return [];
    return models as RegistryModel[];
}

function detectFieldChanges(ex: RegistryModel, m: RegistryModel, report: ProviderDiff): void {
    if (ex.context !== m.context) {
        report.changed.push({ model: m.id, field: 'context', old: ex.context, new: m.context });
    }
    if (ex.costPer1kPrompt !== m.costPer1kPrompt) {
        report.changed.push({
            model: m.id,
            field: 'costPer1kPrompt',
            old: ex.costPer1kPrompt,
            new: m.costPer1kPrompt,
        });
    }
    if (ex.costPer1kCompletion !== m.costPer1kCompletion) {
        report.changed.push({
            model: m.id,
            field: 'costPer1kCompletion',
            old: ex.costPer1kCompletion,
            new: m.costPer1kCompletion,
        });
    }
}

function diffModels(discovered: RegistryModel[], existing: RegistryModel[], provider: string): ProviderDiff {
    const report: ProviderDiff = { provider, added: [], removed: [], changed: [] };
    const existingMap = new Map(existing.map((m) => [m.id, m]));
    const discoveredMap = new Map(discovered.map((m) => [m.id, m]));

    for (const m of discovered) {
        if (!existingMap.has(m.id)) {
            report.added.push({ model: m.id });
        } else {
            const ex = existingMap.get(m.id);
            if (!ex) continue;
            detectFieldChanges(ex, m, report);
        }
    }

    for (const m of existing) {
        if (!discoveredMap.has(m.id)) {
            report.removed.push({ model: m.id });
        }
    }

    return report;
}

function writeReportSection(lines: string[], r: ProviderDiff): void {
    if (r.added.length === 0 && r.removed.length === 0 && r.changed.length === 0) return;

    lines.push(`## ${r.provider}\n`);

    if (r.added.length > 0) {
        lines.push(`### Added (+${r.added.length})`);
        for (const a of r.added) {
            lines.push(`- \`${a.model}\``);
        }
        lines.push('');
    }

    if (r.removed.length > 0) {
        lines.push(`### Removed (-${r.removed.length})`);
        for (const rm of r.removed) {
            lines.push(`- \`${rm.model}\``);
        }
        lines.push('');
    }

    if (r.changed.length > 0) {
        lines.push(`### Changed (~${r.changed.length})`);
        for (const c of r.changed) {
            lines.push(`- \`${c.model}\`: ${c.field} ${String(c.old)} → ${String(c.new)}`);
        }
        lines.push('');
    }
}

function writeMarkdownReport(reports: ProviderDiff[], timestamp: string): string {
    const lines: string[] = [];
    let totalAdded = 0;
    let totalRemoved = 0;
    let totalChanged = 0;

    for (const r of reports) {
        totalAdded += r.added.length;
        totalRemoved += r.removed.length;
        totalChanged += r.changed.length;
    }

    lines.push(`# Model Registry Probe — ${timestamp}\n`);
    lines.push(`**Summary:** +${totalAdded} / -${totalRemoved} / ~${totalChanged} changed\n`);

    if (totalAdded === 0 && totalRemoved === 0 && totalChanged === 0) {
        lines.push('No changes detected.');
        return lines.join('\n');
    }

    for (const r of reports) {
        writeReportSection(lines, r);
    }

    return lines.join('\n');
}

function parseArgs(): { provider: string | null; dryRun: boolean; createPr: boolean } {
    const args = process.argv.slice(2);
    let provider: string | null = null;
    let dryRun = false;
    let createPr = false;

    for (let i = 0; i < args.length; i++) {
        const arg = Reflect.get(args, i);
        if (arg === '--provider' && i + 1 < args.length) {
            provider = Reflect.get(args, i + 1);
        } else if (arg === '--dry-run') {
            dryRun = true;
        } else if (arg === '--pr') {
            createPr = true;
        }
    }

    return { provider, dryRun, createPr };
}

function envVarForProvider(provider: string): string | null {
    const vars = new Map([
        ['openai', 'OPENAI_API_KEY'],
        ['anthropic', 'ANTHROPIC_API_KEY'],
        ['openrouter', 'OPENROUTER_API_KEY'],
        ['groq', 'GROQ_API_KEY'],
        ['gemini', 'GEMINI_API_KEY'],
    ]);
    const envName = vars.get(provider);
    if (envName) return Reflect.get(process.env, envName) ?? null;
    return process.env['LLM_API_KEY'] ?? null;
}

async function main(): Promise<void> {
    const { provider: targetProvider, dryRun, createPr } = parseArgs();
    const registry = loadRegistry();
    const providers = (registry['providers'] as { [key: string]: unknown } | undefined) ?? {};
    const timestamp = new Date().toISOString().split('T')[0] ?? 'unknown';
    const reports: ProviderDiff[] = [];

    // Step 1: Fetch OpenRouter baseline (public, no key)
    process.stdout.write('[openrouter] Fetching baseline context/capabilities...\n');
    const openRouterContext = await fetchOpenRouterContext();
    process.stdout.write(`[openrouter] ${openRouterContext.size} models loaded\n`);

    // Step 2: Probe each configured provider
    for (const providerName of Object.keys(providers)) {
        if (targetProvider && providerName !== targetProvider) continue;

        const apiKey = envVarForProvider(providerName);
        if (!apiKey) {
            process.stdout.write(`[${providerName}] No API key found, skipping\n`);
            continue;
        }

        process.stdout.write(`[${providerName}] Probing...\n`);
        const discovered = await discoverModels(providerName as LlmProvider, apiKey);
        if (discovered.length === 0) {
            process.stdout.write(`[${providerName}] No models discovered, skipping\n`);
            continue;
        }

        // Step 3: Enrich with OpenRouter context/capabilities
        enrichFromOpenRouter(discovered, openRouterContext);

        assignTierHints(discovered);
        const existing = getProviderModels(registry, providerName);
        const diff = diffModels(discovered, existing, providerName);
        reports.push(diff);

        process.stdout.write(
            `[${providerName}] ${discovered.length} models, +${diff.added.length}/-${diff.removed.length}/${diff.changed.length}\n`,
        );
    }

    if (reports.length === 0) {
        process.stdout.write('No providers probed. Nothing to report.\n');
        process.exit(0);
    }

    const report = writeMarkdownReport(reports, timestamp);

    if (dryRun) {
        process.stdout.write(report);
        process.stdout.write('\n');
        process.exit(0);
    }

    const outputPath = resolve(__dirname, '..', 'data', `registry-probe-${timestamp}.md`);
    writeFileSync(path.resolve(outputPath), report, 'utf8');
    process.stdout.write(`Report written to ${outputPath}\n`);

    if (createPr) {
        process.stdout.write('Creating PR...\n');
        const execFileSync = (await import('node:child_process')).execFileSync;
        execFileSync(
            'gh',
            ['pr', 'create', '--title', `Model Registry: weekly probe ${timestamp}`, '--body-file', outputPath],
            {
                stdio: 'inherit',
            },
        );
    }
}

if (!process.env['VITEST'] && process.argv[1]?.includes('probe-registry')) {
    main().catch((err) => {
        process.stderr.write(`Probe failed: ${String(err)}\n`);
        process.exit(1);
    });
}
