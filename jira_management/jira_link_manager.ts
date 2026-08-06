import { formatErr } from '../shared/errors.js';
import type { TestExecutionSummary, JiraResourceLike } from '../shared/types.js';
import { rootLogger } from '../shared/logger.js';
import { LinkTypeManager } from './link-types.js';
import { IssueLinkService } from './services/issue-link.service.js';
import {
    PreconditionHandler,
    matchPreconditionByTokenOverlap,
    matchPreconditionByDualThreshold,
} from './precondition-handler.js';

export { matchPreconditionByTokenOverlap, matchPreconditionByDualThreshold };

class JiraLinkManager {
    jiraResource: JiraResourceLike;
    linkTypeManager: LinkTypeManager;
    issueLinkService: IssueLinkService;
    preconditionHandler: PreconditionHandler;

    constructor(jiraResource: JiraResourceLike) {
        this.jiraResource = jiraResource;
        this.linkTypeManager = new LinkTypeManager(jiraResource);
        this.issueLinkService = new IssueLinkService(jiraResource, this.linkTypeManager);
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
    async linkTestsToRequirement(requirementKey: string, testKeys: string[]) {
        return this.issueLinkService.linkTestsToRequirement(requirementKey, testKeys);
    }
    async linkTestToTestExecution(teKey: string, testKeys: string[]) {
        return this.issueLinkService.linkTestToTestExecution(teKey, testKeys);
    }
    async linkRelated(sourceKey: string, targetKeys: string[]) {
        return this.issueLinkService.linkRelated(sourceKey, targetKeys);
    }
    async linkPreCondition(testKey: string, preconditionKeys: string[]) {
        return this.issueLinkService.linkPreCondition(testKey, preconditionKeys);
    }
    async linkSourceToTargets(sourceKey: string, targets: Array<{ key: string; linkType: string }>) {
        return this.issueLinkService.linkSourceToTargets(sourceKey, targets);
    }
    async createLink(input: { linkType: string; inwardKey: string; outwardKey: string }) {
        return this.issueLinkService.createLink(input);
    }
    async getIssueLinks(issueKey: string) {
        return this.issueLinkService.getIssueLinks(issueKey);
    }
    async getIssueLinksByType(issueKey: string, linkTypeName: string) {
        return this.issueLinkService.getIssueLinksByType(issueKey, linkTypeName);
    }
    async removeIssueLink(linkId: string) {
        return this.issueLinkService.removeIssueLink(linkId);
    }
    async clearIssueLinksByType(issueKey: string, linkTypeName: string) {
        return this.issueLinkService.clearIssueLinksByType(issueKey, linkTypeName);
    }
    async _getPreconditionFieldId() {
        return this.preconditionHandler._getPreconditionFieldId();
    }
    async associatePrecondition(testKey: string, preconditionKey: string | string[]) {
        const keys = Array.isArray(preconditionKey) ? preconditionKey : [preconditionKey];
        if (this.preconditionHandler.isCloud && !this.preconditionHandler.hasXrayCreds) {
            rootLogger.info(
                'JiraLinkManager: limpando issue links Pre-Condition existentes em ' +
                    testKey +
                    ' antes de associar...',
            );
            const removed = await this.issueLinkService.clearIssueLinksByType(testKey, 'Pre-Condition');
            if (removed > 0) {
                rootLogger.info(
                    'JiraLinkManager: ' + removed + ' issue link(s) Pre-Condition removido(s) de ' + testKey,
                );
            }
            const result = await this.issueLinkService.linkPreCondition(testKey, keys);
            if (result.missing.length > 0) {
                rootLogger.warn('JiraLinkManager: pre-condition key(s) inexistente(s): ' + result.missing.join(', '));
            }
            if (result.failed.length > 0) {
                rootLogger.warn('JiraLinkManager: falha ao associar pre-condition(s): ' + result.failed.join(', '));
            }
            return null;
        }
        return this.preconditionHandler.associatePrecondition(testKey, keys);
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
