/**
 * Tests for extractHost URL resolution in axios interceptors.
 *
 * Bug: Axios interceptors pass relative paths (`/api/v2/graphql`) to `extractHost`.
 * `new URL('/api/v2/graphql')` throws → returns 'unknown' → per-host throttling defeated.
 *
 * Fix: Resolve full URL in interceptors using `cfg.baseURL + cfg.url`.
 * Test boundary: URL resolution logic (pure function, no mocks needed).
 */
import { describe, it, expect } from 'vitest';
import { extractHost } from '../infra/host-semaphore.js';

describe('extractHost: absolute URLs', () => {
    it('returns hostname for absolute HTTPS URL', () => {
        expect(extractHost('https://xray.cloud.getxray.app/api/v2/graphql')).toBe('xray.cloud.getxray.app');
    });

    it('returns hostname for absolute HTTP URL with port', () => {
        expect(extractHost('http://localhost:3000/api/test')).toBe('localhost');
    });

    it('returns hostname for URL with non-default port', () => {
        expect(extractHost('https://jira.euronext.net:8443/rest/api/2')).toBe('jira.euronext.net');
    });
});

describe('extractHost: relative paths', () => {
    it('returns "unknown" for relative path without warning', () => {
        const host = extractHost('/api/v2/graphql');
        expect(host).toBe('unknown');
    });

    it('returns "unknown" for empty string', () => {
        expect(extractHost('')).toBe('unknown');
    });

    it('returns "unknown" for invalid absolute URL', () => {
        expect(extractHost('not-a-url')).toBe('unknown');
    });

    it('returns "unknown" for malformed protocol', () => {
        expect(extractHost('://invalid')).toBe('unknown');
    });
});

describe('URL resolution: baseURL + relative path', () => {
    it('resolves baseURL + relative path to absolute URL', () => {
        const baseURL = 'https://xray.cloud.getxray.app';
        const url = '/api/v2/graphql';

        const resolved = new URL(url, baseURL).href;
        expect(resolved).toBe('https://xray.cloud.getxray.app/api/v2/graphql');
        expect(extractHost(resolved)).toBe('xray.cloud.getxray.app');
    });

    it('absolute URL ignores baseURL', () => {
        const baseURL = 'https://xray.cloud.getxray.app';
        const url = 'https://other.api.com/graphql';

        const resolved = new URL(url, baseURL).href;
        expect(resolved).toBe('https://other.api.com/graphql');
        expect(extractHost(resolved)).toBe('other.api.com');
    });

    it('resolves baseURL + path with query string', () => {
        const baseURL = 'https://xray.cloud.getxray.app';
        const url = '/api/v2/graphql?test=1';

        const resolved = new URL(url, baseURL).href;
        expect(extractHost(resolved)).toBe('xray.cloud.getxray.app');
    });

    it('empty url uses baseURL only', () => {
        const baseURL = 'https://xray.cloud.getxray.app';

        const resolved = new URL('', baseURL).href;
        expect(resolved).toBe('https://xray.cloud.getxray.app/');
        expect(extractHost(resolved)).toBe('xray.cloud.getxray.app');
    });

    it('no baseURL + absolute URL returns valid host', () => {
        const url = 'https://xray.cloud.getxray.app/api/v2/graphql';

        const resolvedUrl = url.startsWith('http') ? url : '';
        expect(extractHost(resolvedUrl)).toBe('xray.cloud.getxray.app');
    });

    it('no baseURL + relative path returns "unknown"', () => {
        const url = '/api/v2/graphql';

        const resolvedUrl = url.startsWith('http') ? url : '';
        expect(extractHost(resolvedUrl)).toBe('unknown');
    });
});
