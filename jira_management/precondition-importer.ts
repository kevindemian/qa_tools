import { formatErr } from '../shared/errors.js';
import { info } from '../shared/ui/prompt.js';
import { rootLogger } from '../shared/logger.js';
import Config from '../shared/config-accessor.js';
import { XrayCloudClient } from '../shared/jira/xray-cloud-client.js';
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

    private _isCloud(): boolean {
        try {
            return Config.getDefault().get('jiraMode') === 'cloud';
        } catch {
            return false;
        }
    }

    get isCloud(): boolean {
        return this._isCloud();
    }

    get hasXrayCreds(): boolean {
        const clientId = Config.getDefault().get('xrayClientId');
        const clientSecret = Config.getDefault().get('xrayClientSecret');
        return Boolean(clientId && clientSecret);
    }

    private _xrayClient?: XrayCloudClient;

    private _getXrayClient(): XrayCloudClient {
        if (!this._xrayClient) this._xrayClient = new XrayCloudClient();
        return this._xrayClient;
    }

    /** Xray Cloud identifies issues by their numeric id (not the key). */
    private async _resolveNumericId(issueKey: string): Promise<string> {
        try {
            const issue = await this.jiraResource.getJiraResource<{ id?: string }>('issue/' + issueKey);
            if (!issue.id) {
                throw new Error('issue has no numeric id');
            }
            return issue.id;
        } catch (err) {
            throw new Error('Failed to resolve Jira issue key ' + issueKey + ' to numeric id: ' + formatErr(err), {
                cause: err,
            });
        }
    }

    async _getPreconditionFieldId(): Promise<string> {
        if (this._isCloud()) {
            throw new Error(
                'Cloud mode: Xray Cloud does not use the Jira Server precondition custom field. ' +
                    'Preconditions are associated via native issue links.',
            );
        }
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
                'Não foi possível descobrir field ID para pre-condition, usando fallback 13708: ' + formatErr(err),
            );
        }
        this._preconditionFieldId = 'customfield_13708';
        return this._preconditionFieldId;
    }

    async associatePrecondition(testKey: string, preconditionKey: string | string[]): Promise<JsonObject | null> {
        const keys = Array.isArray(preconditionKey) ? preconditionKey : [preconditionKey];
        if (this._isCloud()) {
            const clientId = Config.getDefault().get('xrayClientId');
            const clientSecret = Config.getDefault().get('xrayClientSecret');
            if (!clientId || !clientSecret) {
                throw new Error('XRAY_CLIENT_ID and XRAY_CLIENT_SECRET must be set for Xray Cloud mode');
            }
            const testId = await this._resolveNumericId(testKey);
            const precIds = await Promise.all(keys.map((k) => this._resolveNumericId(k)));

            info(`Limpando pre-conditions existentes do teste ${testKey} (id ${testId}) via Xray Cloud GraphQL...`);
            const existingIds = await this._getXrayClient().getTestPreconditions(testId, clientId, clientSecret);
            if (existingIds.length > 0) {
                info(`Removendo ${existingIds.length} pre-condition(s) existente(s): ${existingIds.join(', ')}`);
                await this._getXrayClient().removePreconditionsFromTest(testId, existingIds, clientId, clientSecret);
            }

            info(
                `Associando pre-conditions ${keys.join(', ')} (ids ${precIds.join(', ')}) ao teste ${testKey} ` +
                    `(id ${testId}) via Xray Cloud GraphQL addPreconditionsToTest...`,
            );
            await this._getXrayClient().addPreconditionsToTest(testId, precIds, clientId, clientSecret);
            return null;
        }
        const fieldId = await this._getPreconditionFieldId();
        info(`Associando pre-conditions ${keys.join(', ')} ao teste ${testKey} (atomic replace)...`);
        const payload: JsonObject = {};
        Reflect.set(payload, fieldId, keys);
        return this.jiraResource.putJiraResource<JsonObject>(`issue/${testKey}`, { fields: payload });
    }

    async _resolvePreconditionIssueTypeId(): Promise<string> {
        if (this._preconditionIssueTypeId) return this._preconditionIssueTypeId;
        const types = await this.jiraResource.getJiraResource<Array<{ id: string; name: string }>>('issuetype');
        const match = types.find((t) => {
            const norm = (t.name || '').toLowerCase().replace(/[-_]/g, '');
            return norm === 'precondition';
        });
        if (!match) {
            throw new Error('Issue type "Pre-condition" não encontrado no Jira');
        }
        this._preconditionIssueTypeId = match.id;
        return match.id;
    }

    async listPreconditions(project: string, maxResults = 200): Promise<PreConditionSummary[]> {
        const jql = `project=${project}+AND+issuetype="Pre-condition"+ORDER+BY+summary`;
        const response = await this.jiraResource.searchJiraIssues(jql, maxResults);
        return response.issues.map((issue: { key: string; fields: { summary?: string } }) => ({
            key: issue.key,
            summary: issue.fields.summary || '',
        }));
    }

    /** Search for an existing Pre-condition by exact summary match using JQL.
     * Returns the issue key if found, null otherwise. */
    async findExistingPrecondition(project: string, summary: string): Promise<string | null> {
        const escaped = summary.replace(/['\\]/g, '\\\\$&');
        const jql = `project=${project}+AND+issuetype="Pre-condition"+AND+summary~"${escaped}"`;
        const response = await this.jiraResource.searchJiraIssues(jql, 5);
        if (response.issues.length > 0) {
            const exact = response.issues.find(
                (i: { key: string; fields: { summary?: string } }) =>
                    (i.fields.summary || '').toLowerCase().trim() === summary.toLowerCase().trim(),
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
        return result['key'] as string;
    }
}
