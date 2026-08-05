/** Egress proxy configuration helpers.
 *
 *  Corporate networks (Zscaler / on-prem exch proxy) require an egress proxy to
 *  reach external APIs such as `api.atlassian.com`. This module centralizes proxy
 *  URL parsing and resolution so every HTTP client can honor it consistently.
 */
import type { AxiosProxyConfig } from 'axios';

/** Parse a proxy URL into axios proxy config.
 * @throws Error if the URL is invalid (missing host/port or unsupported protocol). */
export function parseProxyUrl(raw: string): AxiosProxyConfig {
    let parsed: URL;
    try {
        parsed = new URL(raw);
    } catch (err) {
        throw new Error('Invalid proxy URL "' + raw + '": ' + (err instanceof Error ? err.message : String(err)), {
            cause: err,
        });
    }
    const protocol = parsed.protocol === 'https:' ? 'https' : 'http';
    const host = parsed.hostname;
    const port = resolveProxyPort(parsed.port, protocol);
    if (!host || !Number.isFinite(port)) {
        throw new Error('Invalid proxy URL "' + raw + '": host and port are required');
    }
    if (parsed.username || parsed.password) {
        return {
            protocol,
            host,
            port,
            auth: {
                username: decodeURIComponent(parsed.username),
                password: decodeURIComponent(parsed.password),
            },
        };
    }
    return { protocol, host, port };
}

function resolveProxyPort(portRaw: string, protocol: string): number {
    const parsedPort = portRaw ? parseInt(portRaw, 10) : NaN;
    if (Number.isFinite(parsedPort)) return parsedPort;
    return protocol === 'https' ? 443 : 80;
}

/** Resolve the effective proxy URL with a fixed precedence chain.
 *
 *  Precedence (highest first):
 *  1. explicit param
 *  2. QA_PROXY_URL  (app-owned proxy, documented in config-schema)
 *  3. HTTPS_PROXY   (standard convention)
 *  4. HTTP_PROXY
 *  5. https_proxy / http_proxy (lowercase convention)
 *
 *  Returns undefined when no proxy is configured (direct egress).
 *  This matches the contract documented in config-schema.ts, http-client.ts
 *  and .env: QA_PROXY_URL primary, then standard proxy env vars. */
const PROXY_ENV_VARS: readonly string[] = ['QA_PROXY_URL', 'HTTPS_PROXY', 'HTTP_PROXY', 'https_proxy', 'http_proxy'];

export function resolveProxyUrl(explicit?: string): string | undefined {
    if (explicit && explicit.trim().length > 0) return explicit.trim();
    for (const key of PROXY_ENV_VARS) {
        const value = process.env[key];
        if (value && value.trim().length > 0) return value.trim();
    }
    return undefined;
}
