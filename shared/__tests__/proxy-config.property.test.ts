/**
 * Property-Based Tests — resolveProxyUrl precedence (FT-proxy)
 *
 * Invariantes (contrato documentado em config-schema.ts, http-client.ts, .env):
 * - Precedência fixa: explicit > QA_PROXY_URL > HTTPS_PROXY > HTTP_PROXY > https_proxy > http_proxy
 * - Valores vazios/whitespace são ignorados e a cadeia continua
 * - `explicit` não-removível por nenhuma env var
 * - Sem configuração → undefined (direct egress)
 */
import * as fc from 'fast-check';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveProxyUrl } from '../infra/proxy-config.js';

const ENV_KEYS = ['QA_PROXY_URL', 'HTTPS_PROXY', 'HTTP_PROXY', 'https_proxy', 'http_proxy'] as const;

const nonEmptyUrl = fc.stringMatching(/^https?:\/\/[a-z0-9.-]+(?::\d{1,5})?$/);
const maybeUrl = fc.oneof(nonEmptyUrl, fc.constant(''), fc.constant('   '));

describe('ProxyConfig.ResolveProxyUrl.Property', () => {
    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it('explicit param always wins over any combination of env vars', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(
                fc.record({
                    QA_PROXY_URL: maybeUrl,
                    HTTPS_PROXY: maybeUrl,
                    HTTP_PROXY: maybeUrl,
                    https_proxy: maybeUrl,
                    http_proxy: maybeUrl,
                }),
                nonEmptyUrl,
                (env, explicit) => {
                    for (const key of ENV_KEYS) vi.stubEnv(key, env[key]);

                    expect(resolveProxyUrl(explicit)).toBe(explicit);
                },
            ),
        );
    });

    it('precedence holds: QA_PROXY_URL beats all standard vars regardless of their values', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(
                fc.record({
                    HTTPS_PROXY: maybeUrl,
                    HTTP_PROXY: maybeUrl,
                    https_proxy: maybeUrl,
                    http_proxy: maybeUrl,
                }),
                nonEmptyUrl,
                (others, qaProxy) => {
                    vi.stubEnv('QA_PROXY_URL', qaProxy);
                    const standardKeys = Object.keys(others) as (keyof typeof others)[];
                    for (const key of standardKeys) vi.stubEnv(key, others[key]);

                    expect(resolveProxyUrl()).toBe(qaProxy);
                },
            ),
        );
    });

    it('empty/whitespace values never win: chain continues to next configured var', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(
                fc.constantFrom('QA_PROXY_URL', 'HTTPS_PROXY', 'HTTP_PROXY', 'https_proxy', 'http_proxy'),
                nonEmptyUrl,
                (emptyKey, value) => {
                    vi.stubEnv(emptyKey, '   ');
                    const remaining = ENV_KEYS.filter((key) => key !== emptyKey);
                    const winner = remaining[0] as string;
                    vi.stubEnv(winner, value);

                    expect(resolveProxyUrl()).toBe(value);
                },
            ),
        );
    });

    it('all env vars empty/whitespace yields undefined (direct egress)', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(fc.array(fc.constantFrom('', '   '), { minLength: 5, maxLength: 5 }), (values) => {
                ENV_KEYS.forEach((key, i) => vi.stubEnv(key, values[i] as string));

                expect(resolveProxyUrl()).toBeUndefined();
            }),
        );
    });

    it('explicit param is trimmed before use', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(nonEmptyUrl, (url) => {
                expect(resolveProxyUrl('  ' + url + '  ')).toBe(url);
            }),
        );
    });
});
