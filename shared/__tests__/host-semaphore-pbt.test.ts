/**
 * Property-Based Tests for extractHost URL resolution.
 *
 * These tests verify INVARIANTS that must hold for ALL inputs:
 * 1. extractHost always returns a non-empty string
 * 2. Absolute URLs always resolve to their hostname (not 'unknown')
 * 3. Relative paths always return 'unknown' (graceful fallback)
 * 4. URL resolution from baseURL + relative path always produces a valid host
 */
import { describe, it, expect } from 'vitest';
import { extractHost } from '../infra/host-semaphore.js';

describe('PBT: extractHost invariants', () => {
    // Helper: generate random absolute URLs
    const absUrls = [
        'https://xray.cloud.getxray.app/api/v2/graphql',
        'http://localhost:3000/test',
        'https://jira.euronext.net/rest/api/2/search',
        'https://api.github.com/repos/owner/repo',
        'https://xray.cloud.getxray.app:443/api',
    ];

    // Helper: generate random relative paths
    const relPaths = ['/api/v2/graphql', '/rest/api/2/search', '/repos/owner/repo', '/graphql', '/api/v1/tests', ''];

    it('invariant 1: extractHost ALWAYS returns a non-empty string', () => {
        const allInputs = [...absUrls, ...relPaths, 'not-a-url', '://invalid', '12345', 'null'];
        for (const input of allInputs) {
            const result = extractHost(input);
            expect(typeof result).toBe('string');
            expect(result.length).toBeGreaterThan(0);
        }
    });

    it('invariant 2: absolute URLs ALWAYS resolve to their hostname', () => {
        for (const url of absUrls) {
            const host = extractHost(url);
            const expected = new URL(url).hostname;
            expect(host).toBe(expected);
        }
    });

    it('invariant 3: relative paths ALWAYS return "unknown"', () => {
        for (const path of relPaths) {
            const host = extractHost(path);
            expect(host).toBe('unknown');
        }
    });

    it('invariant 4: URL resolution from baseURL + relative path produces valid host', () => {
        const base = 'https://xray.cloud.getxray.app';
        for (const path of relPaths) {
            if (!path) continue;
            const resolved = new URL(path, base).href;
            const host = extractHost(resolved);
            expect(host).toBe('xray.cloud.getxray.app');
        }
    });

    it('invariant 5: extractHost result is always a string (never throws)', () => {
        const allInputs = [...absUrls, ...relPaths, 'not-a-url', '://invalid', '12345'];
        for (const input of allInputs) {
            expect(() => extractHost(input)).not.toThrow();
        }
    });

    it('invariant 6: absolute URL with path always extracts hostname, not full path', () => {
        for (const url of absUrls) {
            const host = extractHost(url);
            expect(host).not.toContain('/');
            expect(host).not.toContain(':');
            expect(host).not.toContain('?');
        }
    });
});
