/** Jira REST API client — wraps axios with project scoping, version cache, and typed GET/POST operations. */
import { createHttpClient } from '../shared/http-client';
import { extractErrorMessage } from '../shared/prompt';
import { Logger, rootLogger } from '../shared/logger';
import {
    getProjectId as versionGetProjectId,
    getProjectVersions as versionGetProjectVersions,
    getVersionId as versionGetVersionId,
    createVersion as versionCreateVersion,
    checkReleaseTasksStatus as versionCheckReleaseTasksStatus,
    getReleaseTasks as versionGetReleaseTasks,
    getLatestReleases as versionGetLatestReleases,
    updateFixVersions as versionUpdateFixVersions,
    releaseVersion as versionReleaseVersion,
    searchJiraIssuesCore as versionSearchJiraIssues,
} from './jira-resource-version';
import {
    addTasksToSprint as sprintAddTasksToSprint,
    getTransitionsForIssue as sprintGetTransitionsForIssue,
    transitionIssue as sprintTransitionIssue,
    moveCardsToDone as sprintMoveCardsToDone,
} from './jira-resource-sprint';
import type { JsonObject } from '../shared/types';
import type { VersionData, JiraIssue, SearchResponse, JiraResourceLike } from './jira-resource-types';

/** Facade over Jira REST API — delegates to resource-specific modules. */
class JiraResource implements JiraResourceLike {
    baseUrl: string;
    /** Origin URL extraído do baseUrl (scheme + host, sem path).
     * Usado por {@link getFromOriginPath} para endpoints que vivem fora do path do baseUrl
     * (ex: Xray Raven API em `/rest/raven/1.0/` vs Jira API em `/rest/api/2/`). */
    originUrl: string;
    personalToken: string;
    axiosInstance: ReturnType<typeof createHttpClient>;
    log: Logger;

    /**
     * @param personalToken - Bearer token for Jira API authentication.
     * @param baseUrl       - Jira instance base URL (e.g. `https://your-domain.atlassian.net`).
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
        this.log = new Logger({ resource: 'JiraAPI' });
    }

    /**
     * Search issues by JQL query.
     * @param jql       - Jira Query Language string.
     * @param maxResults - Maximum results to return (default 200).
     * @returns `SearchResponse` with `issues`, `total`, `startAt`, `maxResults`.
     */
    async searchJiraIssues(jql: string, maxResults = 200): Promise<SearchResponse> {
        return versionSearchJiraIssues(this, this.log, jql, maxResults);
    }

    /**
     * Get available workflow transitions for an issue.
     * @param issueKey - Jira issue key (e.g. `PROJ-123`).
     * @returns Map of transition name → transition id.
     */
    async getTransitionsForIssue(issueKey: string): Promise<Record<string, string>> {
        return sprintGetTransitionsForIssue(this, issueKey);
    }

    /**
     * HTTP GET to a Jira API path.
     * @param resourceUrl - Path relative to base URL (e.g. `issue/PROJ-123`).
     * @returns Response body typed as `T` (default `JsonObject`).
     * @throws On network / non-2xx — raw axios error propagates.
     */
    async getJiraResource<T = JsonObject>(resourceUrl: string): Promise<T> {
        try {
            const response = await this.axiosInstance.get<T>(`/${resourceUrl}`);
            return response.data;
        } catch (err) {
            rootLogger.error('GET ' + resourceUrl + ' failed: ' + (err as Error).message);
            throw err;
        }
    }

    /**
     * HTTP GET to an absolute path from the server origin.
     * Útil para endpoints que NÃO estão sob o path do baseUrl (ex: Xray Raven API).
     * Constrói a URL a partir de `originUrl + path`, ignorando o path do baseUrl.
     *
     * @example
     *   baseUrl = 'https://jira.euronext.com/rest/api/2'
     *   getFromOriginPath('rest/raven/1.0/api/test/ECSPOL-1255/testruns')
     *   → GET https://jira.euronext.com/rest/raven/1.0/api/test/ECSPOL-1255/testruns ✅
     *   (getJiraResource geraria duplo /rest/ via axios baseURL)
     *
     * @param path - Path absoluto do servidor (ex: `rest/raven/1.0/api/...`).
     * @returns Response body typed as `T`.
     * @throws On network / non-2xx.
     */
    async getFromOriginPath<T = JsonObject>(path: string): Promise<T> {
        const url = `${this.originUrl}/${path.startsWith('/') ? path.slice(1) : path}`;
        try {
            const response = await this.axiosInstance.get<T>(url);
            return response.data;
        } catch (err) {
            rootLogger.error('GET from origin ' + path + ' failed: ' + (err as Error).message);
            throw err;
        }
    }

    /**
     * HTTP POST to a Jira API path.
     * @param resourceUrl - Path relative to base URL.
     * @param data        - Request payload.
     * @returns Response body as `JsonObject`.
     * @throws On network / non-2xx — error is logged and re-thrown.
     */
    async postJiraResource(resourceUrl: string, data: unknown): Promise<JsonObject> {
        const opLog = this.log.child({ resourceUrl });
        try {
            const response = await this.axiosInstance.post(`/${resourceUrl}`, data);
            return response.data as JsonObject;
        } catch (err: unknown) {
            const axiosErr = err as { response?: { status?: number } };
            opLog.error(`Erro POST /${resourceUrl}: ${extractErrorMessage(err)}`, {
                status: axiosErr.response?.status,
                resourceUrl,
            });
            throw err;
        }
    }

    /**
     * HTTP PUT to a Jira API path.
     * @param resourceUrl - Path relative to base URL.
     * @param data        - Request payload.
     * @returns Response body as `JsonObject`, or `null` on HTTP 204.
     * @throws On network / non-2xx — error is logged and re-thrown.
     */
    async putJiraResource(resourceUrl: string, data: unknown): Promise<JsonObject | null> {
        try {
            const response = await this.axiosInstance.put(`/${resourceUrl}`, data);
            return response.status === 204 ? null : (response.data as JsonObject);
        } catch (err: unknown) {
            const axiosErr = err as { response?: { status?: number } };
            this.log.error(`Erro PUT /${resourceUrl}: ${extractErrorMessage(err)}`, {
                resourceUrl,
                status: axiosErr.response?.status,
            });
            throw err;
        }
    }

    /**
     * Resolve a project name to its numeric Jira project ID.
     * @param projectName - Project key or name.
     * @returns Numeric project id as string.
     */
    async getProjectId(projectName: string): Promise<string> {
        return versionGetProjectId(this, projectName);
    }

    /**
     * List all versions for a project.
     * @param projectId - Numeric project id.
     * @returns Array of `VersionData` objects.
     */
    async getProjectVersions(projectId: string): Promise<VersionData[]> {
        return versionGetProjectVersions(this, projectId);
    }

    /**
     * Find a version's ID by name within a project.
     * @param projectName - Project key or name.
     * @param versionName - Version name to look up.
     * @returns Version id string, or `null` if not found.
     */
    async getVersionId(projectName: string, versionName: string): Promise<string | null> {
        return versionGetVersionId(this, projectName, versionName);
    }

    /**
     * Create a new version in a project.
     * @param projectName - Project key or name.
     * @param versionName - Name for the new version.
     * @param description - Optional version description.
     * @returns Created version as `JsonObject`, or `null` if it already exists.
     */
    async createVersion(projectName: string, versionName: string, description?: string): Promise<JsonObject | null> {
        return versionCreateVersion(this, projectName, versionName, description);
    }

    /**
     * Check whether all tasks in a version are in a final (closed/done) status.
     * @param projectName - Project key or name.
     * @param versionName - Version to inspect.
     * @returns `true` if all tasks are done, `false` otherwise.
     */
    async checkReleaseTasksStatus(projectName: string, versionName: string): Promise<boolean> {
        return versionCheckReleaseTasksStatus(this, projectName, versionName);
    }

    /**
     * Get issue keys for a version's tasks.
     * @param projectName - Project key or name.
     * @param versionName - Version to query.
     * @param testOnly    - If `true`, return only test-type issues (default `false`).
     * @returns Array of issue key strings.
     */
    async getReleaseTasks(projectName: string, versionName: string, testOnly = false): Promise<string[]> {
        return versionGetReleaseTasks(this, projectName, versionName, testOnly);
    }

    /**
     * Get the most recent releases and unreleased versions for a project.
     * @param projectName - Project key or name.
     * @param numReleases - Number of recent released versions to include.
     * @returns Object with `latestReleasedVersions` and `unreleasedVersions` arrays.
     */
    async getLatestReleases(
        projectName: string,
        numReleases: number,
    ): Promise<{
        latestReleasedVersions: VersionData[];
        unreleasedVersions: VersionData[];
    }> {
        return versionGetLatestReleases(this, projectName, numReleases);
    }

    /**
     * Add issues to a sprint (Jira GreenHopper API).
     * @param taskIds  - Array of issue keys.
     * @param sprintId - Sprint numeric id.
     */
    async addTasksToSprint(taskIds: string[], sprintId: string): Promise<void> {
        return sprintAddTasksToSprint(this, taskIds, sprintId);
    }

    /**
     * Set the fixVersion on a set of issues.
     * @param taskIds     - Array of issue keys.
     * @param projectName - Project key or name.
     * @param versionName - Version to set as fixVersion.
     */
    async updateFixVersions(taskIds: string[], projectName: string, versionName: string): Promise<void> {
        return versionUpdateFixVersions(this, taskIds, projectName, versionName);
    }

    /**
     * Release (archive) a version.
     * @param projectName - Project key or name.
     * @param versionName - Version to release.
     */
    async releaseVersion(projectName: string, versionName: string): Promise<void> {
        return versionReleaseVersion(this, projectName, versionName);
    }

    /**
     * Transition all given issues to their "Done" status.
     * @param taskIds - Array of issue keys.
     */
    async moveCardsToDone(taskIds: string[]): Promise<void> {
        return sprintMoveCardsToDone(this, taskIds);
    }

    /**
     * Apply a named workflow transition to an issue.
     * @param issueId      - Jira issue key.
     * @param transitionId - Transition id (from `getTransitionsForIssue`).
     */
    async transitionIssue(issueId: string, transitionId: string): Promise<void> {
        return sprintTransitionIssue(this, issueId, transitionId);
    }
}

export default JiraResource;
/**
 * Re-exported types from `jira-resource-version`.
 * - `VersionData` — Jira version metadata (id, name, description, released, etc.).
 * - `JiraIssue`   — Minimal issue shape (key, summary, status, etc.).
 * - `SearchResponse` — JQL search result wrapper (issues, total, startAt, maxResults).
 */
export type { VersionData, JiraIssue, SearchResponse };
