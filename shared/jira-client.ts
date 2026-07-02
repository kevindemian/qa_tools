/** Lightweight Jira HTTP client — shared between jira_management/ and git_triggers/.
 *  Provides core REST operations (GET/POST/PUT), JQL search, and workflow transitions.
 *  JiraResource (jira_management/) extends this class with project-version-sprint operations.
 *
 *  Supports two authentication modes:
 *  - `'server'` (default): `Authorization: Bearer <PAT>`
 *  - `'cloud'`:            `Authorization: Basic <base64(email:apiToken)>`
 *
 *  Circuit breaker key: 'jira-client' — all HTTP methods check the breaker before
 *  issuing requests and record success/failure after completion. */
import { formatErr } from './errors.js';
import { createHttpClient } from './http-client.js';
import { extractErrorMessage } from './prompt.js';
import { rootLogger } from './logger.js';
import { createJiraAuthHeader, type JiraMode } from './jira-auth.js';
import { checkCircuitBreaker, recordCircuitFailure, recordCircuitSuccess } from './circuit-breaker.js';
import type { JsonObject, JiraResourceLike, SearchIssuesResponse } from './types.js';

class JiraClient implements JiraResourceLike {
    baseUrl: string;
    originUrl: string;
    personalToken: string;
    jiraMode: JiraMode;
    axiosInstance: ReturnType<typeof createHttpClient>;

    /**
     * @param personalToken - Token for Jira API authentication.
     *                        - server: Personal Access Token.
     *                        - cloud:  email:apiToken (will be base64-encoded).
     * @param baseUrl       - Jira instance base URL (e.g. `https://your-domain.atlassian.net/rest/api/2`).
     * @param mode          - `'server'` (default, Bearer PAT) or `'cloud'` (Basic base64).
     */
    constructor(personalToken: string, baseUrl: string, mode?: JiraMode) {
        this.baseUrl = baseUrl;
        this.personalToken = personalToken;
        this.jiraMode = mode ?? 'server';
        try {
            const parsed = new URL(baseUrl);
            this.originUrl = parsed.origin;
        } catch (err) {
            rootLogger.debug('Failed to parse Jira base URL: ' + (err instanceof Error ? err.message : String(err)));
            this.originUrl = '';
        }
        this.axiosInstance = createHttpClient({
            baseUrl,
            authHeader: createJiraAuthHeader(personalToken, this.jiraMode),
        });
    }

    async getJiraResource<T = JsonObject>(resourceUrl: string): Promise<T> {
        checkCircuitBreaker('jira-client');
        try {
            const response = await this.axiosInstance.get<T>(`/${resourceUrl}`);
            recordCircuitSuccess('jira-client');
            return response.data;
        } catch (err: unknown) {
            const axiosErr = err as { response?: { status?: number }; code?: string };
            if (!axiosErr.response) recordCircuitFailure('jira-client');
            rootLogger.error('GET ' + resourceUrl + ' failed: ' + formatErr(err));
            throw err;
        }
    }

    async postJiraResource<T = JsonObject>(resourceUrl: string, data: unknown): Promise<T> {
        checkCircuitBreaker('jira-client');
        try {
            const response = await this.axiosInstance.post<T>(`/${resourceUrl}`, data);
            recordCircuitSuccess('jira-client');
            return response.data;
        } catch (err: unknown) {
            const axiosErr = err as { response?: { status?: number }; code?: string };
            if (!axiosErr.response) recordCircuitFailure('jira-client');
            rootLogger.error(`Erro POST /${resourceUrl}: ${extractErrorMessage(err)}`, {
                status: axiosErr.response?.status,
                resourceUrl,
            });
            throw err;
        }
    }

    async putJiraResource<T = JsonObject>(resourceUrl: string, data: unknown): Promise<T | null> {
        checkCircuitBreaker('jira-client');
        try {
            const response = await this.axiosInstance.put<T>(`/${resourceUrl}`, data);
            recordCircuitSuccess('jira-client');
            return response.status === 204 ? null : response.data;
        } catch (err: unknown) {
            const axiosErr = err as { response?: { status?: number }; code?: string };
            if (!axiosErr.response) recordCircuitFailure('jira-client');
            rootLogger.error(`Erro PUT /${resourceUrl}: ${extractErrorMessage(err)}`, {
                resourceUrl,
                status: axiosErr.response?.status,
            });
            throw err;
        }
    }

    async getFromOriginPath<T = JsonObject>(path: string): Promise<T> {
        checkCircuitBreaker('jira-client');
        const url = `${this.originUrl}/${path.startsWith('/') ? path.slice(1) : path}`;
        try {
            const response = await this.axiosInstance.get<T>(url);
            recordCircuitSuccess('jira-client');
            return response.data;
        } catch (err: unknown) {
            const axiosErr = err as { response?: { status?: number }; code?: string };
            if (!axiosErr.response) recordCircuitFailure('jira-client');
            rootLogger.error('GET from origin ' + path + ' failed: ' + formatErr(err));
            throw err;
        }
    }

    async searchJiraIssues(jql: string, maxResults = 200): Promise<SearchIssuesResponse> {
        const query = `search?jql=${encodeURIComponent(jql)}&maxResults=${maxResults}`;
        return this.getJiraResource<SearchIssuesResponse>(query);
    }

    async getTransitionsForIssue(issueKey: string): Promise<Record<string, string>> {
        const data = await this.getJiraResource<{
            transitions?: Array<{ id: string; name: string }>;
        }>(`issue/${issueKey}/transitions`);
        const result: Record<string, string> = {};
        for (const t of data.transitions || []) {
            result[t.name] = t.id;
        }
        return result;
    }

    async transitionIssue(issueId: string, transitionId: string): Promise<void> {
        await this.postJiraResource(`issue/${issueId}/transitions`, {
            transition: { id: transitionId },
        });
    }
}

export default JiraClient;
