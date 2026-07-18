/** Xray Cloud HTTP client with retry, throttling, TLS, and token caching.
 * Replaces raw axios calls in CloudHistoryProvider and CloudStepImporter
 * so Cloud infrastructure gets the same resilience as Server (retry, backoff, concurrency limit). */
import { formatErr } from '../errors.js';
import { createThrottledClient } from '../infra/http-client.js';
import { rootLogger } from '../logger.js';
import Config from '../config-accessor.js';

const AUTH_PATH = '/api/v2/authenticate';
const GRAPHQL_PATH = '/api/v2/graphql';

export interface GraphqlResponse {
    data?: Record<string, unknown>;
    errors?: Array<{ message: string }>;
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
        const proxyUrl = Config.getDefault().get('proxyUrl');
        this.httpClient = createThrottledClient({ baseUrl: this.baseUrl, maxConcurrency: 3, proxyUrl });
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
            rootLogger.warn('Xray Cloud auth failed: ' + formatErr(err));
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
            rootLogger.warn('Xray Cloud GraphQL call failed: ' + formatErr(err));
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
            const res = await this.httpClient.post<GraphqlResponse>(
                GRAPHQL_PATH,
                { query, variables },
                { headers: { Authorization: 'Bearer ' + token } },
            );
            const errors = res.data.errors;
            if (errors && errors.length > 0) {
                const msgs = errors.map((e) => e.message).join('; ');
                throw new Error('Xray Cloud GraphQL mutation failed: ' + msgs);
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            throw new Error('Xray Cloud GraphQL mutation failed: ' + msg, { cause: err });
        }
    }

    /** Associate one or more Pre-condition issues to a Test in Xray Cloud.
     *  Uses the native GraphQL `addPreconditionsToTest` mutation (numeric issue ids),
     *  which does NOT depend on the Jira "Pre-Condition" issue link type.
     *  Throws on failure (GraphQL errors are surfaced by graphqlMutation). */
    async addPreconditionsToTest(
        testIssueId: string,
        preconditionIssueIds: string[],
        clientId: string,
        clientSecret: string,
    ): Promise<void> {
        if (!testIssueId) throw new Error('addPreconditionsToTest requires a test issue id');
        if (!Array.isArray(preconditionIssueIds) || preconditionIssueIds.length === 0) {
            throw new Error('addPreconditionsToTest requires at least one precondition issue id');
        }
        const mutation = `
            mutation AddPreconditionsToTest($testIssueId: String!, $preconditionIssueIds: [String!]!) {
                addPreconditionsToTest(issueId: $testIssueId, preconditionIssueIds: $preconditionIssueIds) {
                    addedPreconditions
                    warning
                }
            }
        `;
        await this.graphqlMutation(mutation, { testIssueId, preconditionIssueIds }, clientId, clientSecret);
    }

    /** Associate one or more Test issues to a Test Execution in Xray Cloud.
     *  Uses the native GraphQL `addTestsToTestExecution` mutation (numeric issue ids),
     *  which creates the native Xray Test Execution relationship — NOT a Jira issue link.
     *  A plain Jira "Tests" issue link does NOT make the tests appear under the
     *  execution's Tests section in Cloud mode (defect: test-execution-cloud-association-defect).
     *  Throws on failure (GraphQL errors are surfaced by graphqlMutation). */
    async addTestsToTestExecution(
        testExecutionIssueId: string,
        testIssueIds: string[],
        clientId: string,
        clientSecret: string,
    ): Promise<number> {
        if (!testExecutionIssueId) {
            throw new Error('addTestsToTestExecution requires a test execution issue id');
        }
        if (!Array.isArray(testIssueIds) || testIssueIds.length === 0) {
            throw new Error('addTestsToTestExecution requires at least one test issue id');
        }
        const mutation = `
            mutation AddTestsToTestExecution($testExecIssueId: String!, $testIssueIds: [String!]!) {
                addTestsToTestExecution(testExecIssueId: $testExecIssueId, testIssueIds: $testIssueIds) {
                    addedTests
                    warning
                }
            }
        `;
        await this.graphqlMutation(
            mutation,
            { testExecIssueId: testExecutionIssueId, testIssueIds },
            clientId,
            clientSecret,
        );
        return testIssueIds.length;
    }
}
