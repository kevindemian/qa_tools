/** Test-case factory — creates test issues in Jira via Xray REST API. */
import { success, info as promptInfo, onError, isQuiet, ProgressBar } from '../shared/prompt.js';
import type { JiraResourceLike } from '../shared/types.js';
import type { XrayStepImporter } from './xray-client.js';
import type { JsonObject, LogContext, TestCase } from '../shared/types.js';
import { rootLogger } from '../shared/logger.js';

interface CreateIssueResult {
    key?: string;
    action?: string;
    skipped?: boolean;
}

interface StepsResult {
    action?: string;
}

interface CreateIssueParams {
    testData: JsonObject;
    testTitle: string;
    testIdx: number;
    totalTests: number;
    opLog: { info: (msg: string, meta?: LogContext) => void };
    skipExisting?: boolean;
}

class TestCaseFactory {
    jiraResource: JiraResourceLike;
    stepImporter: XrayStepImporter;

    constructor(jiraResource: JiraResourceLike, stepImporter: XrayStepImporter) {
        this.jiraResource = jiraResource;
        this.stepImporter = stepImporter;
    }

    async createIssue(params: CreateIssueParams): Promise<CreateIssueResult> {
        const { testData, testTitle, testIdx, totalTests, opLog, skipExisting } = params;
        if (skipExisting && testTitle) {
            try {
                const jql = `project = "${((testData as Record<string, unknown>)['project'] as string) || ''}" AND summary ~ "${testTitle.replace(/"/g, '\\"')}"`;
                const existing = await this.jiraResource.searchJiraIssues(jql, 5);
                const found = existing.issues.find(
                    (i) => (i.fields['summary'] as string).trim().toLowerCase() === testTitle.trim().toLowerCase(),
                );
                if (found) {
                    const key = found.key;
                    if (!isQuiet()) promptInfo('Issue já existe, pulando: ' + key);
                    opLog.info('Issue pulada (já existe)', { key, title: testTitle });
                    return { key, skipped: true };
                }
            } catch (err) {
                rootLogger.warn(
                    'test-case-factory: skip-existing lookup failed: ' +
                        (err instanceof Error ? err.message : String(err)),
                );
            }
        }

        try {
            const issue = await this.jiraResource.postJiraResource<JsonObject>('issue', testData);
            if (!isQuiet()) success('Issue criada: ' + String(issue['key']));
            opLog.info('Issue criada', { key: issue['key'] });
            return { key: issue['key'] as string };
        } catch (err) {
            const action = onError('[' + (testIdx + 1) + '/' + totalTests + '] Criar issue "' + testTitle + '"', err, {
                retry: true,
                details: true,
            });
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
                await this.stepImporter.importStep(issueKey, i + 1, Reflect.get(test.steps, i));
                if (stepBar) stepBar.update(i + 1);
            } catch (err) {
                const action = onError('  Step ' + (i + 1) + ' de "' + test.title + '"', err, {
                    details: true,
                });
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
