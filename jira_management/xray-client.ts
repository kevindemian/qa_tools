/** Xray Cloud (GraphQL authentication + step import) and Server (REST) client. */
import type { JiraResourceLike } from '../shared/types.js';
import type { TestStep } from '../shared/types.js';
import Config from '../shared/config.js';
import { XrayCloudClient } from '../shared/xray-cloud-client.js';

export interface XrayStepImporter {
    importStep(issueKey: string, stepIndex: number, step: TestStep): Promise<void>;
}

class ServerStepImporter implements XrayStepImporter {
    constructor(private readonly jiraResource: JiraResourceLike) {}

    async importStep(issueKey: string, stepIndex: number, step: TestStep): Promise<void> {
        await this.jiraResource.postJiraResource('test/' + issueKey + '/steps', {
            index: stepIndex,
            ...step,
        });
    }
}

class CloudStepImporter implements XrayStepImporter {
    private readonly cloudClient: XrayCloudClient;

    constructor() {
        this.cloudClient = new XrayCloudClient();
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

    async importStep(issueKey: string, stepIndex: number, step: TestStep): Promise<void> {
        const { clientId, clientSecret } = this._getCredentials();
        const mutation = `
            mutation AddTestStep($issueId: String!, $index: Int!, $step: TestStepInput!) {
                addTestStep(issueId: $issueId, index: $index, step: $step) {
                    id
                }
            }
        `;
        const variables = {
            issueId: issueKey,
            index: stepIndex,
            step: {
                action: step.fields.Action ?? '',
                result: step.fields['Expected Result'] ?? '',
                data: step.fields.Data ?? '',
            },
        };
        await this.cloudClient.graphqlMutation(mutation, variables, clientId, clientSecret);
    }
}

export function createStepImporter(jiraResource: JiraResourceLike, mode: 'server' | 'cloud'): XrayStepImporter {
    return mode === 'cloud' ? new CloudStepImporter() : new ServerStepImporter(jiraResource);
}
