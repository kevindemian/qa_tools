/** Temporary directory management: reports, ephemeral files, and cleanup handlers. */
import path from 'path';
import { resolve, join } from 'path';
import { mkdirSync, writeFileSync, existsSync, rmSync } from 'fs';
import Config from '../config-accessor.js';
import { formatDateISO } from '../date-utils.js';
import { rootLogger } from '../logger.js';
import { getCurrentProjectDir } from '../project-context.js';

const PROJECT_ROOT = resolve(import.meta.dirname, '..', '..');

/** Validate that a resolved path is within the expected base directory. */
function isPathWithinBase(resolvedPath: string, baseDir: string): boolean {
    const normalized = path.resolve(resolvedPath);
    const normalizedBase = path.resolve(baseDir);
    return normalized.startsWith(normalizedBase + path.sep) || normalized === normalizedBase;
}

function resolveEnvOrPath(envVar: string, defaultValue: string): string {
    return Config.get(envVar) ? resolve(Config.get(envVar)) : join(PROJECT_ROOT, defaultValue);
}

/**
 * Resolve `<projectDir>/.qa-tools/<sub>` quando um projeto está ativo (selecionado na Fase 2).
 * Retorna `undefined` em modo legado (sem projeto) para que o caller aplique seu fallback.
 * Safeguard: ignora `qaProjectDir` não-absoluto (nunca deve ocorrer — validado por `setCurrentProject`).
 */
function projectScopedDir(sub: string): string | undefined {
    const d = getCurrentProjectDir();
    if (!d || !path.isAbsolute(d)) return undefined;
    return join(d, '.qa-tools', sub);
}

/**
 * Absolute path to the reports directory.
 * Precedência (alternativa tecnicamente superior, Regra 25 — zero silenciamento): o env-override
 * explícito do operador (`QA_TOOLS_REPORTS_DIR`) vence o diretório do projeto ativo, que vence o
 * default `PROJECT_ROOT/reports`. Isso preserva escolha explícita do operador sem regressão silenciosa.
 */
export function reportsDir(): string {
    const env = Config.get('QA_TOOLS_REPORTS_DIR');
    if (env) return resolve(env);
    return projectScopedDir('reports') ?? join(PROJECT_ROOT, 'reports');
}

/** @internal Not part of public API. Logging uses `rootLogger` directly. */
/**
 * Absolute path to the logs directory.
 * Precedência: env-override (`QA_TOOLS_LOGS_DIR`) vence o projeto ativo, que vence `LOG_DIR`/`PROJECT_ROOT/logs`.
 */
export function logsDir(): string {
    const env = Config.get('QA_TOOLS_LOGS_DIR');
    if (env) return resolve(env);
    return projectScopedDir('logs') ?? resolveEnvOrPath('LOG_DIR', 'logs');
}

/**
 * Absolute path to the artifacts directory (CI/test artifacts).
 * Precedência: env-override (`QA_TOOLS_ARTIFACTS_DIR`) vence o projeto ativo (`<proj>/.qa-tools/artifacts`),
 * que vence o default `PROJECT_ROOT/artifacts`.
 */
export function artifactsDir(): string {
    const env = Config.get('QA_TOOLS_ARTIFACTS_DIR');
    if (env) return resolve(env);
    return projectScopedDir('artifacts') ?? join(PROJECT_ROOT, 'artifacts');
}

function tempDir(): string {
    return resolveEnvOrPath('QA_TOOLS_TEMP_DIR', 'temp');
}

/** Write a dated report file under `reportsDir/YYYY-MM-DD/`. Creates intermediate dirs. */
export function writeReport(filename: string, content: string): string {
    const dir = reportsDir();
    const dateStr = formatDateISO();
    const targetDir = join(dir, dateStr);
    try {
        const resolvedDir = path.resolve(targetDir);
        if (!isPathWithinBase(resolvedDir, dir)) {
            rootLogger.warn('writeReport: path traversal blocked');
            throw new Error('Path traversal detected');
        }
        mkdirSync(resolvedDir, { recursive: true });
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        rootLogger.warn(
            `writeReport: failed to create directory ${targetDir} (${msg}). Verify permissions and disk space.`,
        );
        throw err;
    }
    const filepath = join(targetDir, filename);
    try {
        const resolvedFile = path.resolve(filepath);
        if (!isPathWithinBase(resolvedFile, dir)) {
            rootLogger.warn('writeReport: path traversal blocked');
            throw new Error('Path traversal detected');
        }
        writeFileSync(resolvedFile, content, 'utf8');
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        rootLogger.warn(`writeReport: failed to write ${filepath} (${msg}). Verify disk space and permissions.`);
        throw err;
    }
    return filepath;
}

/** Write a temp file under `tempDir/{category}/`. Cleaned up on exit via {@link registerCleanup}. */
export function writeEphemeral(category: string, filename: string, content: string): string {
    const dir = join(tempDir(), category);
    try {
        const resolvedDir = path.resolve(dir);
        if (!isPathWithinBase(resolvedDir, tempDir())) {
            rootLogger.warn('writeEphemeral: path traversal blocked');
            throw new Error('Path traversal detected');
        }
        mkdirSync(resolvedDir, { recursive: true });
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        rootLogger.warn(
            `writeEphemeral: failed to create directory ${dir} (${msg}). Verify permissions and disk space.`,
        );
        throw err;
    }
    const filepath = join(dir, filename);
    try {
        const resolvedFile = path.resolve(filepath);
        if (!isPathWithinBase(resolvedFile, tempDir())) {
            rootLogger.warn('writeEphemeral: path traversal blocked');
            throw new Error('Path traversal detected');
        }
        writeFileSync(resolvedFile, content, 'utf8');
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        rootLogger.warn(`writeEphemeral: failed to write ${filepath} (${msg}). Verify disk space and permissions.`);
        throw err;
    }
    return filepath;
}

/** Get the absolute temp directory path. */
export function tempDirPath(): string {
    return tempDir();
}

/** Create all required subdirectories (temp/previews, temp/vars, temp/cache, reports, logs). */
export function ensureDirs(): void {
    const dirs = [
        join(tempDir(), 'previews'),
        join(tempDir(), 'vars'),
        join(tempDir(), 'cache'),
        reportsDir(),
        logsDir(),
    ];
    for (const dir of dirs) {
        try {
            const resolvedDir = path.resolve(dir);
            let baseDir: string;
            if (dir.includes('reports')) {
                baseDir = reportsDir();
            } else if (dir.includes('logs')) {
                baseDir = logsDir();
            } else {
                baseDir = tempDir();
            }
            if (!isPathWithinBase(resolvedDir, baseDir)) {
                rootLogger.warn(`ensureDirs: path traversal blocked for ${dir}`);
                continue;
            }
            mkdirSync(resolvedDir, { recursive: true });
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            rootLogger.warn(`ensureDirs: failed to create ${dir} (${msg}). Verify permissions and disk space.`);
            throw err;
        }
    }
}

/** Clean up temporary subdirectories. Exported so SIGINT handler in cli_base.ts
 *  can call it on confirmed exit, avoiding the race condition where SIGINT
 *  from temp-dir.ts deletes files before the user confirms the exit prompt. */
export function cleanupTempDirs(): void {
    const td = tempDir();
    for (const sub of ['previews', 'vars', 'cache']) {
        const p = join(td, sub);
        try {
            const resolvedP = path.resolve(p);
            if (!isPathWithinBase(resolvedP, td)) {
                rootLogger.warn(`cleanupTempDirs: path traversal blocked for ${sub}`);
                continue;
            }
            if (existsSync(resolvedP)) rmSync(resolvedP, { recursive: true, force: true });
        } catch (err) {
            if (err instanceof Error && 'code' in err && err.code === 'ENOENT') {
                continue;
            }
            const msg = err instanceof Error ? err.message : String(err);
            rootLogger.warn(`cleanupTempDirs: failed to remove ${sub} (${msg}). Verify permissions and disk space.`);
        }
    }
}

/** Register cleanup handlers. SIGINT is intentionally NOT registered here —
 *  it is owned by cli_base.ts `setupSigint()` to avoid premature deletion
 *  before the user confirms exit. */
export function registerCleanup(): void {
    process.on('SIGTERM', cleanupTempDirs);
    process.on('exit', cleanupTempDirs);
}
