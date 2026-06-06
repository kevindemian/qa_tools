import { info } from '../shared/prompt.js';
import type { JsonObject, JiraResourceLike } from '../shared/types.js';
import type { LinkTypeManager } from './link-types.js';

export class LinkOperations {
    private readonly jiraResource: JiraResourceLike;
    private readonly linkTypeManager: LinkTypeManager;

    constructor(jiraResource: JiraResourceLike, linkTypeManager: LinkTypeManager) {
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
