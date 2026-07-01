/**
 * config-validator.ts — Runtime config validation driven by CONFIG_SCHEMA.
 *
 * Validates:
 * 1. Required env vars are set (validateRequiredEnv)
 * 2. All config values match their declared type and allowedValues (validateConfigValues)
 * 3. Unknown env vars are detected (warnUnknownEnv)
 *
 * Data-driven from CONFIG_SCHEMA — adding a new entry with allowedValues
 * automatically enables validation. Prevents config drift between
 * schema, defaults, and runtime checks.
 *
 * Note: This module does NOT import rootLogger directly to avoid
 * circular dependency (logger → Config → config-validator → logger).
 * Callers are responsible for logging warnings.
 */
import { CONFIG_SCHEMA } from './config-schema.js';

const REQUIRED_ENV: Array<{ key: string; label: string }> = [
    { key: 'JIRA_BASE_URL', label: 'Jira base URL' },
    { key: 'JIRA_PERSONAL_TOKEN', label: 'Jira personal token' },
    { key: 'XRAY_BASE_URL', label: 'Xray base URL' },
];

export function validateRequiredEnv(): void {
    for (const r of REQUIRED_ENV) {
        if (!process.env[r.key]) {
            throw new Error(`${r.label} (${r.key}) não definido. Configure no .env ou exporte a variável.`);
        }
    }
}

const BOOLEAN_TRUE = new Set(['true', '1', 'yes']);
const BOOLEAN_FALSE = new Set(['false', '0', 'no']);

/**
 * Validate all config values against CONFIG_SCHEMA.
 * Checks:
 * - Boolean env vars are valid boolean strings
 * - Number env vars are parseable numbers
 * - String env vars with allowedValues match one of the allowed values
 *
 * Returns an array of warning messages for non-critical issues.
 * Call during startup after env is loaded.
 */
function fmtDefault(val: unknown, fallback: string): string {
    if (val === undefined || val === null) return fallback;
    if (typeof val === 'string') return val;
    if (typeof val === 'number' || typeof val === 'boolean') return String(val);
    return fallback;
}

function checkBooleanEnv(
    f: { envVar: string; type: string; defaultVal?: unknown },
    raw: string,
    warnings: string[],
): void {
    if (f.type !== 'boolean') return;
    if (!BOOLEAN_TRUE.has(raw.toLowerCase()) && !BOOLEAN_FALSE.has(raw.toLowerCase())) {
        warnings.push(
            `${f.envVar}="${raw}" não é um valor booleano válido. Esperado: true/false/1/0. Usando default: ${fmtDefault(f.defaultVal, 'false')}.`,
        );
    }
}

function checkNumberEnv(
    f: { envVar: string; type: string; defaultVal?: unknown },
    raw: string,
    warnings: string[],
): void {
    if (f.type !== 'number') return;
    const num = Number(raw);
    if (!Number.isFinite(num)) {
        warnings.push(`${f.envVar}="${raw}" não é um número válido. Usando default: ${fmtDefault(f.defaultVal, '0')}.`);
    }
}

function checkAllowedValues(
    f: { envVar: string; allowedValues?: string[]; defaultVal?: unknown },
    raw: string,
    warnings: string[],
): void {
    if (!f.allowedValues || f.allowedValues.length === 0) return;
    const val = raw.trim();
    if (val !== '' && !f.allowedValues.includes(val)) {
        warnings.push(
            `${f.envVar}="${val}" não é um valor válido. Permitidos: ${f.allowedValues.join(', ')}. Usando default: ${fmtDefault(f.defaultVal, '')}.`,
        );
    }
}

export function validateConfigValues(): string[] {
    const warnings: string[] = [];

    for (const f of CONFIG_SCHEMA) {
        const raw = process.env[f.envVar];
        if (raw === undefined) continue;

        checkBooleanEnv(f, raw, warnings);
        checkNumberEnv(f, raw, warnings);
        checkAllowedValues(f, raw, warnings);
    }

    return warnings;
}

/**
 * Detect environment variables that are set but not declared in CONFIG_SCHEMA.
 * These are likely typos or leftover config and should be flagged.
 *
 * Returns an array of warning messages. Call during startup.
 */
export function warnUnknownEnv(): string[] {
    const known = new Set(CONFIG_SCHEMA.map((f) => f.envVar));
    known.add('HOME');
    known.add('USERPROFILE');
    known.add('SHELL');
    known.add('TERM');
    known.add('PATH');
    known.add('PWD');
    known.add('TEMP');
    known.add('TMP');
    known.add('NODE_ENV');
    known.add('XDG_STATE_HOME');
    known.add('GIT_TERMINAL_PROMPT');
    known.add('GIT_PREFIX');
    known.add('GIT_PUSH_NO_VERIFY');
    known.add('GIT_DIR');
    known.add('GIT_WORK_TREE');
    known.add('GIT_INDEX_FILE');
    known.add('GIT_OBJECT_DIRECTORY');
    known.add('GIT_ALTERNATE_OBJECT_DIRECTORIES');
    known.add('GIT_SSH');
    known.add('GIT_SSH_COMMAND');
    known.add('GIT_ASKPASS');
    known.add('GIT_AUTHOR_NAME');
    known.add('GIT_AUTHOR_EMAIL');
    known.add('GIT_COMMITTER_NAME');
    known.add('GIT_COMMITTER_EMAIL');
    known.add('SSH_AUTH_SOCK');
    known.add('SSH_AGENT_PID');
    known.add('SSH_CLIENT');
    known.add('SSH_CONNECTION');
    known.add('DISPLAY');
    known.add('LANG');
    known.add('LC_ALL');
    known.add('LC_MESSAGES');
    known.add('LC_CTYPE');

    const warnings: string[] = [];
    const knownPrefixes = [
        'QA_',
        'LLM_',
        'JIRA_',
        'XRAY_',
        'GIT',
        'GITHUB_',
        'CYPRESS_',
        'CSV_',
        'DRY_',
        'DEBUG',
        'QUIET',
        'ON_',
        'LOG_',
        'AUTO_',
        'KNOWN_',
        'REPORT_',
        'METRICS_',
        'SKIP_',
        'NO_',
        'OPENCODE_',
        'BENCHMARK',
        'AWS_',
        'CI_',
    ];
    for (const k of Object.keys(process.env)) {
        if (!known.has(k) && knownPrefixes.some((prefix) => k.startsWith(prefix))) {
            warnings.push(
                `Variável de ambiente desconhecida: ${k}. Verifique se é um typo ou adicione ao CONFIG_SCHEMA.`,
            );
        }
    }

    return warnings;
}

/**
 * Run all validations. Intended for startup use.
 * Throws on missing required vars, returns warnings for others.
 * @param logFn optional logging function (e.g., rootLogger.warn) to emit warnings
 */
export function validateAll(logFn?: (msg: string) => void): void {
    validateRequiredEnv();

    const valueWarnings = validateConfigValues();
    for (const w of valueWarnings) {
        if (logFn) logFn(w);
    }

    const unknownWarnings = warnUnknownEnv();
    for (const w of unknownWarnings) {
        if (logFn) logFn(w);
    }
}
