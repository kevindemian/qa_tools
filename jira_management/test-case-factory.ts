/** Test-case factory — creates test issues in Jira via Xray REST API. */
import { success, warn, info, isQuiet, confirm, prompt } from '../shared/ui/prompt.js';
import type { JiraResourceLike } from '../shared/types.js';
import type { XrayStepImporter } from './xray-client.js';
import type { JsonObject, LogContext, TestCase } from '../shared/types.js';
import type { TestStep } from '../shared/types.js';
import { rootLogger } from '../shared/logger.js';
import Config from '../shared/config-accessor.js';
import { cleanSlateUpdate, type SnapshotContext, type LinkSnapshot } from './issue-snapshot.js';
import { executeOperation } from '../shared/ui/operation-executor.js';
import type { StepFailureHandler, StepResult } from '../shared/types/clean-slate.js';

interface CreateIssueResult {
    key?: string | null;
    action?: string;
    skipped?: boolean;
    updated?: boolean;
    ambiguous?: boolean;
    cleanSlateUsed?: boolean;
}

interface StepsResult {
    action?: 'abort' | 'rollback';
    failedSteps: number;
    totalSteps: number;
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
    /** TestCase with steps, preconditions, linkedIssues — used for clean-slate rebuild. */
    test?: TestCase;
}

class TestCaseFactory {
    jiraResource: JiraResourceLike;
    stepImporter: XrayStepImporter;
    private _snapshotCtx: SnapshotContext | null = null;
    private _stepFailureHandler: StepFailureHandler | null = null;

    constructor(jiraResource: JiraResourceLike, stepImporter: XrayStepImporter) {
        this.jiraResource = jiraResource;
        this.stepImporter = stepImporter;
    }

    /** Set the snapshot context for clean-slate updates.
     *  When set, _attemptUpdateByKey uses snapshot+rollback instead of plain PUT. */
    setSnapshotContext(ctx: SnapshotContext): void {
        this._snapshotCtx = ctx;
    }

    /** Set the interactive step failure handler for clean-slate updates.
     *  When set, each step failure prompts the user for skip/abort/retry/rollback. */
    setStepFailureHandler(handler: StepFailureHandler): void {
        this._stepFailureHandler = handler;
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
        test?: TestCase,
    ): Promise<CreateIssueResult> {
        if (this._snapshotCtx) {
            const fields = (testData as Record<string, unknown>)['fields'] as Record<string, unknown>;
            const linkTypeNames = (testData as Record<string, unknown>)['linkedIssueTypes'] as string[] | undefined;

            // Use test object data for clean-slate rebuild (steps, preconditions, linkedIssues)
            // Fall back to testData extraction for backwards compatibility
            const steps = test?.steps ?? ((testData as Record<string, unknown>)['steps'] as TestStep[]) ?? [];
            const preconditions =
                test?.precondition?.filter((p) => p.type === 'reference').map((p) => p.value) ??
                ((testData as Record<string, unknown>)['preconditions'] as string[]) ??
                [];
            const linkedIssues: LinkSnapshot[] =
                test?.linkedIssues?.map((li) => ({
                    id: '',
                    linkType: li.linkType,
                    inwardKey: li.key,
                    outwardKey: key,
                })) ??
                (Array.isArray((testData as Record<string, unknown>)['linkedIssues'])
                    ? (
                          (testData as Record<string, unknown>)['linkedIssues'] as Array<{
                              key: string;
                              linkType: string;
                          }>
                      ).map((li) => ({ id: '', linkType: li.linkType, inwardKey: li.key, outwardKey: key }))
                    : []);

            const result = await cleanSlateUpdate(
                this._snapshotCtx,
                key,
                fields,
                {
                    description: (fields['description'] as string) ?? null,
                    steps,
                    preconditions,
                    linkedIssues,
                },
                {
                    linkTypeNames: linkTypeNames ?? ['Relates', 'Blocks', 'is blocked by'],
                    ...(this._stepFailureHandler ? { onStepFailure: this._stepFailureHandler } : {}),
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
                const key = matches[0]?.key ?? '';
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

                return this._doUpdate(key, testData, testTitle, opLog, 'auto', params.test);
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
                    const chosenKey = matches[idx - 1]?.key ?? '';
                    return this._doUpdate(chosenKey, testData, testTitle, opLog, 'prompt', params.test);
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
            return this._doUpdate(issue.key, testData, testTitle, opLog, 'ordenado', params.test);
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
        const { testData, testTitle, testIdx, totalTests, opLog, skipExisting } = params;

        const targetKeys = this._getTargetKeys();
        const hasTargetKey = targetKeys && testIdx < targetKeys.length && targetKeys[testIdx];

        if (skipExisting && testTitle) {
            const result = await this._attemptUpdate(params);
            if (result !== null) {
                if (result.updated) return result;
                if (result.ambiguous || params.checkOnly) return { skipped: true };
                if (hasTargetKey) {
                    warn('Target key ' + (targetKeys?.[testIdx] ?? '') + ' falhou — issue NAO pode ser criada');
                    opLog.info('Target key update falhou, criacao bloqueada', {
                        key: targetKeys?.[testIdx],
                        title: testTitle,
                    });
                    return { key: targetKeys?.[testIdx] ?? null, skipped: true };
                }
                return result;
            }
            if (params.checkOnly) return { skipped: true };
            if (hasTargetKey) {
                warn('Target key ' + (targetKeys?.[testIdx] ?? '') + ' nao encontrada — issue NAO pode ser criada');
                opLog.info('Target key nao encontrada, criacao bloqueada', {
                    key: targetKeys?.[testIdx],
                    title: testTitle,
                });
                return { key: targetKeys?.[testIdx] ?? null, skipped: true };
            }
        }

        const outcome = await executeOperation({
            run: async () => {
                const issue = await this.jiraResource.postJiraResource<JsonObject>('issue', testData);
                if (!isQuiet()) success('Issue criada: ' + String(issue['key']));
                opLog.info('Issue criada', { key: issue['key'] });
                return issue;
            },
            ctx: {
                label: '[' + (testIdx + 1) + '/' + totalTests + '] Criar issue "' + testTitle + '"',
                step: 'create-issue',
                totalSteps: 1,
                completedSteps: [],
                currentInput: testData,
            },
            ...(this._stepFailureHandler ? { onFailure: this._stepFailureHandler } : {}),
        });
        if (outcome.ok) return { key: (outcome.result?.['key'] as string) ?? null };
        if (outcome.decision === 'abort') return { action: 'abort' };
        if (outcome.decision === 'skip') return { action: 'skip' };
        return { action: 'rollback' };
    }

    private async _replaceSteps(issueKey: string, test: TestCase): Promise<StepsResult | null> {
        const totalSteps = test.steps.length;
        const outcome = await executeOperation({
            run: async () => {
                await this.stepImporter.setSteps(issueKey, test.steps);
            },
            ctx: {
                label: '  Steps de "' + test.title + '"',
                step: 'replace-steps',
                totalSteps,
                completedSteps: [],
                currentInput: test.steps,
            },
            ...(this._stepFailureHandler ? { onFailure: this._stepFailureHandler } : {}),
        });
        if (outcome.ok) return null;
        if (outcome.decision === 'abort') return { action: 'abort', failedSteps: totalSteps, totalSteps };
        if (outcome.decision === 'rollback') return { action: 'rollback', failedSteps: totalSteps, totalSteps };
        return { failedSteps: totalSteps, totalSteps };
    }

    private async _importStepsIndividually(issueKey: string, test: TestCase): Promise<StepsResult | null> {
        const totalSteps = test.steps.length;
        const completedSteps: StepResult[] = [];
        let failedSteps = 0;
        if (!isQuiet()) info('  Importando ' + totalSteps + ' passo(s) de "' + test.title + '"...');
        for (let i = 0; i < totalSteps; i++) {
            const stepIndex = i + 1;
            const stepInput = Reflect.get(test.steps, i);
            const outcome = await executeOperation({
                run: async () => {
                    await this.stepImporter.importStep(issueKey, stepIndex, stepInput);
                },
                ctx: {
                    label: '  Step ' + stepIndex + ' de "' + test.title + '"',
                    step: 'step-' + stepIndex,
                    totalSteps,
                    completedSteps,
                    currentInput: stepInput,
                },
                ...(this._stepFailureHandler ? { onFailure: this._stepFailureHandler } : {}),
                onSkip: () => {
                    failedSteps++;
                },
            });
            if (outcome.ok) {
                if (!isQuiet()) info('  Step ' + stepIndex + '/' + totalSteps + ' ok');
                continue;
            }
            if (outcome.decision === 'abort') {
                failedSteps++;
                return { action: 'abort', failedSteps, totalSteps };
            }
            if (outcome.decision === 'rollback') {
                failedSteps++;
                return { action: 'rollback', failedSteps, totalSteps };
            }
            // skip: onSkip already counted the failure — continue with next step
            if (!isQuiet()) info('  Step ' + stepIndex + '/' + totalSteps + ' pulado');
        }
        if (failedSteps > 0) return { failedSteps, totalSteps };
        return null;
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
