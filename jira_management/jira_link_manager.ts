import { formatErr } from '../shared/errors.js';
import type { TestExecutionSummary, JiraResourceLike } from '../shared/types.js';
import { rootLogger } from '../shared/logger.js';
import { LinkTypeManager } from './link-types.js';
import { LinkOperations } from './link-operations.js';
import {
    PreconditionHandler,
    matchPreconditionByTokenOverlap,
    matchPreconditionByDualThreshold,
} from './precondition-handler.js';

export { matchPreconditionByTokenOverlap, matchPreconditionByDualThreshold };

class JiraLinkManager {
    jiraResource: JiraResourceLike;
    linkTypeManager: LinkTypeManager;
    linkOperations: LinkOperations;
    preconditionHandler: PreconditionHandler;

    constructor(jiraResource: JiraResourceLike) {
        this.jiraResource = jiraResource;
        this.linkTypeManager = new LinkTypeManager(jiraResource);
        this.linkOperations = new LinkOperations(jiraResource, this.linkTypeManager);
        this.preconditionHandler = new PreconditionHandler(jiraResource, this);
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
        return response.issues.map(
            (issue: { key: string; fields: { summary?: string; status?: { name?: string }; created?: string } }) => ({
                key: issue.key,
                summary: issue.fields.summary || '',
                status: issue.fields.status?.name || '',
                created: issue.fields.created || '',
            }),
        );
    }

    async validateTestExecutionKey(issueKey: string): Promise<boolean> {
        try {
            const issue = await this.jiraResource.getJiraResource<{
                fields: { issuetype?: { name: string } };
            }>('issue/' + issueKey + '?fields=issuetype');
            if (!issue.fields.issuetype) {
                rootLogger.warn('Issue "' + issueKey + '" não encontrada');
                return false;
            }
            if (issue.fields.issuetype.name !== 'Test Execution') {
                rootLogger.warn(
                    '"' + issueKey + '" não é uma Test Execution (tipo: ' + issue.fields.issuetype.name + ')',
                );
                return false;
            }
            return true;
        } catch (err) {
            rootLogger.error('Erro ao validar Test Execution key: ' + formatErr(err));
            return false;
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
            } catch (err) {
                rootLogger.warn('JiraLinkManager: key not found: ' + key + ': ' + formatErr(err));
                results.push({ key, summary: '(key not found)' });
            }
        }
        return results;
    }
}

export default JiraLinkManager;
