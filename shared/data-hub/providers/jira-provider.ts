/**
 * Data Hub — Jira Provider.
 *
 * Fetches Jira issues via JiraResourceLike and adapts to DataProvider.
 */
import type { JiraResourceLike, JiraIssue } from '../../types/jira.js';
import type { DataProvider, FetchOptions, RawData, RawJiraIssue } from '../../types/data-hub.js';

export class JiraDataProvider implements DataProvider {
    readonly name = 'jira';
    readonly source = 'jira' as const;

    constructor(
        private readonly jira: JiraResourceLike,
        private readonly projectKey: string,
    ) {}

    async fetchRawData(options: FetchOptions): Promise<RawData> {
        const { count } = options;
        const maxResults = count ?? 50;

        const jql = `project = "${this.projectKey}" ORDER BY created DESC`;
        const response = await this.jira.searchJiraIssues(jql, maxResults);

        const jiraIssues: RawJiraIssue[] = response.issues.map((issue) => this.mapIssue(issue as JiraIssue));

        return {
            runs: [],
            jobs: new Map(),
            artifacts: new Map(),
            failureReasons: new Map(),
            jiraIssues,
        };
    }

    private mapIssue(issue: JiraIssue): RawJiraIssue {
        const { fields } = issue;
        return {
            key: issue.key,
            summary: fields.summary ?? '',
            status: fields.status?.name ?? '',
            type: fields.issuetype?.name ?? '',
            labels: fields.labels ?? [],
            created: '',
            updated: '',
        };
    }
}
