/** Temporary directory management: reports, ephemeral files, and cleanup handlers. */
import { resolve, join } from 'path';
import { mkdirSync, writeFileSync, existsSync, rmSync } from 'fs';
import Config from './config';
import { formatDateISO } from './date-utils';

const PROJECT_ROOT = resolve(__dirname, '..');

function resolveEnvOrPath(envVar: string, defaultValue: string): string {
    return Config.get(envVar) ? resolve(Config.get(envVar)) : join(PROJECT_ROOT, defaultValue);
}

/** Absolute path to the reports directory (overridable via `QA_TOOLS_REPORTS_DIR`). */
export function reportsDir(): string {
    return resolveEnvOrPath('QA_TOOLS_REPORTS_DIR', 'reports');
}

/** @internal Not part of public API. Logging uses `rootLogger` directly. */
/** Absolute path to the logs directory (overridable via `LOG_DIR` or `QA_TOOLS_LOGS_DIR`). */
export function logsDir(): string {
    if (Config.get('QA_TOOLS_LOGS_DIR')) return resolve(Config.get('QA_TOOLS_LOGS_DIR'));
    return resolveEnvOrPath('LOG_DIR', 'logs');
}

function tempDir(): string {
    return resolveEnvOrPath('QA_TOOLS_TEMP_DIR', 'temp');
}

/** Write a dated report file under `reportsDir/YYYY-MM-DD/`. Creates intermediate dirs. */
export function writeReport(filename: string, content: string): string {
    const dir = reportsDir();
    const dateStr = formatDateISO();
    const targetDir = join(dir, dateStr);
    mkdirSync(targetDir, { recursive: true });
    const filepath = join(targetDir, filename);
    writeFileSync(filepath, content, 'utf8');
    return filepath;
}

/** Write a temp file under `tempDir/{category}/`. Cleaned up on exit via {@link registerCleanup}. */
export function writeEphemeral(category: string, filename: string, content: string): string {
    const dir = join(tempDir(), category);
    mkdirSync(dir, { recursive: true });
    const filepath = join(dir, filename);
    writeFileSync(filepath, content, 'utf8');
    return filepath;
}

/** Get the absolute temp directory path. */
export function tempDirPath(): string {
    return tempDir();
}

/** Create all required subdirectories (temp/previews, temp/vars, temp/cache, reports, logs). */
export function ensureDirs(): void {
    mkdirSync(join(tempDir(), 'previews'), { recursive: true });
    mkdirSync(join(tempDir(), 'vars'), { recursive: true });
    mkdirSync(join(tempDir(), 'cache'), { recursive: true });
    mkdirSync(reportsDir(), { recursive: true });
    mkdirSync(logsDir(), { recursive: true });
}

/** Register SIGINT/SIGTERM/exit handlers to clean up temp subdirectories. */
export function registerCleanup(): void {
    const handler = () => {
        const td = tempDir();
        for (const sub of ['previews', 'vars', 'cache']) {
            const p = join(td, sub);
            try {
                if (existsSync(p)) rmSync(p, { recursive: true, force: true });
            } catch {
                /* cleanup — temp dir pode não existir ainda */
            }
        }
    };
    process.on('SIGINT', handler);
    process.on('SIGTERM', handler);
    process.on('exit', handler);
}
