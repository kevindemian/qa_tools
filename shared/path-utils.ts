import path from 'node:path';

/**
 * Resolve a path and reject traversal sequences (../) that escape the base directory.
 * Unlike a strict confinement check, this allows absolute paths and paths outside base
 * as long as they don't use ../ to escape.
 */
export function sanitizePath(base: string, untrustedPath: string): string {
    const normalized = path.normalize(untrustedPath);
    if (normalized.includes('..')) {
        throw new Error(`Path traversal detected: ${untrustedPath} contains ..`);
    }
    return path.resolve(base, untrustedPath);
}
