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

/** User choice when a transient GraphQL mutation error occurs. */
export type TransientErrorAction = 'skip' | 'abort' | 'retry';

/** Handler signature for transient errors — called in interactive mode. */
export type TransientErrorHandler = (error: Error, operation: string, attempt: number) => Promise<TransientErrorAction>;

/** Resilient HTTP client for Xray Cloud API.
 *  Manages authentication token caching transparently.
 *  All requests go through retry/throttle/TLS via `createThrottledClient`.
 *  Optional transient error handler for interactive skip/abort/retry. */
export class XrayCloudClient {
    private readonly httpClient: ReturnType<typeof createThrottledClient>;
    private token: string | null = null;
    private tokenExpiresAt = 0;
    private readonly baseUrl: string;
    private transientErrorHandler: TransientErrorHandler | null = null;

    constructor(baseUrl?: string) {
        this.baseUrl = baseUrl ?? Config.getDefault().get('xrayCloudUrl');
        const proxyUrl = Config.getDefault().get('proxyUrl');
        this.httpClient = createThrottledClient({ baseUrl: this.baseUrl, maxConcurrency: 3, proxyUrl });
    }

    /** Set a handler for interactive transient error decisions.
     *  When set, transient errors prompt the user (skip/abort/retry).
     *  When null (default/auto mode), transient errors auto-retry up to 3 times. */
    setTransientErrorHandler(handler: TransientErrorHandler | null): void {
        this.transientErrorHandler = handler;
    }

    /** Authenticate with Xray Cloud and cache the token.
     *  Returns null on failure (logs warning).
     *
     *  Transient network errors (ECONNRESET, EINVAL, etc.) are retried up to 3 times
     *  with exponential backoff (1s, 2s, 4s). Non-transient errors or exhausted retries
     *  return null with a warning logged. */
    async authenticate(clientId: string, clientSecret: string): Promise<string | null> {
        if (this.token && Date.now() < this.tokenExpiresAt) return this.token;
        const AUTH_MAX_RETRIES = 3;
        const AUTH_BASE_DELAY_MS = 1000;
        let lastErr: unknown;
        for (let attempt = 1; attempt <= AUTH_MAX_RETRIES; attempt++) {
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
                lastErr = err;
                const isTransient =
                    ((err as { code?: string })?.code
                        ? ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EINVAL', 'EAI_AGAIN'].includes(
                              (err as { code: string }).code,
                          )
                        : false) ||
                    (err instanceof Error && /read EINVAL|ECONNRESET/i.test(err.message));
                if (isTransient && attempt < AUTH_MAX_RETRIES) {
                    const delay = AUTH_BASE_DELAY_MS * Math.pow(2, attempt - 1);
                    rootLogger.warn(
                        `[authenticate] Transient error (attempt ${attempt}/${AUTH_MAX_RETRIES}): ` +
                            (err instanceof Error ? err.message : String(err)) +
                            ` — retrying in ${delay}ms`,
                    );
                    await new Promise((r) => setTimeout(r, delay));
                    continue;
                }
                rootLogger.warn('Xray Cloud auth failed: ' + formatErr(err));
                return null;
            }
        }
        const msg = lastErr instanceof Error ? lastErr.message : String(lastErr);
        rootLogger.warn(`[authenticate] Auth failed after ${AUTH_MAX_RETRIES} retries: ${msg}`);
        return null;
    }

    /** Ensure a valid token exists (authenticate if needed).
     *  Clears stale token on failure to force fresh authentication on next call. */
    private async _ensureToken(clientId: string, clientSecret: string): Promise<string | null> {
        if (this.token && Date.now() < this.tokenExpiresAt) return this.token;
        const token = await this.authenticate(clientId, clientSecret);
        if (!token) {
            // Clear stale token so next call retries authentication
            this.token = null;
            this.tokenExpiresAt = 0;
        }
        return token;
    }

    /** Execute a GraphQL query against Xray Cloud.
     *  Automatically authenticates if no valid token exists.
     *  Returns the response data object, or null on failure.
     *
     *  Transient network errors (ECONNRESET, EINVAL, etc.) are retried up to 3 times
     *  with exponential backoff (1s, 2s, 4s). Non-transient errors or exhausted retries
     *  return null with a warning logged. */
    async graphql(
        query: string,
        variables: Record<string, unknown>,
        clientId: string,
        clientSecret: string,
    ): Promise<Record<string, unknown> | null> {
        const token = await this._ensureToken(clientId, clientSecret);
        if (!token) return null;
        const QUERY_MAX_RETRIES = 3;
        const QUERY_BASE_DELAY_MS = 1000;
        let lastErr: unknown;
        for (let attempt = 1; attempt <= QUERY_MAX_RETRIES; attempt++) {
            try {
                const res = await this.httpClient.post<GraphqlResponse>(
                    GRAPHQL_PATH,
                    { query, variables },
                    { headers: { Authorization: 'Bearer ' + token } },
                );
                const errors = res.data.errors;
                if (errors && errors.length > 0) {
                    for (const gqlErr of errors) {
                        rootLogger.warn('GraphQL error: ' + gqlErr.message);
                    }
                }
                return res.data.data ?? null;
            } catch (err) {
                lastErr = err;
                const isTransient =
                    ((err as { code?: string })?.code
                        ? ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EINVAL', 'EAI_AGAIN'].includes(
                              (err as { code: string }).code,
                          )
                        : false) ||
                    (err instanceof Error && /read EINVAL|ECONNRESET/i.test(err.message));
                if (isTransient && attempt < QUERY_MAX_RETRIES) {
                    const delay = QUERY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
                    rootLogger.warn(
                        `[graphql] Transient error (attempt ${attempt}/${QUERY_MAX_RETRIES}): ` +
                            (err instanceof Error ? err.message : String(err)) +
                            ` — retrying in ${delay}ms`,
                    );
                    await new Promise((r) => setTimeout(r, delay));
                    continue;
                }
                const axiosErr = err as { response?: { status?: number; data?: unknown } };
                if (axiosErr.response) {
                    let detail = '';
                    const data = axiosErr.response.data;
                    if (data && typeof data === 'object') {
                        const errs = (data as { errors?: Array<{ message?: string }> }).errors;
                        const msgs = errs?.map((e) => e.message).filter((m): m is string => !!m);
                        detail = msgs && msgs.length > 0 ? msgs.join('; ') : '';
                    }
                    const max = 300;
                    const fallback = (() => {
                        try {
                            const json = JSON.stringify(data);
                            return json.length > max ? json.slice(0, max - 3) + '...' : json;
                        } catch {
                            return String(data);
                        }
                    })();
                    rootLogger.warn(
                        `Xray Cloud GraphQL HTTP ${axiosErr.response.status}: ${detail || fallback || 'sem detalhes'}`,
                    );
                } else {
                    rootLogger.warn('Xray Cloud GraphQL call failed: ' + formatErr(err));
                }
                return null;
            }
        }
        const msg = lastErr instanceof Error ? lastErr.message : String(lastErr);
        rootLogger.warn(`[graphql] Query failed after ${QUERY_MAX_RETRIES} retries: ${msg}`);
        return null;
    }

    /** Execute a GraphQL mutation (no return data expected).
     *  Automatically authenticates if needed.
     *
     *  Safeguard flow (transient network errors only):
     *    Phase 1 — Auto-retry: up to 3 attempts with exponential backoff (1s, 2s, 4s).
     *             Warning logged at each retry. Silent — no user interaction.
     *    Phase 2 — If all retries exhausted and error persists AND transientErrorHandler is set:
     *             Prompt user with [skip / abort / retry].
     *             - retry: restarts Phase 1 (fresh 3 retries).
     *             - skip: logs warning, returns without error.
     *             - abort: throws, stopping the operation.
     *    Phase 3 — If no handler (auto mode) or non-transient error: throws immediately.
     *
     *  Throws on failure (caller must catch for write operations). */
    async graphqlMutation(
        query: string,
        variables: Record<string, unknown>,
        clientId: string,
        clientSecret: string,
        operationLabel?: string,
    ): Promise<void> {
        const token = await this._ensureToken(clientId, clientSecret);
        if (!token) {
            throw new Error('Xray Cloud authentication failed — cannot execute mutation');
        }
        const MUTATION_MAX_RETRIES = 3;
        const MUTATION_BASE_DELAY_MS = 1000;
        const label = operationLabel ?? 'GraphQL mutation';
        let outerLoopGuard = 0;
        const OUTER_LOOP_LIMIT = 10;
        while (outerLoopGuard++ < OUTER_LOOP_LIMIT) {
            let lastErr: unknown;
            for (let attempt = 1; attempt <= MUTATION_MAX_RETRIES; attempt++) {
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
                    return;
                } catch (err) {
                    lastErr = err;
                    const isTransient =
                        ((err as { code?: string })?.code
                            ? ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EINVAL', 'EAI_AGAIN'].includes(
                                  (err as { code: string }).code,
                              )
                            : false) ||
                        (err instanceof Error && /read EINVAL|ECONNRESET/i.test(err.message));
                    if (isTransient && attempt < MUTATION_MAX_RETRIES) {
                        const delay = MUTATION_BASE_DELAY_MS * Math.pow(2, attempt - 1);
                        rootLogger.warn(
                            `[${label}] Transient error (attempt ${attempt}/${MUTATION_MAX_RETRIES}): ` +
                                (err instanceof Error ? err.message : String(err)) +
                                ` — retrying in ${delay}ms`,
                        );
                        await new Promise((r) => setTimeout(r, delay));
                        continue;
                    }
                    if (isTransient && attempt === MUTATION_MAX_RETRIES && this.transientErrorHandler) {
                        rootLogger.warn(`[${label}] Auto-retries exhausted. Asking user...`);
                        const action = await this.transientErrorHandler(
                            err instanceof Error ? err : new Error(String(err)),
                            label,
                            attempt,
                        );
                        switch (action) {
                            case 'retry':
                                rootLogger.info(`[${label}] User chose retry — restarting auto-retries`);
                                lastErr = null;
                                break;
                            case 'skip':
                                rootLogger.warn(`[${label}] User chose skip — skipping operation`);
                                return;
                            case 'abort':
                                throw new Error(
                                    `[${label}] Aborted by user: ` + (err instanceof Error ? err.message : String(err)),
                                    { cause: err },
                                );
                        }
                        break;
                    }
                    const msg = err instanceof Error ? err.message : String(err);
                    throw new Error('Xray Cloud GraphQL mutation failed: ' + msg, { cause: err });
                }
            }
            if (lastErr === null) continue;
            if (lastErr !== undefined) {
                const msg = lastErr instanceof Error ? lastErr.message : String(lastErr);
                throw new Error('Xray Cloud GraphQL mutation failed after retries: ' + msg, { cause: lastErr });
            }
        }
        throw new Error(`[${label}] Mutation failed — outer loop guard exceeded`);
    }

    /** Replace ALL steps of a test atomically.
     *  Xray Cloud has no single "setTestSteps" mutation.
     *  Strategy: removeAllTestSteps → addTestStep for each step. */
    async setTestSteps(
        testIssueId: string,
        steps: Array<{ action: string; result: string; data: string }>,
        clientId: string,
        clientSecret: string,
    ): Promise<void> {
        if (!testIssueId) throw new Error('setTestSteps requires a test issue id');
        const removeAllMutation = `
            mutation RemoveAllTestSteps($issueId: String!) {
                removeAllTestSteps(issueId: $issueId)
            }
        `;
        await this.graphqlMutation(removeAllMutation, { issueId: testIssueId }, clientId, clientSecret);

        const addStepMutation = `
            mutation AddTestStep($issueId: String!, $step: CreateStepInput!) {
                addTestStep(issueId: $issueId, step: $step) {
                    id
                    action
                    data
                    result
                }
            }
        `;
        for (const step of steps) {
            await this.graphqlMutation(addStepMutation, { issueId: testIssueId, step }, clientId, clientSecret);
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

    /** Read current test steps associated with a Test via Xray Cloud GraphQL. */
    async getTestSteps(
        testIssueId: string,
        clientId: string,
        clientSecret: string,
    ): Promise<Array<{ id: string; action: string; data: string; result: string }>> {
        if (!testIssueId) throw new Error('getTestSteps requires a test issue id');
        const query = `
            query GetTestSteps($issueId: String!) {
                getTest(issueId: $issueId) {
                    steps {
                        id
                        action
                        data
                        result
                    }
                }
            }
        `;
        const data = await this.graphql(query, { issueId: testIssueId }, clientId, clientSecret);
        if (!data) return [];
        const getTest = data['getTest'] as Record<string, unknown> | undefined;
        if (!getTest) return [];
        const steps = getTest['steps'] as
            | Array<{ id: string; action: string; data: string; result: string }>
            | undefined;
        return steps ?? [];
    }

    /** Read precondition issue ids associated with a Test via Xray Cloud GraphQL. */
    async getTestPreconditions(testIssueId: string, clientId: string, clientSecret: string): Promise<string[]> {
        if (!testIssueId) throw new Error('getTestPreconditions requires a test issue id');
        const query = `
            query GetTestPreconditions($issueId: String!) {
                getTest(issueId: $issueId) {
                    preconditions(limit: 100) {
                        total
                        results { issueId }
                    }
                }
            }
        `;
        const data = await this.graphql(query, { issueId: testIssueId }, clientId, clientSecret);
        if (!data) return [];
        const getTest = data['getTest'] as Record<string, unknown> | undefined;
        if (!getTest) return [];
        const preconditions = getTest['preconditions'] as Record<string, unknown> | undefined;
        if (!preconditions) return [];
        const results = preconditions['results'] as Array<{ issueId: string }> | undefined;
        return results?.map((r) => r.issueId) ?? [];
    }

    /** Remove specific Preconditions from a Test via Xray Cloud GraphQL.
     *  Uses the native `removePreconditionsFromTest` mutation (numeric issue ids).
     *  Throws on failure (GraphQL errors are surfaced by graphqlMutation). */
    async removePreconditionsFromTest(
        testIssueId: string,
        preconditionIssueIds: string[],
        clientId: string,
        clientSecret: string,
    ): Promise<void> {
        if (!testIssueId) throw new Error('removePreconditionsFromTest requires a test issue id');
        if (!Array.isArray(preconditionIssueIds) || preconditionIssueIds.length === 0) return;
        const mutation = `
            mutation RemovePreconditionsFromTest($issueId: String!, $preconditionIssueIds: [String!]!) {
                removePreconditionsFromTest(issueId: $issueId, preconditionIssueIds: $preconditionIssueIds)
            }
        `;
        await this.graphqlMutation(mutation, { issueId: testIssueId, preconditionIssueIds }, clientId, clientSecret);
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
            mutation AddTestsToTestExecution($issueId: String!, $testIssueIds: [String!]!) {
                addTestsToTestExecution(issueId: $issueId, testIssueIds: $testIssueIds) {
                    addedTests
                    warning
                }
            }
        `;
        await this.graphqlMutation(mutation, { issueId: testExecutionIssueId, testIssueIds }, clientId, clientSecret);
        return testIssueIds.length;
    }
}
