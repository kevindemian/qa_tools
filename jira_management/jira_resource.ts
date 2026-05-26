import { createHttpClient } from '../shared/http-client';
import { extractErrorMessage } from '../shared/prompt';
import { Logger } from '../shared/logger';
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
import type { VersionData, JiraIssue, SearchResponse } from './jira-resource-version';

class JiraResource {
    baseUrl: string;
    axiosInstance: ReturnType<typeof createHttpClient>;
    log: Logger;

    constructor(personalToken: string, baseUrl: string) {
        this.baseUrl = baseUrl;
        this.axiosInstance = createHttpClient({
            baseUrl,
            authHeader: { Authorization: `Bearer ${personalToken}` },
        });
        this.log = new Logger({ resource: 'JiraAPI' });
    }

    async searchJiraIssues(jql: string, maxResults = 200): Promise<SearchResponse> {
        return versionSearchJiraIssues(this, this.log, jql, maxResults);
    }

    async getTransitionsForIssue(issueKey: string): Promise<Record<string, string>> {
        return sprintGetTransitionsForIssue(this, issueKey);
    }

    async getJiraResource<T = JsonObject>(resourceUrl: string): Promise<T> {
        const response = await this.axiosInstance.get<T>(`/${resourceUrl}`);
        return response.data;
    }

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

    async getProjectId(projectName: string): Promise<string> {
        return versionGetProjectId(this, projectName);
    }

    async getProjectVersions(projectId: string): Promise<VersionData[]> {
        return versionGetProjectVersions(this, projectId);
    }

    async getVersionId(projectName: string, versionName: string): Promise<string | null> {
        return versionGetVersionId(this, projectName, versionName);
    }

    async createVersion(projectName: string, versionName: string, description?: string): Promise<JsonObject | null> {
        return versionCreateVersion(this, projectName, versionName, description);
    }

    async checkReleaseTasksStatus(projectName: string, versionName: string): Promise<boolean> {
        return versionCheckReleaseTasksStatus(this, projectName, versionName);
    }

    async getReleaseTasks(projectName: string, versionName: string, testOnly = false): Promise<string[]> {
        return versionGetReleaseTasks(this, projectName, versionName, testOnly);
    }

    async getLatestReleases(
        projectName: string,
        numReleases: number,
    ): Promise<{
        latestReleasedVersions: VersionData[];
        unreleasedVersions: VersionData[];
    }> {
        return versionGetLatestReleases(this, projectName, numReleases);
    }

    async addTasksToSprint(taskIds: string[], sprintId: string): Promise<void> {
        return sprintAddTasksToSprint(this, taskIds, sprintId);
    }

    async updateFixVersions(taskIds: string[], projectName: string, versionName: string): Promise<void> {
        return versionUpdateFixVersions(this, taskIds, projectName, versionName);
    }

    async releaseVersion(projectName: string, versionName: string): Promise<void> {
        return versionReleaseVersion(this, projectName, versionName);
    }

    async moveCardsToDone(taskIds: string[]): Promise<void> {
        return sprintMoveCardsToDone(this, taskIds);
    }

    async transitionIssue(issueId: string, transitionId: string): Promise<void> {
        return sprintTransitionIssue(this, issueId, transitionId);
    }
}

export default JiraResource;
export type { VersionData, JiraIssue, SearchResponse };
