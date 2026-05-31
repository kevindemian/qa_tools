/** Lightweight Jira HTTP client — shared between jira_management/ and git_triggers/.
 *  Provides core REST operations (GET/POST/PUT), JQL search, and workflow transitions.
 *  JiraResource (jira_management/) extends this class with project-version-sprint operations. */
import { createHttpClient } from './http-client';
import { extractErrorMessage } from './prompt';
import { rootLogger } from './logger';
import type { JsonObject, JiraResourceLike, SearchIssuesResponse } from './types';

class JiraClient implements JiraResourceLike {
    baseUrl: string;
    originUrl: string;
    personalToken: string;
    axiosInstance: ReturnType<typeof createHttpClient>;

    /**
     * @param personalToken - Bearer token for Jira API authentication.
     * @param baseUrl       - Jira instance base URL (e.g. `https://your-domain.atlassian.net/rest/api/2`).
     */
    constructor(personalToken: string, baseUrl: string) {
        this.baseUrl = baseUrl;
        this.personalToken = personalToken;
        const parsed = new URL(baseUrl);
        this.originUrl = parsed.origin;
        this.axiosInstance = createHttpClient({
            baseUrl,
            authHeader: { Authorization: `Bearer ${personalToken}` },
        });
    }

    async getJiraResource<T = JsonObject>(resourceUrl: string): Promise<T> {
        try {
            const response = await this.axiosInstance.get<T>(`/${resourceUrl}`);
            return response.data;
        } catch (err: unknown) {
            rootLogger.error('GET ' + resourceUrl + ' failed: ' + (err as Error).message);
            throw err;
        }
    }

    async postJiraResource<T = JsonObject>(resourceUrl: string, data: unknown): Promise<T> {
        try {
            const response = await this.axiosInstance.post<T>(`/${resourceUrl}`, data);
            return response.data;
        } catch (err: unknown) {
            const axiosErr = err as { response?: { status?: number } };
            rootLogger.error(`Erro POST /${resourceUrl}: ${extractErrorMessage(err)}`, {
                status: axiosErr.response?.status,
                resourceUrl,
            });
            throw err;
        }
    }

    async putJiraResource<T = JsonObject>(resourceUrl: string, data: unknown): Promise<T | null> {
        try {
            const response = await this.axiosInstance.put<T>(`/${resourceUrl}`, data);
            return response.status === 204 ? null : response.data;
        } catch (err: unknown) {
            const axiosErr = err as { response?: { status?: number } };
            rootLogger.error(`Erro PUT /${resourceUrl}: ${extractErrorMessage(err)}`, {
                resourceUrl,
                status: axiosErr.response?.status,
            });
            throw err;
        }
    }

    async getFromOriginPath<T = JsonObject>(path: string): Promise<T> {
        const url = `${this.originUrl}/${path.startsWith('/') ? path.slice(1) : path}`;
        try {
            const response = await this.axiosInstance.get<T>(url);
            return response.data;
        } catch (err: unknown) {
            rootLogger.error('GET from origin ' + path + ' failed: ' + (err as Error).message);
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
