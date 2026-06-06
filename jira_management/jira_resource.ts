/** Jira REST API client — extends shared JiraClient with project/version/sprint operations. */
import JiraClient from '../shared/jira-client.js';
import { extractErrorMessage } from '../shared/prompt.js';
import { Logger } from '../shared/logger.js';
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
} from './jira-resource-version.js';
import {
    addTasksToSprint as sprintAddTasksToSprint,
    getTransitionsForIssue as sprintGetTransitionsForIssue,
    transitionIssue as sprintTransitionIssue,
    moveCardsToDone as sprintMoveCardsToDone,
} from './jira-resource-sprint.js';
import type { JsonObject } from '../shared/types.js';
import type { VersionData, JiraIssue, SearchResponse, JiraResourceLike } from './jira-resource-types.js';

/** Facade over Jira REST API — delegates to resource-specific modules.
 *  Extends the base JiraClient (shared) with project version and sprint management. */
class JiraResource extends JiraClient implements JiraResourceLike {
    log: Logger;

    constructor(personalToken: string, baseUrl: string, mode?: string) {
        super(personalToken, baseUrl, mode);
        this.log = new Logger({ resource: 'JiraAPI' });
    }

    /**
     * Search issues by JQL query.
     * @param jql       - Jira Query Language string.
     * @param maxResults - Maximum results to return (default 200).
     * @returns `SearchResponse` with `issues`, `total`, `startAt`, `maxResults`.
     */
    override async searchJiraIssues(jql: string, maxResults = 200): Promise<SearchResponse> {
        return versionSearchJiraIssues(this, this.log, jql, maxResults);
    }

    /**
     * Get available workflow transitions for an issue.
     * @param issueKey - Jira issue key (e.g. `PROJ-123`).
     * @returns Map of transition name → transition id.
     */
    override async getTransitionsForIssue(issueKey: string): Promise<Record<string, string>> {
        return sprintGetTransitionsForIssue(this, issueKey);
    }

    /**
     * HTTP POST to a Jira API path.
     * @param resourceUrl - Path relative to base URL.
     * @param data        - Request payload.
     * @returns Response body typed as `T` (default `JsonObject`).
     * @throws On network / non-2xx — error is logged and re-thrown.
     */
    override async postJiraResource<T = JsonObject>(resourceUrl: string, data: unknown): Promise<T> {
        const opLog = this.log.child({ resourceUrl });
        try {
            const response = await this.axiosInstance.post<T>(`/${resourceUrl}`, data);
            return response.data;
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
    override async transitionIssue(issueId: string, transitionId: string): Promise<void> {
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
