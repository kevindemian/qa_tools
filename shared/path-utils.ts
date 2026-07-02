import path from 'node:path';

/**
 * Sanitize a path to prevent path traversal attacks.
 */
export function sanitizePath(base: string, untrustedPath: string): string {
    const resolved = path.resolve(base, untrustedPath);
    const normalizedBase = path.resolve(base);
    if (!resolved.startsWith(normalizedBase + path.sep) && resolved !== normalizedBase) {
        throw new Error(`Path traversal detected: ${untrustedPath} escapes ${base}`);
    }
    return resolved;
}
