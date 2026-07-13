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

/** Resolve the effective proxy URL: explicit param wins; otherwise env vars.
 *  Returns undefined when no proxy is configured (direct egress). */
export function resolveProxyUrl(explicit?: string): string | undefined {
    if (explicit && explicit.trim().length > 0) return explicit.trim();
    const env =
        process.env['HTTPS_PROXY'] ||
        process.env['HTTP_PROXY'] ||
        process.env['https_proxy'] ||
        process.env['http_proxy'];
    return env && env.trim().length > 0 ? env.trim() : undefined;
}
