import dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import { isValidProjectName, projectEnvPath } from './project-paths.js';

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
        const content = fs.readFileSync(path.resolve(filePath), 'utf-8');
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

    const isTest = process.env['VITEST'] === 'true' || process.env['NODE_ENV'] === 'test';

    if (isTest) {
        loadTestEnv(projectRoot);
        dotenvLoaded = true;
        return;
    }

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

    // Per-project `.env` overlay (D-E1/D-E3): project-specific values win over globals.
    const current = process.env['QA_CURRENT_PROJECT'];
    if (current && isValidProjectName(current)) {
        applyProjectEnvOverlay(current);
    } else if (current) {
        getRootLogger()
            .then((l) => l.warn('[env-loader] QA_CURRENT_PROJECT inválido, overlay ignorado: ' + current))
            .catch((err: unknown) => {
                process.stderr.write(
                    '[env-loader] Logger init failed: ' + (err instanceof Error ? err.message : String(err)) + '\n',
                );
            });
    }

    dotenvLoaded = true;
}

/**
 * Test-mode env loading: prefer the hermetic `.env.test` sandbox so automated
 * tests never read production URLs/tokens from `.env.local`. `.env.test.local`
 * (gitignored, local-only overrides) takes priority over `.env.test` when present.
 */
function loadTestEnv(projectRoot: string): void {
    const testLocalPath = path.join(projectRoot, '.env.test.local');
    const testPath = path.join(projectRoot, '.env.test');

    for (const filePath of [testLocalPath, testPath]) {
        try {
            dotenv.config({ path: filePath });
        } catch (err) {
            process.stderr.write(
                '[env-loader] Failed to load ' +
                    filePath +
                    ' (optional): ' +
                    (err instanceof Error ? err.message : String(err)) +
                    '\n',
            );
        }
    }

    warnSecretsInFile(testPath, '.env.test');
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

/**
 * Apply the per-project `.env` overlay (D-E1/D-E3) for the given project. Project-specific values win over
 * globals. No-op (explicit, never silent) when the project name is empty/invalid or the overlay file is absent.
 * A malformed overlay file is an explicit error (not swallowed).
 */
export function applyProjectEnvOverlay(name: string): void {
    if (!name) return;
    if (!isValidProjectName(name)) throw new Error('Nome de projeto inválido (path traversal): ' + name);

    const filePath = projectEnvPath(name);
    if (!fs.existsSync(filePath)) return;

    try {
        const parsed = dotenv.parse(fs.readFileSync(filePath, 'utf8'));
        for (const [k, v] of Object.entries(parsed)) {
            process.env[k] = v;
        }
    } catch (err: unknown) {
        getRootLogger()
            .then((l) =>
                l.error(
                    '[env-loader] Falha ao aplicar overlay do projeto "' +
                        name +
                        '": ' +
                        (err instanceof Error ? err.message : String(err)),
                ),
            )
            .catch((e2: unknown) => {
                process.stderr.write(
                    '[env-loader] Logger init failed: ' + (e2 instanceof Error ? e2.message : String(e2)) + '\n',
                );
            });
        throw err;
    }
}
