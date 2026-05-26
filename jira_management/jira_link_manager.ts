import fs from 'fs';
import path from 'path';
import os from 'os';
import { info } from '../shared/prompt';
import { rootLogger } from '../shared/logger';
import type { JsonObject } from '../shared/types';
import type JiraResource from './jira_resource';

const FALLBACK_LINK_TYPES = [
    { id: '11701', name: 'Relates', inward: 'relates to', outward: 'relates to' },
    { id: '10201', name: 'Tests', inward: 'is tested by', outward: 'tests' },
    { id: '10200', name: 'Tested by', inward: 'tested by', outward: 'tests' },
];

interface LinkType {
    id: string;
    name?: string;
    inward?: string;
    outward?: string;
}

interface IssueField {
    id: string;
    schema?: { custom?: string };
    [key: string]: unknown;
}

class JiraLinkManager {
    jiraResource: JiraResource;
    linkTypesCache: LinkType[] | null;
    cacheFilePath: string;
    _preconditionFieldId?: string;

    constructor(jiraResource: JiraResource) {
        this.jiraResource = jiraResource;
        this.linkTypesCache = null;
        this.cacheFilePath = path.join(os.homedir(), '.qa_tools_link_types_cache.json');
    }

    async getIssueLinkTypes(): Promise<LinkType[]> {
        if (this.linkTypesCache) return this.linkTypesCache;

        try {
            const data = await this.jiraResource.getJiraResource<{ issueLinkTypes?: LinkType[] }>('issueLinkType');
            if (data && data.issueLinkTypes) {
                this.linkTypesCache = data.issueLinkTypes;
                try {
                    fs.writeFileSync(this.cacheFilePath, JSON.stringify(data.issueLinkTypes), 'utf8');
                } catch (err) {
                    rootLogger.warn('Falha ao escrever cache de link types: ' + (err as Error).message);
                }
                return this.linkTypesCache;
            }
        } catch {
            rootLogger.warn('getIssueLinkTypes — API falhou, verificando cache local...');
        }

        try {
            if (fs.existsSync(this.cacheFilePath)) {
                this.linkTypesCache = JSON.parse(fs.readFileSync(this.cacheFilePath, 'utf8')) as LinkType[];
                return this.linkTypesCache;
            }
        } catch (err) {
            rootLogger.warn('Falha ao ler cache de link types: ' + (err as Error).message);
        }

        this.linkTypesCache = FALLBACK_LINK_TYPES;
        return this.linkTypesCache;
    }

    async resolveLinkTypeId(linkTypeName: string): Promise<string> {
        const types = await this.getIssueLinkTypes();
        const lowerName = linkTypeName.toLowerCase().trim();

        const match = types.find(
            (t) =>
                (t.name && t.name.toLowerCase() === lowerName) ||
                (t.inward && t.inward.toLowerCase() === lowerName) ||
                (t.outward && t.outward.toLowerCase() === lowerName),
        );

        if (match) return match.id;

        rootLogger.warn(`Tipo de link '${linkTypeName}' não encontrado, usando 'relates to' como fallback`);
        return '11701';
    }

    async linkIssues(sourceKey: string, linkedIssues: Array<{ key: string; linkType: string }>): Promise<void> {
        for (const li of linkedIssues) {
            const linkTypeId = await this.resolveLinkTypeId(li.linkType);
            const payload = {
                type: { id: linkTypeId },
                inwardIssue: { key: sourceKey },
                outwardIssue: { key: li.key },
            };
            info(`Linkando ${sourceKey} -> ${li.key} (tipo: ${li.linkType})...`);
            await this.jiraResource.postJiraResource('issueLink', payload);
        }
    }

    async _getPreconditionFieldId(): Promise<string> {
        if (this._preconditionFieldId) return this._preconditionFieldId;
        try {
            const fields = await this.jiraResource.getJiraResource<IssueField[]>('field');
            if (Array.isArray(fields)) {
                const match = fields.find(
                    (f) => f.schema?.custom === 'com.xpandit.plugins.xray:test-precondition-custom-field',
                );
                if (match) {
                    this._preconditionFieldId = match.id;
                    return match.id;
                }
            }
        } catch {
            rootLogger.warn('Não foi possível descobrir field ID para pre-condition, usando fallback 13708');
        }
        this._preconditionFieldId = 'customfield_13708';
        return this._preconditionFieldId;
    }

    async createIssueLink(sourceKey: string, targetKey: string, linkTypeName: string): Promise<JsonObject> {
        const linkTypeId = await this.resolveLinkTypeId(linkTypeName);
        const payload = {
            type: { id: linkTypeId },
            inwardIssue: { key: targetKey },
            outwardIssue: { key: sourceKey },
        };
        return this.jiraResource.postJiraResource('issueLink', payload);
    }

    async associatePrecondition(testKey: string, preconditionKey: string): Promise<JsonObject | null> {
        const fieldId = await this._getPreconditionFieldId();
        info(`Associando pre-condition ${preconditionKey} ao teste ${testKey}...`);
        const testIssue = await this.jiraResource.getJiraResource<{ fields?: JsonObject }>(`issue/${testKey}`);
        const current = ((testIssue && testIssue.fields && testIssue.fields[fieldId]) as string[]) || [];
        if (!current.includes(preconditionKey)) {
            current.push(preconditionKey);
        }
        const payload: JsonObject = {};
        payload[fieldId] = current;
        return this.jiraResource.putJiraResource(`issue/${testKey}`, { fields: payload });
    }
}

export default JiraLinkManager;
