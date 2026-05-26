import { resolve, join } from 'path';
import { mkdirSync, writeFileSync, existsSync, rmSync } from 'fs';

const PROJECT_ROOT = resolve(__dirname, '..');

function resolveEnvOrPath(envVar: string, defaultValue: string): string {
    return process.env[envVar] ? resolve(process.env[envVar]) : join(PROJECT_ROOT, defaultValue);
}

export function reportsDir(): string {
    return resolveEnvOrPath('QA_TOOLS_REPORTS_DIR', 'reports');
}

export function logsDir(): string {
    if (process.env.QA_TOOLS_LOGS_DIR) return resolve(process.env.QA_TOOLS_LOGS_DIR);
    return resolveEnvOrPath('LOG_DIR', 'logs');
}

function tempDir(): string {
    return resolveEnvOrPath('QA_TOOLS_TEMP_DIR', 'temp');
}

export function writeReport(filename: string, content: string): string {
    const dir = reportsDir();
    const dateStr = new Date().toISOString().slice(0, 10);
    const targetDir = join(dir, dateStr);
    mkdirSync(targetDir, { recursive: true });
    const filepath = join(targetDir, filename);
    writeFileSync(filepath, content, 'utf8');
    return filepath;
}

export function writeEphemeral(category: string, filename: string, content: string): string {
    const dir = join(tempDir(), category);
    mkdirSync(dir, { recursive: true });
    const filepath = join(dir, filename);
    writeFileSync(filepath, content, 'utf8');
    return filepath;
}

export function tempDirPath(): string {
    return tempDir();
}

export function ensureDirs(): void {
    mkdirSync(join(tempDir(), 'previews'), { recursive: true });
    mkdirSync(join(tempDir(), 'vars'), { recursive: true });
    mkdirSync(join(tempDir(), 'cache'), { recursive: true });
    mkdirSync(reportsDir(), { recursive: true });
    mkdirSync(logsDir(), { recursive: true });
}

export function registerCleanup(): void {
    const handler = () => {
        const td = tempDir();
        for (const sub of ['previews', 'vars', 'cache']) {
            const p = join(td, sub);
            try {
                if (existsSync(p)) rmSync(p, { recursive: true, force: true });
            } catch {
                /* ok */
            }
        }
    };
    process.on('SIGINT', handler);
    process.on('SIGTERM', handler);
    process.on('exit', handler);
}
