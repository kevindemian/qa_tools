import { describe, it, expect, afterEach, vi } from 'vitest';
import { parseProxyUrl, resolveProxyUrl } from '../proxy-config.js';

describe('ProxyConfig', () => {
    afterEach(() => {
        vi.unstubAllEnvs();
    });

    describe('ParseProxyUrl', () => {
        it('parses a plain http proxy (no auth)', () => {
            const cfg = parseProxyUrl('http://localhost:9000');

            expect(cfg).toMatchObject({ protocol: 'http', host: 'localhost', port: 9000 });
            expect(cfg.auth).toBeUndefined();
        });

        it('parses an on-prem proxy host', () => {
            const cfg = parseProxyUrl('http://localhost:8080');

            expect(cfg).toMatchObject({ host: 'localhost', port: 8080, protocol: 'http' });
        });

        it('parses proxy credentials', () => {
            const cfg = parseProxyUrl('http://user:p%40ss@localhost:8080');

            expect(cfg.auth).toStrictEqual({ username: 'user', password: 'p@ss' });
        });

        it('throws on a non-URL', () => {
            expect(() => parseProxyUrl('not-a-url')).toThrow(/Invalid proxy URL/);
        });

        it('throws on missing host or port', () => {
            expect(() => parseProxyUrl('https:///')).toThrow(/Invalid proxy URL/);
        });
    });

    describe('ResolveProxyUrl', () => {
        it('prefers the explicit param over env', () => {
            vi.stubEnv('HTTPS_PROXY', 'https://localhost:3128');

            expect(resolveProxyUrl('http://localhost:9000')).toBe('http://localhost:9000');
        });

        it('falls back to HTTPS_PROXY env', () => {
            vi.stubEnv('HTTPS_PROXY', 'https://localhost:3128');

            expect(resolveProxyUrl()).toBe('https://localhost:3128');
        });

        it('falls back to HTTP_PROXY env (lowercase)', () => {
            vi.stubEnv('http_proxy', 'https://localhost:3128');

            expect(resolveProxyUrl()).toBe('https://localhost:3128');
        });

        it('returns undefined when nothing configured', () => {
            expect(resolveProxyUrl()).toBeUndefined();
        });
    });
});
