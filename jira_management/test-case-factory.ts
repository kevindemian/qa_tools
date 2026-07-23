/** Test-case factory — creates test issues in Jira via Xray REST API. */
import { success, warn, info, onError, isQuiet, ProgressBar, confirm, prompt } from '../shared/ui/prompt.js';
import type { JiraResourceLike } from '../shared/types.js';
import type { XrayStepImporter } from './xray-client.js';
import type { JsonObject, LogContext, TestCase } from '../shared/types.js';
import type { TestStep } from '../shared/types.js';
import { rootLogger } from '../shared/logger.js';
import Config from '../shared/config-accessor.js';
import { cleanSlateUpdate, type SnapshotContext, type LinkSnapshot } from './issue-snapshot.js';

interface CreateIssueResult {
    key?: string | null;
    action?: string;
    skipped?: boolean;
    updated?: boolean;
    ambiguous?: boolean;
    cleanSlateUsed?: boolean;
}

interface StepsResult {
    action?: string;
}

type UpdatePolicy = 'auto' | 'skip' | 'prompt';

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
    private _snapshotCtx: SnapshotContext | null = null;

    constructor(jiraResource: JiraResourceLike, stepImporter: XrayStepImporter) {
        this.jiraResource = jiraResource;
        this.stepImporter = stepImporter;
    }

    /** Set the snapshot context for clean-slate updates.
     *  When set, _attemptUpdateByKey uses snapshot+rollback instead of plain PUT. */
    setSnapshotContext(ctx: SnapshotContext): void {
        this._snapshotCtx = ctx;
    }

    private _getTargetKeys(): string[] {
        const raw = Config.get<string>('targetKeys');
        return raw ? raw.split(',').filter(Boolean) : [];
    }

    /** Internal: perform a clean-slate or plain PUT update on a resolved key. */
    private async _doUpdate(
        key: string,
        testData: JsonObject,
        testTitle: string,
        opLog: { info: (msg: string, meta?: LogContext) => void },
        label: string,
    ): Promise<CreateIssueResult> {
        if (this._snapshotCtx) {
            const fields = (testData as Record<string, unknown>)['fields'] as Record<string, unknown>;
            const linkTypeNames = (testData as Record<string, unknown>)['linkedIssueTypes'] as string[] | undefined;
            const result = await cleanSlateUpdate(
                this._snapshotCtx,
                key,
                fields,
                {
                    description: (fields['description'] as string) ?? null,
                    steps: ((testData as Record<string, unknown>)['steps'] as TestStep[]) ?? [],
                    preconditions: ((testData as Record<string, unknown>)['preconditions'] as string[]) ?? [],
                    linkedIssues: ((testData as Record<string, unknown>)['linkedIssues'] as LinkSnapshot[]) ?? [],
                },
                {
                    linkTypeNames: linkTypeNames ?? ['Relates', 'Blocks', 'is blocked by'],
                },
            );
            if (result.success) {
                if (!isQuiet()) success('Issue atualizada (' + label + '): ' + key);
                opLog.info('Issue atualizada (' + label + ')', { key, title: testTitle });
                return { key, updated: true, cleanSlateUsed: true };
            }
            if (result.restored) {
                warn('Issue ' + key + ' — rollback concluido, dados preservados');
                opLog.info('Rollback concluido', { key, title: testTitle });
                return { key, skipped: true };
            }
            warn('Issue ' + key + ' — rollback falhou, dados podem estar inconsistentes');
            opLog.info('Rollback falhou', { key, title: testTitle });
            return { key, skipped: true };
        }

        // Fallback: plain PUT
        await this.jiraResource.putJiraResource('issue/' + key, {
            fields: (testData as Record<string, unknown>)['fields'],
        });
        if (!isQuiet()) success('Issue atualizada (' + label + '): ' + key);
        opLog.info('Issue atualizada (' + label + ')', { key, title: testTitle });
        return { key, updated: true };
    }

    async _attemptUpdate(params: CreateIssueParams): Promise<CreateIssueResult | null> {
        const { testData, testTitle, opLog } = params;
        if (!testTitle) return null;

        const targetKeys = this._getTargetKeys();
        const targetKey = targetKeys?.[params.testIdx];
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

            const policy: UpdatePolicy = (Config.get('updatePolicy') ?? 'auto') as UpdatePolicy;

            if (matches.length === 1) {
                const key = matches[0]!.key;
                if (policy === 'skip') {
                    if (!isQuiet()) warn('Issue existente pulada: ' + key);
                    opLog.info('Issue existente pulada', { key, title: testTitle });
                    return { key, skipped: true };
                }

                if (policy === 'prompt' && !isQuiet()) {
                    info('Issue ja existe no Jira: ' + key);
                    const choice = confirm('[A]tualizar / Criar [n]ovo? (s/N)', false);
                    if (!choice) return null;
                }

                return this._doUpdate(key, testData, testTitle, opLog, 'auto');
            }

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
                    const chosenKey = matches[idx - 1]!.key;
                    return this._doUpdate(chosenKey, testData, testTitle, opLog, 'prompt');
                }
            }
            if (!isQuiet()) warn('Nenhuma atualizada.');
            opLog.info('Usuário pulou: "' + testTitle + '"', { keys: matches.map((m) => m.key) });
            return { skipped: true, ambiguous: true };
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
            if (!issue || !issue.key) {
                warn('Issue ' + targetKey + ' nao encontrada no Jira — abortando');
                opLog.info('Target key nao encontrada', { key: targetKey, title: testTitle });
                return { key: targetKey, skipped: true };
            }
            return this._doUpdate(issue.key, testData, testTitle, opLog, 'ordenado');
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

    async createIssue(params: CreateIssueParams): Promise<CreateIssueResult> {
        const { testData, testTitle, testIdx, totalTests, opLog, skipExisting, checkOnly } = params;

        const targetKeys = this._getTargetKeys();
        const hasTargetKey = targetKeys && testIdx < targetKeys.length && targetKeys[testIdx];

        if (skipExisting && testTitle) {
            const result = await this._attemptUpdate(params);
            if (result !== null) {
                if (result.updated) return result;
                if (result.ambiguous || checkOnly) return { skipped: true };
                if (hasTargetKey) {
                    warn('Target key ' + targetKeys![testIdx] + ' falhou — issue NAO pode ser criada');
                    opLog.info('Target key update falhou, criacao bloqueada', {
                        key: targetKeys![testIdx],
                        title: testTitle,
                    });
                    return { key: targetKeys![testIdx] ?? null, skipped: true };
                }
                return result;
            }
            if (checkOnly) return { skipped: true };
            if (hasTargetKey) {
                warn('Target key ' + targetKeys![testIdx] + ' nao encontrada — issue NAO pode ser criada');
                opLog.info('Target key nao encontrada, criacao bloqueada', {
                    key: targetKeys![testIdx],
                    title: testTitle,
                });
                return { key: targetKeys![testIdx] ?? null, skipped: true };
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
        replaceSteps = false,
    ): Promise<StepsResult | null> {
        if (replaceSteps && test.steps.length > 0) {
            try {
                await this.stepImporter.setSteps(issueKey, test.steps);
                return null;
            } catch (err) {
                const action = onError('  Steps de "' + test.title + '"', err, { details: true });
                return action === 'abort' ? { action: 'abort' } : null;
            }
        }
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
