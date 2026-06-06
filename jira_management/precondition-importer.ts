import { info } from '../shared/prompt.js';
import { rootLogger } from '../shared/logger.js';
import type { JsonObject, PreConditionSummary, JiraResourceLike } from '../shared/types.js';

interface IssueField {
    id: string;
    schema?: { custom?: string };
    [key: string]: unknown;
}

export class PreconditionHandler {
    jiraResource: JiraResourceLike;
    _preconditionFieldId?: string;
    _preconditionIssueTypeId: string | undefined;

    constructor(jiraResource: JiraResourceLike) {
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
        } catch (err: unknown) {
            rootLogger.warn(
                'Não foi possível descobrir field ID para pre-condition, usando fallback 13708: ' +
                    (err as Error).message,
            );
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
        return this.jiraResource.putJiraResource<JsonObject>(`issue/${testKey}`, { fields: payload });
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

    /** Search for an existing Pre-condition by exact summary match using JQL.
     * Returns the issue key if found, null otherwise. */
    async findExistingPrecondition(project: string, summary: string): Promise<string | null> {
        const escaped = summary.replace(/['\\]/g, '\\\\$&');
        const jql = `project=${project}+AND+issuetype="Pre-condition"+AND+summary~"${escaped}"`;
        const response = await this.jiraResource.searchJiraIssues(jql, 5);
        if (response.issues && response.issues.length > 0) {
            const exact = response.issues.find(
                (i: { key: string; fields: { summary?: string } }) =>
                    (i.fields?.summary || '').toLowerCase().trim() === summary.toLowerCase().trim(),
            );
            if (exact) return exact.key;
        }
        return null;
    }

    async createPrecondition(project: string, summary: string): Promise<string> {
        const existing = await this.findExistingPrecondition(project, summary);
        if (existing) {
            info(`Pre-condition já existe: ${existing} — reutilizando`);
            return existing;
        }
        const issueTypeId = await this._resolvePreconditionIssueTypeId();
        const payload = {
            fields: {
                project: { key: project },
                summary,
                issuetype: { id: issueTypeId },
            },
        };
        const result = await this.jiraResource.postJiraResource<JsonObject>('issue', payload);
        return result.key as string;
    }
}
