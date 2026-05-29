import { info } from '../shared/prompt';
import { rootLogger } from '../shared/logger';
import type { JsonObject, PreConditionSummary, PreConditionMatchResult } from '../shared/types';
import type JiraResource from './jira_resource';

interface IssueField {
    id: string;
    schema?: { custom?: string };
    [key: string]: unknown;
}

export class PreconditionHandler {
    jiraResource: JiraResource;
    _preconditionFieldId?: string;
    _preconditionIssueTypeId: string | undefined;

    constructor(jiraResource: JiraResource) {
        this.jiraResource = jiraResource;
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

    async listPreconditions(project: string, maxResults = 200): Promise<PreConditionSummary[]> {
        const jql = `project=${project}+AND+issuetype="Pre-condition"+ORDER+BY+summary`;
        const response = await this.jiraResource.searchJiraIssues(jql, maxResults);
        return (response.issues || []).map((issue: { key: string; fields: { summary?: string } }) => ({
            key: issue.key,
            summary: issue.fields?.summary || '',
        }));
    }

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

/** Stopwords (English + Portuguese) for asymmetric token verification. */
const STOPWORDS = new Set([
    'a',
    'an',
    'the',
    'in',
    'on',
    'at',
    'to',
    'for',
    'of',
    'with',
    'by',
    'from',
    'up',
    'into',
    'over',
    'be',
    'is',
    'are',
    'was',
    'were',
    'been',
    'have',
    'has',
    'had',
    'do',
    'does',
    'did',
    'will',
    'would',
    'shall',
    'should',
    'may',
    'might',
    'can',
    'could',
    'must',
    'need',
    'not',
    'no',
    'or',
    'and',
    'but',
    'if',
    'as',
    'so',
    'than',
    'that',
    'this',
    'these',
    'those',
    'it',
    'its',
    'each',
    'every',
    'all',
    'any',
    'some',
    'such',
    'only',
    'own',
    'same',
    'very',
    'just',
    'about',
    'after',
    'before',
    'between',
    'through',
    'during',
    'without',
    'within',
    'along',
    'o',
    'a',
    'os',
    'as',
    'de',
    'da',
    'do',
    'das',
    'dos',
    'para',
    'com',
    'por',
    'no',
    'na',
    'num',
    'numa',
    'em',
    'um',
    'uma',
    'uns',
    'umas',
    'ao',
    'aos',
    'pela',
    'pelas',
    'pelo',
    'pelos',
    'ser',
    'estar',
    'ter',
    'é',
    'são',
    'foi',
    'não',
    'se',
    'que',
    'como',
    'já',
    'só',
    'mais',
    'entre',
    'sobre',
    'após',
    'até',
    'sob',
    'ante',
    'desde',
    'sem',
    'conforme',
    'segundo',
]);

export function matchPreconditionByTokenOverlap(
    query: string,
    candidates: PreConditionSummary[],
    threshold = 0.5,
): PreConditionMatchResult {
    const qLower = query.toLowerCase().trim();
    if (!qLower || candidates.length === 0) {
        return { key: '__create__', summary: query, matchType: 'create' };
    }
    const exact = candidates.find((c) => c.summary.toLowerCase().trim() === qLower);
    if (exact) {
        return { key: exact.key, summary: exact.summary, matchType: 'exact' };
    }
    const contain = candidates.find(
        (c) => c.summary.toLowerCase().includes(qLower) || qLower.includes(c.summary.toLowerCase()),
    );
    if (contain) {
        return { key: contain.key, summary: contain.summary, matchType: 'containment' };
    }
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

export function matchPreconditionByDualThreshold(
    query: string,
    candidates: PreConditionSummary[],
): PreConditionMatchResult {
    const qLower = query.toLowerCase().trim();
    if (!qLower || candidates.length === 0) {
        return { key: '__create__', summary: query, matchType: 'create' };
    }
    const exact = candidates.find((c) => c.summary.toLowerCase().trim() === qLower);
    if (exact) {
        return { key: exact.key, summary: exact.summary, matchType: 'exact' };
    }
    const contain = candidates.find(
        (c) => c.summary.toLowerCase().includes(qLower) || qLower.includes(c.summary.toLowerCase()),
    );
    if (contain) {
        return { key: contain.key, summary: contain.summary, matchType: 'containment' };
    }
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
    if (!best) {
        return { key: '__create__', summary: query, matchType: 'create' };
    }
    if (best.score >= 0.7) {
        return { key: best.candidate.key, summary: best.candidate.summary, matchType: 'overlap' };
    }
    if (best.score >= 0.5) {
        const qContentTokens = [...qWords].filter((w) => !STOPWORDS.has(w));
        const cContentTokens = new Set(
            [...best.candidate.summary.toLowerCase().split(/\s+/).filter(Boolean)].filter((w) => !STOPWORDS.has(w)),
        );
        const uniqueToQuery = qContentTokens.filter((w) => !cContentTokens.has(w));
        const uniqueToCandidate = [...cContentTokens].filter((w) => !qContentTokens.includes(w));
        if (uniqueToQuery.length > 0 && uniqueToCandidate.length > 0) {
            return { key: '__create__', summary: query, matchType: 'create' };
        }
        return { key: best.candidate.key, summary: best.candidate.summary, matchType: 'overlap' };
    }
    return { key: '__create__', summary: query, matchType: 'create' };
}
