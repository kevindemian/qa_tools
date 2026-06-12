#!/usr/bin/env node
/**
 * verify-registry.ts — Validate model-registry.json structure and integrity.
 *
 * Runs in CI to catch corrupted or invalid registry files.
 *
 * Usage:
 *   npx tsx scripts/verify-registry.ts
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REGISTRY_PATH = resolve(__dirname, '..', 'data', 'model-registry.json');

interface ValidationError {
    path: string;
    message: string;
}

const VALID_TIERS = new Set(['main', 'fast', 'reviewer', 'report', 'fallback', 'batch']);

function validateRegistry(): ValidationError[] {
    const errors: ValidationError[] = [];

    let content: string;
    try {
        content = readFileSync(REGISTRY_PATH, 'utf8');
    } catch (err) {
        errors.push({
            path: '',
            message: `Cannot read registry file: ${err instanceof Error ? err.message : String(err)}`,
        });
        return errors;
    }

    let data: unknown;
    try {
        data = JSON.parse(content);
    } catch (err) {
        errors.push({ path: '', message: `Invalid JSON: ${err instanceof Error ? err.message : String(err)}` });
        return errors;
    }

    if (typeof data !== 'object' || data === null) {
        errors.push({ path: '', message: 'Root must be an object' });
        return errors;
    }

    const root = data as Record<string, unknown>;

    const version = root['version'];
    if (typeof version !== 'number' || version < 1) {
        errors.push({ path: 'version', message: 'Must be a positive integer >= 1' });
    }

    const updated = root['updated'];
    if (typeof updated !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(updated)) {
        errors.push({ path: 'updated', message: 'Must be an ISO date (YYYY-MM-DD)' });
    }

    if (typeof root['providers'] !== 'object' || root['providers'] === null) {
        errors.push({ path: 'providers', message: 'Must be an object' });
        return errors;
    }

    const providers = root['providers'] as Record<string, unknown>;

    for (const [providerName, providerModels] of Object.entries(providers)) {
        if (!Array.isArray(providerModels)) {
            errors.push({ path: `providers.${providerName}`, message: 'Must be an array' });
            continue;
        }

        for (let i = 0; i < providerModels.length; i++) {
            const model = providerModels[i] as Record<string, unknown>;
            const prefix = `providers.${providerName}[${i}]`;

            const id = model['id'];
            if (typeof id !== 'string' || id.length === 0) {
                errors.push({ path: `${prefix}.id`, message: 'Must be a non-empty string' });
            }

            if (!Array.isArray(model['tiers'])) {
                errors.push({ path: `${prefix}.tiers`, message: 'Must be an array' });
            } else {
                const tiers = model['tiers'] as string[];
                for (let j = 0; j < tiers.length; j++) {
                    const tier = tiers[j];
                    if (tier === undefined || !VALID_TIERS.has(tier)) {
                        errors.push({
                            path: `${prefix}.tiers[${j}]`,
                            message: `Invalid tier "${tier}". Valid: ${[...VALID_TIERS].join(', ')}`,
                        });
                    }
                }
            }

            const ctx = model['context'];
            if (ctx !== undefined && (typeof ctx !== 'number' || ctx < 0)) {
                errors.push({ path: `${prefix}.context`, message: 'Must be a non-negative integer' });
            }

            const costPrompt = model['costPer1kPrompt'];
            if (costPrompt !== undefined && (typeof costPrompt !== 'number' || costPrompt < 0)) {
                errors.push({ path: `${prefix}.costPer1kPrompt`, message: 'Must be a non-negative number' });
            }

            const costCompletion = model['costPer1kCompletion'];
            if (costCompletion !== undefined && (typeof costCompletion !== 'number' || costCompletion < 0)) {
                errors.push({ path: `${prefix}.costPer1kCompletion`, message: 'Must be a non-negative number' });
            }

            const capabilities = model['capabilities'];
            if (capabilities !== undefined) {
                if (!Array.isArray(capabilities) || !capabilities.every((c): c is string => typeof c === 'string')) {
                    errors.push({ path: `${prefix}.capabilities`, message: 'Must be an array of strings' });
                }
            }
        }
    }

    return errors;
}

export { validateRegistry };

function main(): void {
    const errors = validateRegistry();

    if (errors.length === 0) {
        process.stdout.write('✅ model-registry.json is valid.\n');
        return;
    }

    process.stderr.write(`❌ ${errors.length} validation error(s) in model-registry.json:\n\n`);
    for (const err of errors) {
        process.stderr.write(`   ${err.path}: ${err.message}\n`);
    }

    process.exitCode = 1;
}

if (!process.env['VITEST'] && process.argv[1]?.includes('verify-registry')) {
    main();
}
