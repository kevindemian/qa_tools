import type JiraResource from './jira_resource';
import type { TestStep } from '../shared/types';

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
    // eslint-disable-next-line @typescript-eslint/require-await
    async importStep(_issueKey: string, _stepIndex: number, _step: TestStep): Promise<void> {
        throw new Error(
            'Xray Cloud: importStep not implemented — requires GraphQL mutation. ' +
                'Set XRAY_MODE=server to use the REST API.',
        );
    }
}

export function createStepImporter(jiraResource: JiraResource, mode: 'server' | 'cloud'): XrayStepImporter {
    return mode === 'cloud' ? new CloudStepImporter() : new ServerStepImporter(jiraResource);
}
