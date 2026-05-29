/** Issue-link management: resolve link types, create links, and associate pre-conditions via the Jira API. */
import fs from 'fs';
import path from 'path';
import { info } from '../shared/prompt';
import { rootLogger } from '../shared/logger';
import { tempDirPath } from '../shared/temp-dir';
import type { JsonObject, PreConditionSummary, PreConditionMatchResult, TestExecutionSummary } from '../shared/types';
import type JiraResource from './jira_resource';

/** Fallback link types usados quando a API `/issueLinkType` falha e o cache local está vazio.
 * @production IDs validados em `jiraprod.srv.euronext.com` em 2026-05-29.
 *   `Tests` = 10600 (NÃO 10201 como no backup original do fork GitLab).
 *   NÃO alterar sem revalidar contra API de produção (`GET /issueLinkType`).
 * {@link https://jiraprod.srv.euronext.com/rest/api/2/issueLinkType} */
const FALLBACK_LINK_TYPES = [
    { id: '11701', name: 'Relates', inward: 'relates to', outward: 'relates to' },
    { id: '10600', name: 'Tests', inward: 'is tested by', outward: 'tests' },
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

/** Resolves Jira issue-link types (with disk cache + fallbacks) and provides high-level linking operations. */
class JiraLinkManager {
    jiraResource: JiraResource;
    linkTypesCache: LinkType[] | null;
    cacheFilePath: string;
    _preconditionFieldId?: string;

    constructor(jiraResource: JiraResource) {
        this.jiraResource = jiraResource;
        this.linkTypesCache = null;
        this.cacheFilePath = path.join(tempDirPath(), 'cache', 'link-types-cache.json');
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

    _preconditionIssueTypeId: string | undefined;

    /** Discover the numeric issue type ID for "Pre-condition" via the Jira API.
     * Cached in-memory after the first call.
     * @returns Issue type ID string (e.g. `"11801"`).
     * @throws If the API fails or no matching issue type is found. */
    async _resolvePreconditionIssueTypeId(): Promise<string> {
        if (this._preconditionIssueTypeId) return this._preconditionIssueTypeId;
        const types = await this.jiraResource.getJiraResource<Array<{ id: string; name: string }>>('issuetype');
        const match = types.find((t) => t.name.toLowerCase() === 'pre-condition');
        if (!match) {
            throw new Error('Issue type "Pre-condition" não encontrado no Jira');
        }
        this._preconditionIssueTypeId = match.id;
        return match.id;
    }

    /** Fetch Test Execution issues for a project via JQL.
     * @param project - Project key (e.g. `"ECSPOL"`).
     * @param maxResults - Maximum number to return (default 20).
     * @returns Array of { key, summary, status, created }.
     * @throws On API failure. */
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

    /** Validate that a key belongs to a Test Execution issue type.
     * @param issueKey - The issue key (e.g. `"ECSPOL-TE-123"`).
     * @returns The issue key if valid, or throws.
     * @throws If the issue is not a Test Execution or doesn't exist. */
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

    /** Fetch summaries for a list of test issue keys.
     * @param keys - Array of issue keys.
     * @returns Array of { key, summary } pairs.
     * Slower but precise — one GET per key. For large batches, use searchJiraIssues instead. */
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

    /** Fetch existing pre-conditions for a project via JQL.
     * @param project - Project key (e.g. `"ECSPOL"`).
     * @param maxResults - Maximum number to return (default 200).
     * @returns Array of { key, summary }.
     * @throws On API failure. */
    async listPreconditions(project: string, maxResults = 200): Promise<PreConditionSummary[]> {
        const jql = `project=${project}+AND+issuetype="Pre-condition"+ORDER+BY+summary`;
        const response = await this.jiraResource.searchJiraIssues(jql, maxResults);
        return (response.issues || []).map((issue: { key: string; fields: { summary?: string } }) => ({
            key: issue.key,
            summary: issue.fields?.summary || '',
        }));
    }

    /** Create a new pre-condition issue in Jira.
     * @param project - Project key.
     * @param summary - Summary/title for the pre-condition.
     * @returns The new issue key (e.g. `"ECSPOL-NEW-42"`).
     * @throws On API failure. */
    async createPrecondition(project: string, summary: string): Promise<string> {
        const issueTypeId = await this._resolvePreconditionIssueTypeId();
        const payload = {
            fields: {
                project: { key: project },
                summary,
                issuetype: { id: issueTypeId },
            },
        };
        const result = await this.jiraResource.postJiraResource('issue', payload);
        return result.key as string;
    }
}

/** Match a desired precondition description against a list of available pre-conditions.
 * Uses exact match → containment → token overlap (Jaccard), returning the best non-create match.
 *
 * @param query - Desired precondition description (from LLM extraction).
 * @param candidates - Available pre-conditions from Jira.
 * @param threshold - Minimum Jaccard score for token overlap (default 0.5).
 * @returns A `PreConditionMatchResult` — `matchType` is 'create' when no candidate scores above threshold.
 *
 * @example
 * ```ts
 * matchPreconditionByTokenOverlap("User must be logged in", [
 *   { key: "PREC-1", summary: "User must be logged in" }   // exact match
 * ])
 * // → { key: "PREC-1", summary: "User must be logged in", matchType: "exact" }
 * ```
 * @public Exported for testing. */
export function matchPreconditionByTokenOverlap(
    query: string,
    candidates: PreConditionSummary[],
    threshold = 0.5,
): PreConditionMatchResult {
    const qLower = query.toLowerCase().trim();
    if (!qLower || candidates.length === 0) {
        return { key: '__create__', summary: query, matchType: 'create' };
    }

    // 1. Exact match
    const exact = candidates.find((c) => c.summary.toLowerCase().trim() === qLower);
    if (exact) {
        return { key: exact.key, summary: exact.summary, matchType: 'exact' };
    }

    // 2. Containment (one is substring of the other)
    const contain = candidates.find(
        (c) => c.summary.toLowerCase().includes(qLower) || qLower.includes(c.summary.toLowerCase()),
    );
    if (contain) {
        return { key: contain.key, summary: contain.summary, matchType: 'containment' };
    }

    // 3. Token overlap (Jaccard)
    const qWords = new Set(qLower.split(/\s+/).filter(Boolean));
    let best: { candidate: PreConditionSummary; score: number } | null = null;
    for (const c of candidates) {
        const cWords = new Set(c.summary.toLowerCase().split(/\s+/).filter(Boolean));
        const intersection = new Set([...qWords].filter((w) => cWords.has(w)));
        const union = new Set([...qWords, ...cWords]);
        const score = intersection.size / union.size;
        if (score > (best?.score ?? 0)) {
            best = { candidate: c, score };
        }
    }

    if (best && best.score >= threshold) {
        return { key: best.candidate.key, summary: best.candidate.summary, matchType: 'overlap' };
    }

    return { key: '__create__', summary: query, matchType: 'create' };
}

export default JiraLinkManager;
