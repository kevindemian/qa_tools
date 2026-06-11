/** Xray Cloud HTTP client with retry, throttling, TLS, and token caching.
 * Replaces raw axios calls in CloudHistoryProvider and CloudStepImporter
 * so Cloud infrastructure gets the same resilience as Server (retry, backoff, concurrency limit). */
import { createThrottledClient } from './http-client.js';
import { rootLogger } from './logger.js';
import Config from './config.js';

const AUTH_PATH = '/api/v2/authenticate';
const GRAPHQL_PATH = '/api/v2/graphql';

export interface GraphqlResponse {
    data?: Record<string, unknown>;
}

/** Resilient HTTP client for Xray Cloud API.
 *  Manages authentication token caching transparently.
 *  All requests go through retry/throttle/TLS via `createThrottledClient`. */
export class XrayCloudClient {
    private readonly httpClient: ReturnType<typeof createThrottledClient>;
    private token: string | null = null;
    private tokenExpiresAt = 0;
    private readonly baseUrl: string;

    constructor(baseUrl?: string) {
        this.baseUrl = baseUrl ?? Config.getDefault().get('xrayCloudUrl');
        this.httpClient = createThrottledClient({ baseUrl: this.baseUrl, maxConcurrency: 3 });
    }

    /** Authenticate with Xray Cloud and cache the token.
     *  Returns null on failure (logs warning). */
    async authenticate(clientId: string, clientSecret: string): Promise<string | null> {
        if (this.token && Date.now() < this.tokenExpiresAt) return this.token;
        try {
            const res = await this.httpClient.post<string>(AUTH_PATH, {
                client_id: clientId,
                client_secret: clientSecret,
            });
            const raw = res.data;
            const token = typeof raw === 'string' ? raw.replace(/^"|"$/g, '') : raw;
            if (!token) {
                rootLogger.warn('Xray Cloud authentication returned empty token');
                return null;
            }
            this.token = token;
            this.tokenExpiresAt = Date.now() + 55 * 60 * 1000;
            return token;
        } catch (err) {
            rootLogger.warn('Xray Cloud auth failed: ' + (err as Error).message);
            return null;
        }
    }

    /** Ensure a valid token exists (authenticate if needed). */
    private async _ensureToken(clientId: string, clientSecret: string): Promise<string | null> {
        if (this.token && Date.now() < this.tokenExpiresAt) return this.token;
        return this.authenticate(clientId, clientSecret);
    }

    /** Execute a GraphQL query against Xray Cloud.
     *  Automatically authenticates if no valid token exists.
     *  Returns the response data object, or null on failure. */
    async graphql(
        query: string,
        variables: Record<string, unknown>,
        clientId: string,
        clientSecret: string,
    ): Promise<Record<string, unknown> | null> {
        const token = await this._ensureToken(clientId, clientSecret);
        if (!token) return null;
        try {
            const res = await this.httpClient.post<GraphqlResponse>(
                GRAPHQL_PATH,
                { query, variables },
                { headers: { Authorization: 'Bearer ' + token } },
            );
            return res.data.data ?? null;
        } catch (err) {
            rootLogger.warn('Xray Cloud GraphQL call failed: ' + (err as Error).message);
            return null;
        }
    }

    /** Execute a GraphQL mutation (no return data expected).
     *  Automatically authenticates if needed.
     *  Throws on failure (caller must catch for write operations). */
    async graphqlMutation(
        query: string,
        variables: Record<string, unknown>,
        clientId: string,
        clientSecret: string,
    ): Promise<void> {
        const token = await this._ensureToken(clientId, clientSecret);
        if (!token) {
            throw new Error('Xray Cloud authentication failed — cannot execute mutation');
        }
        try {
            await this.httpClient.post(
                GRAPHQL_PATH,
                { query, variables },
                { headers: { Authorization: 'Bearer ' + token } },
            );
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            throw new Error('Xray Cloud GraphQL mutation failed: ' + msg, { cause: err });
        }
    }
}
