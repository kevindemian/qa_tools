/** Xray Cloud (GraphQL authentication + step import) and Server (REST) client. */
import { formatErr } from '../shared/errors.js';
import type { JiraResourceLike } from '../shared/types.js';
import type { TestStep } from '../shared/types.js';
import Config from '../shared/config-accessor.js';
import { XrayCloudClient } from '../shared/jira/xray-cloud-client.js';

export interface XrayStepImporter {
    importStep(issueKey: string, stepIndex: number, step: TestStep): Promise<void>;
    setSteps(issueKey: string, steps: TestStep[]): Promise<void>;
}

class ServerStepImporter implements XrayStepImporter {
    constructor(private readonly jiraResource: JiraResourceLike) {}

    async importStep(issueKey: string, stepIndex: number, step: TestStep): Promise<void> {
        await this.jiraResource.postJiraResource('test/' + issueKey + '/steps', {
            index: stepIndex,
            ...step,
        });
    }

    async setSteps(issueKey: string, steps: TestStep[]): Promise<void> {
        for (let i = 0; i < steps.length; i++) {
            const step = steps[i];
            if (step) await this.importStep(issueKey, i + 1, step);
        }
    }
}

class CloudStepImporter implements XrayStepImporter {
    private readonly cloudClient: XrayCloudClient;
    private readonly jiraResource: JiraResourceLike | undefined;

    constructor(jiraResource?: JiraResourceLike) {
        this.cloudClient = new XrayCloudClient();
        this.jiraResource = jiraResource;
    }

    private _getCredentials(): { clientId: string; clientSecret: string } {
        const cfg = Config.getDefault();
        const clientId = cfg.get('xrayClientId');
        const clientSecret = cfg.get('xrayClientSecret');
        if (!clientId || !clientSecret) {
            throw new Error('XRAY_CLIENT_ID and XRAY_CLIENT_SECRET must be set for Xray Cloud mode');
        }
        return { clientId, clientSecret };
    }

    /** Xray Cloud GraphQL identifies tests by the numeric Jira issue id (not the key). */
    private async _resolveNumericId(issueKey: string): Promise<string> {
        if (!this.jiraResource) {
            throw new Error('CloudStepImporter requires a JiraResource to resolve issue key to numeric id');
        }
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

    async importStep(issueKey: string, _stepIndex: number, step: TestStep): Promise<void> {
        const { clientId, clientSecret } = this._getCredentials();
        const issueId = await this._resolveNumericId(issueKey);
        const mutation = `
            mutation AddTestStep($issueId: String!, $step: CreateStepInput!) {
                addTestStep(issueId: $issueId, step: $step) {
                    id
                }
            }
        `;
        const variables = {
            issueId,
            step: {
                action: step.fields.Action ?? '',
                result: step.fields['Expected Result'] ?? '',
                data: step.fields.Data ?? '',
            },
        };
        await this.cloudClient.graphqlMutation(mutation, variables, clientId, clientSecret);
    }

    /** Replace ALL steps of a test atomically.
     *  Uses `setTestSteps` mutation — safe for both new and existing tests. */
    async setSteps(issueKey: string, steps: TestStep[]): Promise<void> {
        const { clientId, clientSecret } = this._getCredentials();
        const issueId = await this._resolveNumericId(issueKey);
        await this.cloudClient.setTestSteps(
            issueId,
            steps.map((s) => ({
                action: s.fields.Action ?? '',
                result: s.fields['Expected Result'] ?? '',
                data: s.fields.Data ?? '',
            })),
            clientId,
            clientSecret,
        );
    }
}

export function createStepImporter(jiraResource: JiraResourceLike, mode: 'server' | 'cloud'): XrayStepImporter {
    return mode === 'cloud' ? new CloudStepImporter(jiraResource) : new ServerStepImporter(jiraResource);
}
