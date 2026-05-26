import { resolve, join } from 'path';
/* eslint-disable @typescript-eslint/no-require-imports -- lazy fs to avoid jest mock pollution */

const PROJECT_ROOT = resolve(__dirname, '..');

function resolveEnvOrPath(envVar: string, defaultValue: string): string {
    return process.env[envVar] ? resolve(process.env[envVar]) : join(PROJECT_ROOT, defaultValue);
}

function reportsDir(): string {
    return resolveEnvOrPath('QA_TOOLS_REPORTS_DIR', 'reports');
}

function logsDir(): string {
    return resolveEnvOrPath('LOG_DIR', 'logs');
}

function tempDir(): string {
    return resolveEnvOrPath('QA_TOOLS_TEMP_DIR', 'temp');
}

export function writeReport(filename: string, content: string): string {
    const dir = reportsDir();
    require('fs').mkdirSync(dir, { recursive: true });
    const filepath = join(dir, filename);
    require('fs').writeFileSync(filepath, content, 'utf8');
    return filepath;
}

export function writeEphemeral(category: string, filename: string, content: string): string {
    const dir = join(tempDir(), category);
    require('fs').mkdirSync(dir, { recursive: true });
    const filepath = join(dir, filename);
    require('fs').writeFileSync(filepath, content, 'utf8');
    return filepath;
}

export function reportsDirPath(): string {
    return reportsDir();
}

export function logsDirPath(): string {
    return logsDir();
}

export function tempDirPath(): string {
    return tempDir();
}

export function ensureDirs(): void {
    const fs = require('fs');
    fs.mkdirSync(join(tempDir(), 'previews'), { recursive: true });
    fs.mkdirSync(join(tempDir(), 'vars'), { recursive: true });
    fs.mkdirSync(join(tempDir(), 'cache'), { recursive: true });
    fs.mkdirSync(reportsDir(), { recursive: true });
    fs.mkdirSync(logsDir(), { recursive: true });
}

export function registerCleanup(): void {
    const handler = () => {
        const fs = require('fs');
        const td = tempDir();
        for (const sub of ['previews', 'vars', 'cache']) {
            const p = join(td, sub);
            try {
                if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true });
            } catch {
                /* ok */
            }
        }
    };
    process.on('SIGINT', handler);
    process.on('SIGTERM', handler);
    process.on('exit', handler);
}

export function cleanEphemeralPublic(): void {
    const fs = require('fs');
    const td = tempDir();
    for (const sub of ['previews', 'vars', 'cache']) {
        const p = join(td, sub);
        try {
            if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true });
        } catch {
            /* ok */
        }
    }
}
