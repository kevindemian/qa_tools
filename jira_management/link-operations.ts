import { info } from '../shared/prompt';
import type { JsonObject } from '../shared/types';
import type JiraResource from './jira_resource';
import type { LinkTypeManager } from './link-types';

export class LinkOperations {
    private readonly jiraResource: JiraResource;
    private readonly linkTypeManager: LinkTypeManager;

    constructor(jiraResource: JiraResource, linkTypeManager: LinkTypeManager) {
        this.jiraResource = jiraResource;
        this.linkTypeManager = linkTypeManager;
    }

    async linkIssues(sourceKey: string, linkedIssues: Array<{ key: string; linkType: string }>): Promise<void> {
        for (const li of linkedIssues) {
            const linkTypeId = await this.linkTypeManager.resolveLinkTypeId(li.linkType);
            const payload = {
                type: { id: linkTypeId },
                inwardIssue: { key: sourceKey },
                outwardIssue: { key: li.key },
            };
            info(`Linkando ${sourceKey} -> ${li.key} (tipo: ${li.linkType})...`);
            await this.jiraResource.postJiraResource('issueLink', payload);
        }
    }

    async createIssueLink(sourceKey: string, targetKey: string, linkTypeName: string): Promise<JsonObject> {
        const linkTypeId = await this.linkTypeManager.resolveLinkTypeId(linkTypeName);
        const payload = {
            type: { id: linkTypeId },
            inwardIssue: { key: targetKey },
            outwardIssue: { key: sourceKey },
        };
        return this.jiraResource.postJiraResource('issueLink', payload);
    }
}
