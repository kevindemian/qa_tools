import { formatErr } from '../shared/errors.js';
import fs from 'fs';
import path from 'path';
import { rootLogger } from '../shared/logger.js';
import { tempDirPath } from '../shared/temp-dir.js';
import type { JiraResourceLike } from '../shared/types.js';

export interface LinkType {
    id: string;
    name?: string;
    inward?: string;
    outward?: string;
}

const FALLBACK_LINK_TYPES: LinkType[] = [
    { id: '11701', name: 'Relates', inward: 'relates to', outward: 'relates to' },
    { id: '10600', name: 'Tests', inward: 'is tested by', outward: 'tests' },
    { id: '10200', name: 'Tested by', inward: 'tested by', outward: 'tests' },
];

export class LinkTypeManager {
    jiraResource: JiraResourceLike;
    linkTypesCache: LinkType[] | null;
    cacheFilePath: string;

    constructor(jiraResource: JiraResourceLike) {
        this.jiraResource = jiraResource;
        this.linkTypesCache = null;
        this.cacheFilePath = path.join(tempDirPath(), 'cache', 'link-types-cache.json');
    }

    async getIssueLinkTypes(): Promise<LinkType[]> {
        if (this.linkTypesCache) return this.linkTypesCache;
        try {
            const data = await this.jiraResource.getJiraResource<{ issueLinkTypes?: LinkType[] }>('issueLinkType');
            if (data.issueLinkTypes) {
                this.linkTypesCache = data.issueLinkTypes;
                try {
                    fs.writeFileSync(path.resolve(this.cacheFilePath), JSON.stringify(data.issueLinkTypes), 'utf8');
                } catch (err) {
                    rootLogger.warn('Falha ao escrever cache de link types: ' + formatErr(err));
                }
                return this.linkTypesCache;
            }
        } catch (err: unknown) {
            rootLogger.warn('getIssueLinkTypes — API falhou, verificando cache local... ' + formatErr(err));
        }
        try {
            if (fs.existsSync(path.resolve(this.cacheFilePath))) {
                const raw = fs.readFileSync(path.resolve(this.cacheFilePath), 'utf8');
                const parsed: unknown = JSON.parse(raw);
                if (Array.isArray(parsed)) {
                    this.linkTypesCache = parsed.filter(
                        (item): item is LinkType => item !== null && typeof item === 'object' && 'id' in item,
                    );
                    return this.linkTypesCache;
                }
            }
        } catch (err) {
            rootLogger.warn('Falha ao ler cache de link types: ' + formatErr(err));
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
}
