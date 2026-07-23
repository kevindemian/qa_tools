import { info } from '../shared/ui/prompt.js';
import { formatErr } from '../shared/errors.js';
import { rootLogger } from '../shared/logger.js';
import type { JsonObject, JiraResourceLike } from '../shared/types.js';
import type { LinkTypeManager } from './link-types.js';

interface IssueLinkEntry {
    id: string;
    type?: { name?: string };
    outwardIssue?: { key: string };
    inwardIssue?: { key: string };
}

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

    async getIssueLinksByType(
        sourceKey: string,
        linkTypeName: string,
    ): Promise<Array<{ id: string; targetKey: string }>> {
        const issue = await this.jiraResource.getJiraResource<{
            fields?: { issuelinks?: IssueLinkEntry[] };
        }>('issue/' + sourceKey + '?fields=issuelinks');
        return (issue.fields?.issuelinks ?? [])
            .filter((link) => link.type?.name === linkTypeName && link.id)
            .map((link) => ({
                id: link.id!,
                targetKey: link.outwardIssue?.key ?? link.inwardIssue?.key ?? '',
            }));
    }

    async removeIssueLink(linkId: string): Promise<void> {
        await this.jiraResource.deleteJiraResource('issueLink/' + linkId);
    }

    async clearIssueLinksByType(sourceKey: string, linkTypeName: string): Promise<number> {
        let links: Array<{ id: string; targetKey: string }>;
        try {
            links = await this.getIssueLinksByType(sourceKey, linkTypeName);
        } catch (err) {
            rootLogger.warn(
                'LinkOperations: falha ao listar issue links de "' +
                    linkTypeName +
                    '" em ' +
                    sourceKey +
                    ': ' +
                    formatErr(err),
            );
            return 0;
        }
        let removed = 0;
        for (const link of links) {
            try {
                await this.removeIssueLink(link.id);
                removed++;
            } catch (err) {
                rootLogger.warn(
                    'LinkOperations: falha ao remover issue link ' +
                        link.id +
                        ' (' +
                        link.targetKey +
                        '): ' +
                        formatErr(err),
                );
            }
        }
        return removed;
    }
}
