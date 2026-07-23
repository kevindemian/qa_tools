/** Minimal Jira issue type from API responses. */
export interface JiraIssueType {
    id?: string;
    name?: string;
    description?: string;
    subtask?: boolean;
}

/** Minimal Jira status from API responses. */
export interface JiraStatus {
    id?: string;
    name?: string;
    description?: string;
    statusCategory?: {
        id?: number;
        key?: string;
        name?: string;
    };
}

/** Minimal Jira priority from API responses. */
export interface JiraPriority {
    id?: string;
    name?: string;
    description?: string;
    iconUrl?: string;
}

/** Minimum fields shape returned by Jira REST /search or /issue endpoints. */
export interface JiraIssueFields {
    summary?: string;
    description?: string;
    status?: JiraStatus;
    priority?: JiraPriority;
    issuetype?: JiraIssueType;
    labels?: string[];
    fixVersions?: Array<{ id?: string; name?: string; released?: boolean }>;
    project?: { id?: string; key?: string; name?: string };
    issuelinks?: JiraIssueLink[];
    [key: string]: unknown; // allow custom fields
}

/** An issue link between two Jira issues. */
export interface JiraIssueLink {
    id?: string;
    type?: {
        id?: string;
        name?: string;
        inward?: string;
        outward?: string;
    };
    inwardIssue?: { id?: string; key?: string; fields?: JiraIssueFields };
    outwardIssue?: { id?: string; key?: string; fields?: JiraIssueFields };
}

/** A single Jira issue from REST API responses. */
export interface JiraIssue {
    id: string;
    key: string;
    self?: string;
    fields: JiraIssueFields;
}

/** Paginated search result from Jira REST /search. */
export interface JiraSearchResult {
    issues: JiraIssue[];
    total: number;
    startAt: number;
    maxResults: number;
}

/** Minimal JiraResource interface for cross-layer type references. */
export interface JiraResourceLike {
    getJiraResource<T = unknown>(url: string): Promise<T>;
    postJiraResource<T = unknown>(url: string, data?: unknown): Promise<T>;
    putJiraResource<T = unknown>(url: string, data?: unknown): Promise<T | null>;
    deleteJiraResource<T = unknown>(url: string): Promise<T>;
    searchJiraIssues(jql: string, maxResults?: number): Promise<SearchIssuesResponse>;
    getTransitionsForIssue(issueKey: string): Promise<Record<string, string>>;
    transitionIssue(issueId: string, transitionId: string): Promise<void>;
    /** Optional: POST to a Cloud-specific API root (e.g. /rest/agile/1.0). Present on real JiraResource. */
    postToApiRoot?: (relativePath: string, data: unknown) => Promise<unknown>;
}

/** Minimal shape returned by Jira issue search. */
export interface SearchIssuesResponse {
    issues: Array<{ key: string; fields: Record<string, unknown> }>;
    total: number;
}

/** Minimal JiraLinkManager interface for cross-layer type references. */
export interface JiraLinkManagerLike {
    linkIssues(sourceKey: string, linkedIssues: Array<{ key: string; linkType: string }>): Promise<unknown>;
}
