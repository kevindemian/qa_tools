import type { TestExecutionSummary } from '../shared/types';
import type JiraResource from './jira_resource';
import { LinkTypeManager } from './link-types';
import { LinkOperations } from './link-operations';
import {
    PreconditionHandler,
    matchPreconditionByTokenOverlap,
    matchPreconditionByDualThreshold,
} from './precondition-handler';

export { matchPreconditionByTokenOverlap, matchPreconditionByDualThreshold };

class JiraLinkManager {
    jiraResource: JiraResource;
    linkTypeManager: LinkTypeManager;
    linkOperations: LinkOperations;
    preconditionHandler: PreconditionHandler;

    constructor(jiraResource: JiraResource) {
        this.jiraResource = jiraResource;
        this.linkTypeManager = new LinkTypeManager(jiraResource);
        this.linkOperations = new LinkOperations(jiraResource, this.linkTypeManager);
        this.preconditionHandler = new PreconditionHandler(jiraResource);
    }

    get linkTypesCache() {
        return this.linkTypeManager.linkTypesCache;
    }
    get cacheFilePath() {
        return this.linkTypeManager.cacheFilePath;
    }

    async getIssueLinkTypes() {
        return this.linkTypeManager.getIssueLinkTypes();
    }
    async resolveLinkTypeId(linkTypeName: string) {
        return this.linkTypeManager.resolveLinkTypeId(linkTypeName);
    }
    async linkIssues(sourceKey: string, linkedIssues: Array<{ key: string; linkType: string }>) {
        return this.linkOperations.linkIssues(sourceKey, linkedIssues);
    }
    async createIssueLink(sourceKey: string, targetKey: string, linkTypeName: string) {
        return this.linkOperations.createIssueLink(sourceKey, targetKey, linkTypeName);
    }
    async _getPreconditionFieldId() {
        return this.preconditionHandler._getPreconditionFieldId();
    }
    async associatePrecondition(testKey: string, preconditionKey: string) {
        return this.preconditionHandler.associatePrecondition(testKey, preconditionKey);
    }
    async _resolvePreconditionIssueTypeId() {
        return this.preconditionHandler._resolvePreconditionIssueTypeId();
    }
    async listPreconditions(project: string, maxResults = 200) {
        return this.preconditionHandler.listPreconditions(project, maxResults);
    }
    async createPrecondition(project: string, summary: string) {
        return this.preconditionHandler.createPrecondition(project, summary);
    }

    async listTestExecutions(project: string, maxResults = 20): Promise<TestExecutionSummary[]> {
        const jql = `project=${project}+AND+issuetype="Test Execution"+ORDER+BY+created+DESC`;
        const response = await this.jiraResource.searchJiraIssues(jql, maxResults);
        return (response.issues || []).map(
            (issue: { key: string; fields: { summary?: string; status?: { name?: string }; created?: string } }) => ({
                key: issue.key,
                summary: issue.fields?.summary || '',
                status: issue.fields?.status?.name || '',
                created: issue.fields?.created || '',
            }),
        );
    }

    async validateTestExecutionKey(issueKey: string): Promise<void> {
        const issue = await this.jiraResource.getJiraResource<{
            fields: { issuetype?: { name: string } };
        }>('issue/' + issueKey + '?fields=issuetype');
        if (!issue?.fields?.issuetype) {
            throw new Error('Issue "' + issueKey + '" não encontrada');
        }
        if (issue.fields.issuetype.name !== 'Test Execution') {
            throw new Error('"' + issueKey + '" não é uma Test Execution (tipo: ' + issue.fields.issuetype.name + ')');
        }
    }

    async getTestCaseSummaries(keys: string[]): Promise<Array<{ key: string; summary: string }>> {
        if (keys.length === 0) return [];
        const results: Array<{ key: string; summary: string }> = [];
        for (const key of keys) {
            try {
                const issue = await this.jiraResource.getJiraResource<{
                    key: string;
                    fields?: { summary?: string };
                }>('issue/' + key + '?fields=summary');
                results.push({
                    key: issue.key,
                    summary: issue.fields?.summary || '',
                });
            } catch {
                results.push({ key, summary: '(key not found)' });
            }
        }
        return results;
    }
}

export default JiraLinkManager;
