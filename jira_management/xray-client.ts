/** Xray Cloud (GraphQL authentication + step import) and Server (REST) client. */
import axios from 'axios';
import type JiraResource from './jira_resource';
import type { TestStep } from '../shared/types';
import Config from '../shared/config';

const XRAY_AUTH_URL = 'https://xray.cloud.getxray.app/api/v2/authenticate';
const XRAY_GRAPHQL_URL = 'https://xray.cloud.getxray.app/api/v2/graphql';

export interface XrayStepImporter {
    importStep(issueKey: string, stepIndex: number, step: TestStep): Promise<void>;
}

class ServerStepImporter implements XrayStepImporter {
    constructor(private readonly jiraResource: JiraResource) {}

    async importStep(issueKey: string, stepIndex: number, step: TestStep): Promise<void> {
        await this.jiraResource.postJiraResource('test/' + issueKey + '/steps', {
            index: stepIndex,
            ...step,
        });
    }
}

class CloudStepImporter implements XrayStepImporter {
    private token: string | null = null;
    private tokenExpiresAt = 0;

    private async getToken(): Promise<string> {
        if (this.token && Date.now() < this.tokenExpiresAt) {
            return this.token;
        }
        const cfg = Config.getDefault();
        const clientId = cfg.xrayClientId;
        const clientSecret = cfg.xrayClientSecret;
        if (!clientId || !clientSecret) {
            throw new Error('XRAY_CLIENT_ID and XRAY_CLIENT_SECRET must be set for Xray Cloud mode');
        }
        const res = await axios.post<string>(XRAY_AUTH_URL, { client_id: clientId, client_secret: clientSecret });
        // Response is a JSON string literal with the token, e.g. "eyJ..."
        const raw = res.data;
        const token = typeof raw === 'string' ? raw.replace(/^"|"$/g, '') : raw;
        if (!token) {
            throw new Error('Xray Cloud authentication returned empty token');
        }
        this.token = token;
        this.tokenExpiresAt = Date.now() + 55 * 60 * 1000;
        return token;
    }

    async importStep(issueKey: string, stepIndex: number, step: TestStep): Promise<void> {
        let token: string;
        try {
            token = await this.getToken();
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            // eslint-disable-next-line preserve-caught-error
            throw new Error('Xray Cloud authentication failed: ' + msg);
        }
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
                result: step.fields.ExpectedResult ?? '',
                data: step.fields.Data ?? '',
            },
        };
        try {
            await axios.post(
                XRAY_GRAPHQL_URL,
                { query: mutation, variables },
                { headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' } },
            );
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            // eslint-disable-next-line preserve-caught-error
            throw new Error('Xray Cloud GraphQL mutation failed: ' + msg);
        }
    }
}

export function createStepImporter(jiraResource: JiraResource, mode: 'server' | 'cloud'): XrayStepImporter {
    return mode === 'cloud' ? new CloudStepImporter() : new ServerStepImporter(jiraResource);
}
