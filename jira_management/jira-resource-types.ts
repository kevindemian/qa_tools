/** Shared types/interface for Jira resource modules — breaks circular dependency between
 *  JiraResource class and its sub-resource modules (sprint, version).
 *
 *  Both JiraResource (jira_resource.ts) and sub-resource modules import this interface
 *  instead of importing each other's concrete types. */
import type { Logger } from '../shared/logger.js';
import type { JsonObject } from '../shared/types.js';

export interface VersionData {
    id: string;
    name: string;
    released?: boolean;
    releaseDate?: string;
    description?: string;
    [key: string]: unknown;
}

export interface JiraIssue {
    key: string;
    fields: {
        summary?: string;
        status?: { name: string };
        [key: string]: unknown;
    };
}

export interface SearchResponse {
    issues: JiraIssue[];
    total: number;
}

/** Minimal interface for JiraResource methods consumed by sub-resource modules. */
export interface JiraResourceLike {
    getJiraResource: <T = JsonObject>(resourceUrl: string) => Promise<T>;
    postJiraResource: (resourceUrl: string, data: unknown) => Promise<JsonObject>;
    putJiraResource: (resourceUrl: string, data: unknown) => Promise<JsonObject | null>;
    /** Optional: POST to a Cloud-specific API root (e.g. /rest/agile/1.0). Present on real JiraResource. */
    postToApiRoot?: (relativePath: string, data: unknown) => Promise<JsonObject | null>;
    baseUrl: string;
    log: Logger;
    getProjectId: (projectName: string) => Promise<string>;
    getProjectVersions: (projectId: string) => Promise<VersionData[]>;
    getVersionId: (projectName: string, versionName: string) => Promise<string | null>;
    searchJiraIssues: (jql: string, maxResults?: number) => Promise<SearchResponse>;
    getTransitionsForIssue: (issueKey: string) => Promise<Record<string, string>>;
    transitionIssue: (issueId: string, transitionId: string) => Promise<void>;
    checkReleaseTasksStatus: (projectName: string, versionName: string) => Promise<boolean>;
}
