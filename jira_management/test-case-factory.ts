import { success, onError, isQuiet, ProgressBar } from '../shared/prompt';
import type JiraResource from './jira_resource';
import type { JsonObject, LogContext, TestCase } from '../shared/types';

interface CreateIssueResult {
    key?: string;
    action?: string;
}

interface StepsResult {
    action?: string;
}

class TestCaseFactory {
    jiraResource: JiraResource;
    jiraResourceXray: JiraResource;

    constructor(jiraResource: JiraResource, jiraResourceXray: JiraResource) {
        this.jiraResource = jiraResource;
        this.jiraResourceXray = jiraResourceXray;
    }

    async createIssue(
        testData: JsonObject,
        testTitle: string,
        testIdx: number,
        totalTests: number,
        opLog: { info: (msg: string, meta?: LogContext) => void },
    ): Promise<CreateIssueResult> {
        try {
            const issue = await this.jiraResource.postJiraResource('issue', testData);
            if (!isQuiet()) success('Issue criada: ' + String(issue.key));
            opLog.info('Issue criada', { key: issue.key });
            return { key: issue.key as string };
        } catch (err) {
            const action = await onError(
                '[' + (testIdx + 1) + '/' + totalTests + '] Criar issue "' + testTitle + '"',
                err,
                { retry: true, details: true },
            );
            return { action };
        }
    }

    async postSteps(
        issueKey: string,
        test: TestCase,
        _opLog: { info: (msg: string, meta?: LogContext) => void },
    ): Promise<StepsResult | null> {
        let abortSteps = false;
        const stepBar = !isQuiet() ? new ProgressBar(test.steps.length, { width: 15 }) : null;
        for (let i = 0; i < test.steps.length; i++) {
            try {
                await this.jiraResourceXray.postJiraResource('test/' + issueKey + '/steps', {
                    index: i + 1,
                    ...test.steps[i],
                });
                if (stepBar) stepBar.update(i + 1);
            } catch (err) {
                const action = await onError('  Step ' + (i + 1) + ' de "' + test.title + '"', err, { details: true });
                if (action === 'abort') {
                    abortSteps = true;
                    break;
                }
            }
        }
        if (stepBar) stepBar.stop();
        return abortSteps ? { action: 'abort' } : null;
    }
}

export default TestCaseFactory;
