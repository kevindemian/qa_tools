import dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

let _rootLogger: { warn: (msg: string) => void; info: (msg: string) => void; error: (msg: string) => void } | null =
    null;
async function getRootLogger(): Promise<{
    warn: (msg: string) => void;
    info: (msg: string) => void;
    error: (msg: string) => void;
}> {
    if (!_rootLogger) {
        const mod = await import('./logger.js');
        _rootLogger = mod.rootLogger;
    }
    return _rootLogger;
}

let dotenvLoaded = false;

const SECRET_PATTERNS: { label: string; regex: RegExp }[] = [
    { label: 'GitHub PAT', regex: /^github_pat_/ },
    { label: 'OpenRouter key', regex: /^sk-or-v1-/ },
    { label: 'Groq key', regex: /^gsk_/ },
    { label: 'Gemini key', regex: /^AIza/ },
    { label: 'NVIDIA key', regex: /^nvapi-/ },
    { label: 'HuggingFace key', regex: /^hf_/ },
];

function hasSecretPattern(val: string): string | null {
    for (const p of SECRET_PATTERNS) {
        if (p.regex.test(val)) return p.label;
    }
    return null;
}

function warnSecretsInFile(filePath: string, label: string): void {
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n');
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) continue;
            const eqIdx = trimmed.indexOf('=');
            if (eqIdx === -1) continue;
            const val = trimmed.slice(eqIdx + 1);
            const match = hasSecretPattern(val);
            if (match) {
                getRootLogger()
                    .then((l) => l.warn(`[env-loader] WARNING: ${match} detected in ${label}. Move to .env.local.`))
                    .catch((err: unknown) => {
                        process.stderr.write(
                            '[env-loader] Logger init failed: ' +
                                (err instanceof Error ? err.message : String(err)) +
                                '\n',
                        );
                    });
            }
        }
    } catch (err) {
        process.stderr.write(
            '[env-loader] Could not read env file for secret scan (may not exist): ' +
                (err instanceof Error ? err.message : String(err)) +
                '\n',
        );
    }
}

/** Load `.env.local` (priority) then `.env` (fallback). Idempotent. */
export function ensureDotenv(): void {
    if (dotenvLoaded) return;
    const projectRoot = path.resolve(import.meta.dirname, '..');

    const localPath = path.join(projectRoot, '.env.local');
    const envPath = path.join(projectRoot, '.env');

    try {
        dotenv.config({ path: localPath });
    } catch (err) {
        process.stderr.write(
            '[env-loader] Failed to load .env.local (optional): ' +
                (err instanceof Error ? err.message : String(err)) +
                '\n',
        );
    }

    try {
        dotenv.config({ path: envPath });
    } catch (err) {
        process.stderr.write(
            '[env-loader] Failed to load .env (optional): ' + (err instanceof Error ? err.message : String(err)) + '\n',
        );
    }

    warnSecretsInFile(envPath, '.env');

    dotenvLoaded = true;
}

/** Read an env var with optional fallback. Calls `ensureDotenv` on each read. */
export function envVal(key: string, fallback = ''): string {
    ensureDotenv();
    return (Reflect.get(process.env, key) as string) || fallback;
}

/** Parse a string/boolean/undefined into a strict boolean. */
export function toBool(val: string | boolean | undefined): boolean {
    if (val === undefined) return false;
    if (typeof val === 'boolean') return val;
    return val === 'true';
}

/** Parse a string/number/undefined into an integer with a fallback default. */
export function toInt(val: string | number | undefined, fallback: number): number {
    if (val === undefined) return fallback;
    if (typeof val === 'number') return val;
    const n = parseInt(val, 10);
    return isNaN(n) ? fallback : n;
}

/**
 * Reload .env.local + .env into process.env.
 * Use after writing new values to .env.local (e.g., after SmartWizard LLM).
 * Safe to call multiple times — resets flag and re-reads.
 */
export function reloadDotenv(): void {
    dotenvLoaded = false;
    ensureDotenv();
}

/** Reset dotenv loaded flag for testing. */
export function __resetDotenvLoaded(): void {
    dotenvLoaded = false;
}
