import os from 'node:os';
import path from 'node:path';

/** Strict allowlist for project names. Rejects empty, `..`, absolute and separator chars (path traversal guard). */
const PROJECT_NAME_RE = /^[A-Za-z0-9._-]+$/;

export function isValidProjectName(name: string): boolean {
    return typeof name === 'string' && PROJECT_NAME_RE.test(name);
}

/** XDG config root for qa-tools registry/overlays (D-E2). Pure: no logger/config dependency. */
export function registryDir(): string {
    const xdg = process.env['XDG_CONFIG_HOME'];
    const base = xdg ? path.join(xdg, 'qa-tools') : path.join(os.homedir(), '.config', 'qa-tools');
    return base;
}

/** Per-project config directory inside the XDG qa-tools config root. Throws on invalid name. */
export function projectConfigDir(name: string): string {
    if (!isValidProjectName(name)) throw new Error('Nome de projeto inválido (path traversal): ' + name);
    return path.join(registryDir(), name);
}

/** Per-project `.env` overlay path (D-E1/D-E3). Throws on invalid name. */
export function projectEnvPath(name: string): string {
    if (!isValidProjectName(name)) throw new Error('Nome de projeto inválido (path traversal): ' + name);
    return path.join(registryDir(), name, '.env');
}
