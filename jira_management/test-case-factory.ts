/** Test-case factory — creates test issues in Jira via Xray REST API. */
import { success, warn, info, onError, isQuiet, ProgressBar, confirm, prompt } from '../shared/ui/prompt.js';
import type { JiraResourceLike } from '../shared/types.js';
import type { XrayStepImporter } from './xray-client.js';
import type { JsonObject, LogContext, TestCase } from '../shared/types.js';
import { rootLogger } from '../shared/logger.js';
import Config from '../shared/config-accessor.js';

interface CreateIssueResult {
    key?: string | null;
    action?: string;
    skipped?: boolean;
    updated?: boolean;
    ambiguous?: boolean;
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
    checkOnly?: boolean;
}

class TestCaseFactory {
    jiraResource: JiraResourceLike;
    stepImporter: XrayStepImporter;

    constructor(jiraResource: JiraResourceLike, stepImporter: XrayStepImporter) {
        this.jiraResource = jiraResource;
        this.stepImporter = stepImporter;
    }

    private async _handleSingleMatch(
        key: string,
        policy: string,
        testData: JsonObject,
        testTitle: string,
        opLog: { info: (msg: string, meta?: Record<string, unknown>) => void },
    ): Promise<CreateIssueResult | null> {
        if (policy === 'skip') {
            if (!isQuiet()) info('Issue já existe, pulando: ' + key);
            opLog.info('Issue pulada (já existe)', { key, title: testTitle });
            return { key, skipped: true };
        }

        if (policy === 'prompt' && !isQuiet()) {
            info('Issue ja existe no Jira: ' + key);
            const choice = confirm('[A]tualizar / Criar [n]ovo? (s/N)', false);
            if (!choice) return null;
        }

        await this.jiraResource.putJiraResource('issue/' + key, {
            fields: (testData as Record<string, unknown>)['fields'],
        });
        if (!isQuiet()) success('Issue atualizada: ' + key);
        opLog.info('Issue atualizada', { key, title: testTitle });
        return { key, updated: true };
    }

    private async _handleMultipleMatches(
        matches: Array<{ key: string }>,
        policy: string,
        testData: JsonObject,
        testTitle: string,
        opLog: { info: (msg: string, meta?: Record<string, unknown>) => void },
    ): Promise<CreateIssueResult | null> {
        if (!isQuiet()) {
            warn(matches.length + ' issues com título "' + testTitle + '":');
            for (const m of matches) {
                info('  ' + m.key);
            }
        }

        if (policy === 'auto' || policy === 'skip') {
            if (!isQuiet()) warn('Nenhuma atualizada — múltiplos matches.');
            opLog.info('Múltiplos matches para "' + testTitle + '": ' + matches.map((m) => m.key).join(', '));
            return { skipped: true, ambiguous: true };
        }

        if (!isQuiet()) {
            const answer = prompt('Selecione a issue para atualizar (1-' + matches.length + ', Enter = pular): ');
            const idx = parseInt(answer, 10);
            if (!isNaN(idx) && idx >= 1 && idx <= matches.length) {
                const chosenKey = matches[idx - 1]?.key ?? '';
                await this.jiraResource.putJiraResource('issue/' + chosenKey, {
                    fields: (testData as Record<string, unknown>)['fields'],
                });
                if (!isQuiet()) success('Issue atualizada: ' + chosenKey);
                opLog.info('Issue atualizada', { key: chosenKey, title: testTitle });
                return { key: chosenKey, updated: true };
            }
        }
        if (!isQuiet()) warn('Nenhuma atualizada.');
        opLog.info('Usuário pulou: "' + testTitle + '"', { keys: matches.map((m) => m.key) });
        return { skipped: true, ambiguous: true };
    }

    async _attemptUpdate(params: CreateIssueParams): Promise<CreateIssueResult | null> {
        const { testData, testTitle, opLog } = params;
        if (!testTitle) return null;

        const targetKeys = Config.get<string[]>('targetKeys');
        const targetKey = targetKeys[params.testIdx];
        if (targetKey) {
            return this._attemptUpdateByKey(params, targetKey);
        }

        try {
            const jql = `project = "${((testData as Record<string, unknown>)['project'] as string) || ''}" AND summary = "${testTitle.replace(/"/g, '\\"')}"`;
            const existing = await this.jiraResource.searchJiraIssues(jql, 5);
            const normalizedTitle = testTitle.trim().toLowerCase();
            const matches = existing.issues.filter(
                (i) => (i.fields['summary'] as string).trim().toLowerCase() === normalizedTitle,
            );
            if (matches.length === 0) return null;

            const policy = Config.get('updatePolicy');

            if (matches.length === 1) {
                return await this._handleSingleMatch(matches[0]?.key ?? '', policy, testData, testTitle, opLog);
            }

            return await this._handleMultipleMatches(matches, policy, testData, testTitle, opLog);
        } catch (err) {
            const msg =
                'busca de issue existente falhou (criação prosseguirá): ' +
                (err instanceof Error ? err.message : String(err));
            rootLogger.warn('test-case-factory: ' + msg);
            warn('[aviso] ' + msg);
            return null;
        }
    }

    async _attemptUpdateByKey(params: CreateIssueParams, targetKey: string): Promise<CreateIssueResult | null> {
        const { testData, testTitle, opLog } = params;
        try {
            const issue = await this.jiraResource.getJiraResource<{ key?: string }>('issue/' + targetKey);
            if (!issue.key) {
                warn('Issue ' + targetKey + ' nao encontrada no Jira — abortando');
                opLog.info('Target key nao encontrada', { key: targetKey, title: testTitle });
                return { key: targetKey, skipped: true };
            }
            await this.jiraResource.putJiraResource('issue/' + issue.key, {
                fields: (testData as Record<string, unknown>)['fields'],
            });
            if (!isQuiet()) success('Issue atualizada (ordenado): ' + issue.key);
            opLog.info('Issue atualizada (ordenado)', { key: issue.key, title: testTitle });
            return { key: issue.key, updated: true };
        } catch (err) {
            const msg =
                'target key ' +
                targetKey +
                ' falhou (criacao prosseguira): ' +
                (err instanceof Error ? err.message : String(err));
            rootLogger.warn('test-case-factory: ' + msg);
            warn('[aviso] ' + msg);
            return { key: targetKey, skipped: true };
        }
    }

    private _handleTargetKeyBlocked(
        targetKeys: string[],
        testIdx: number,
        testTitle: string,
        opLog: { info: (msg: string, meta?: Record<string, unknown>) => void },
        reason: string,
    ): CreateIssueResult {
        warn('Target key ' + targetKeys[testIdx] + ' ' + reason + ' — issue NAO pode ser criada');
        opLog.info('Target key ' + reason + ', criacao bloqueada', {
            key: targetKeys[testIdx],
            title: testTitle,
        });
        return { key: targetKeys[testIdx] as string, skipped: true };
    }

    private async _handleSkipExisting(
        params: CreateIssueParams,
        targetKeys: string[],
        hasTargetKey: boolean,
    ): Promise<CreateIssueResult | null> {
        const { testTitle, testIdx, opLog, checkOnly } = params;

        const result = await this._attemptUpdate(params);
        if (result !== null) {
            if (result.updated) return result;
            if (result.ambiguous || checkOnly) return { skipped: true };
            if (hasTargetKey) return this._handleTargetKeyBlocked(targetKeys, testIdx, testTitle, opLog, 'falhou');
            return result;
        }
        if (checkOnly) return { skipped: true };
        if (hasTargetKey) return this._handleTargetKeyBlocked(targetKeys, testIdx, testTitle, opLog, 'nao encontrada');
        return null;
    }

    async createIssue(params: CreateIssueParams): Promise<CreateIssueResult> {
        const { testData, testTitle, testIdx, totalTests, opLog, skipExisting } = params;

        const targetKeys = Config.get<string[]>('targetKeys');
        const hasTargetKey = targetKeys[testIdx];

        if (skipExisting && testTitle) {
            const skipResult = await this._handleSkipExisting(params, targetKeys, hasTargetKey !== undefined);
            if (skipResult !== null) return skipResult;
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

    private async _replaceSteps(issueKey: string, test: TestCase): Promise<StepsResult | null> {
        try {
            await this.stepImporter.setSteps(issueKey, test.steps);
            return null;
        } catch (err) {
            const action = onError('  Steps de "' + test.title + '"', err, { details: true });
            return action === 'abort' ? { action: 'abort' } : null;
        }
    }

    private async _importStepsIndividually(issueKey: string, test: TestCase): Promise<StepsResult | null> {
        const stepBar = !isQuiet() ? new ProgressBar(test.steps.length, { width: 15 }) : null;
        let abortSteps = false;
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

    async postSteps(
        issueKey: string,
        test: TestCase,
        _opLog: { info: (msg: string, meta?: LogContext) => void },
        replaceSteps = false,
    ): Promise<StepsResult | null> {
        if (replaceSteps && test.steps.length > 0) {
            return this._replaceSteps(issueKey, test);
        }
        return this._importStepsIndividually(issueKey, test);
    }
}

export default TestCaseFactory;
