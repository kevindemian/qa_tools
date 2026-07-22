/** Test-case factory — creates test issues in Jira via Xray REST API. */
import { success, info as promptInfo, warn, onError, isQuiet, ProgressBar } from '../shared/ui/prompt.js';
import type { JiraResourceLike } from '../shared/types.js';
import type { XrayStepImporter } from './xray-client.js';
import type { JsonObject, LogContext, TestCase } from '../shared/types.js';
import { rootLogger } from '../shared/logger.js';

interface CreateIssueResult {
    key?: string;
    action?: string;
    skipped?: boolean;
    updated?: boolean;
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

        // Try to find and update existing issue if skipExisting is enabled
        if (skipExisting && testTitle) {
            const updateResult = await this._tryUpdateExisting(testData, testTitle, opLog);
            if (updateResult) return updateResult;
        }

        // Create new issue
        return this._createNewIssue(testData, testTitle, testIdx, totalTests, opLog);
    }

    private async _tryUpdateExisting(
        testData: JsonObject,
        testTitle: string,
        opLog: { info: (msg: string, meta?: LogContext) => void },
    ): Promise<CreateIssueResult | null> {
        const jql = `project = "${((testData as Record<string, unknown>)['project'] as string) || ''}" AND summary ~ "${testTitle.replace(/"/g, '\\"')}"`;
        
        let existing;
        try {
            existing = await this.jiraResource.searchJiraIssues(jql, 5);
        } catch (err) {
            rootLogger.warn('test-case-factory: busca de issue existente falhou: ' + (err instanceof Error ? err.message : String(err)));
            return null;
        }

        const found = existing.issues.find(
            (i) => (i.fields['summary'] as string).trim().toLowerCase() === testTitle.trim().toLowerCase(),
        );

        if (!found) return null;

        const key = found.key;
        try {
            await this.jiraResource.putJiraResource(`issue/${key}`, { fields: testData });
            if (!isQuiet()) promptInfo('Issue atualizada: ' + key);
            opLog.info('Issue atualizada', { key, title: testTitle });
            return { key, updated: true };
        } catch (updateErr) {
            const msg = 'falha ao atualizar issue ' + key + ': ' + (updateErr instanceof Error ? updateErr.message : String(updateErr));
            rootLogger.warn('test-case-factory: ' + msg);
            warn('[aviso] ' + msg);
            if (!isQuiet()) promptInfo('Issue já existe, pulando: ' + key);
            return { key, skipped: true };
        }
    }

    private async _createNewIssue(
        testData: JsonObject,
        testTitle: string,
        testIdx: number,
        totalTests: number,
        opLog: { info: (msg: string, meta?: LogContext) => void },
    ): Promise<CreateIssueResult> {
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
