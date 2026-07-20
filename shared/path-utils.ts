import path from 'node:path';

/**
 * Resolve a path and reject traversal sequences (../) that escape the base directory.
 * Unlike a strict confinement check, this allows absolute paths and paths outside base
 * as long as they don't use ../ to escape.
 */
export function sanitizePath(base: string, untrustedPath: string): string {
    const resolved = path.resolve(base, untrustedPath);
    const normalizedBase = path.resolve(base);
    const rel = path.relative(normalizedBase, resolved);
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
        throw new Error(`Path traversal detected: ${untrustedPath}`);
    }
    return resolved;
}
