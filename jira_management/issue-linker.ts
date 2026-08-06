/** Issue linker — links test issues to requirements/stories and associates pre-conditions. */
import { applyPalette } from '../shared/ui/palette.js';
import { success, isQuiet, print } from '../shared/ui/prompt.js';
import { rootLogger } from '../shared/logger.js';
import { formatErr } from '../shared/errors.js';
import { sleep } from '../shared/infra/http-client.js';
import { executeOperation } from '../shared/ui/operation-executor.js';
import type { StepFailureHandler, StepInfo } from '../shared/types/clean-slate.js';
import type { JiraResourceLike } from '../shared/types.js';
import type JiraLinkManager from './jira_link_manager.js';
import type { LogContext, TestCase } from '../shared/types.js';

const CROSS_REF_SLEEP_MS = 500;
const MIN_GROUP_MEMBERS = 2;

interface ActionResult {
    action?: string;
    missingKey?: string;
}

interface CrossRefMember {
    id: string;
    description: string;
}

interface CrossRefGroup {
    name: string;
    members: CrossRefMember[];
}

/** A referenced Jira key that does not exist is a data defect, not a recoverable error.
 *  It must block the import (hard fail) rather than be silently skipped. */
function isMissingKeyError(err: unknown): boolean {
    const msg = err instanceof Error ? err.message : String(err);
    return /(404|not found|does not exist|issue.*not.*found|could not find|no issue.*with key)/i.test(msg);
}

function isDuplicateLinkError(err: unknown): boolean {
    const msg = err instanceof Error ? err.message : String(err);
    return /(?:duplicate|already.*linked|link.*already.*exists|issue.*is.*already)/i.test(msg);
}

function buildCrossRefGroups(tests: TestCase[], ids: string[]): Record<string, CrossRefGroup> {
    const valid = tests.map((t, i) => ({ test: t, id: Reflect.get(ids, i) })).filter((x) => x.id && x.test.group);
    const groups = new Map<string, CrossRefGroup>();
    for (const { test, id } of valid) {
        const groupName = test.group as string;
        const key = groupName.toUpperCase();
        let entry = groups.get(key);
        if (!entry) {
            entry = { name: groupName, members: [] };
            groups.set(key, entry);
        }
        entry.members.push({ id: String(id), description: test.description || '' });
    }
    return Object.fromEntries(groups);
}

async function updateGroupLinks(
    jiraResource: JiraResourceLike,
    group: CrossRefGroup,
    crossLog: ReturnType<typeof rootLogger.child>,
    stepFailureHandler?: StepFailureHandler,
): Promise<string[]> {
    const failed: string[] = [];
    for (const member of group.members) {
        const others = group.members
            .filter((m) => m.id !== member.id)
            .map((m) => m.id)
            .join(', ');
        const refText = '\n\nThis test case is part of the set ' + group.name + ': ' + others;

        const outcome = await executeOperation({
            run: async () => {
                const current = await jiraResource.getJiraResource<{ fields?: { description?: string } }>(
                    'issue/' + member.id,
                );
                const currentDesc = current.fields?.description || '';
                if (
                    currentDesc.includes('faz parte do conjunto') ||
                    currentDesc.includes('This test case is part of the set')
                ) {
                    crossLog.info('  ' + member.id + ': ja atualizado, pulando');
                    return;
                }

                await jiraResource.putJiraResource('issue/' + member.id, {
                    fields: { description: currentDesc + refText },
                });
                if (!isQuiet()) print(applyPalette('green')('+'));
                crossLog.info('  ' + member.id + ': descrição atualizada');
            },
            ctx: {
                label: 'Cross-ref "' + group.name + '"',
                step: 'cross-ref-' + member.id,
                totalSteps: group.members.length,
                completedSteps: [],
                currentInput: member.id,
            },
            ...(stepFailureHandler
                ? {
                      onFailure: async (error: Error, stepInfo) => {
                          const status = (error as { response?: { status?: number } }).response?.status;
                          const msg =
                              'Falha ao atualizar descrição de ' +
                              member.id +
                              ' no grupo "' +
                              group.name +
                              '"' +
                              (status ? ' (HTTP ' + status + ')' : '');
                          crossLog.error(msg, { status });
                          if (!isQuiet()) print(applyPalette('red')('x'));
                          return stepFailureHandler(error, stepInfo);
                      },
                  }
                : {
                      onFailure: async (error: Error) => {
                          const status = (error as { response?: { status?: number } }).response?.status;
                          const msg =
                              'Falha ao atualizar descrição de ' +
                              member.id +
                              ' no grupo "' +
                              group.name +
                              '"' +
                              (status ? ' (HTTP ' + status + ')' : '');
                          crossLog.error(msg, { status });
                          if (!isQuiet()) print(applyPalette('red')('x'));
                          return 'rollback';
                      },
                  }),
        });
        if (outcome.ok) continue;
        failed.push(member.id);
    }
    return failed;
}

class IssueLinker {
    jiraResource: JiraResourceLike;
    linkManager: JiraLinkManager;
    private _stepFailureHandler: StepFailureHandler | null = null;

    constructor(jiraResource: JiraResourceLike, linkManager: JiraLinkManager, stepFailureHandler?: StepFailureHandler) {
        this.jiraResource = jiraResource;
        this.linkManager = linkManager;
        if (stepFailureHandler) this._stepFailureHandler = stepFailureHandler;
    }

    setStepFailureHandler(handler: StepFailureHandler): void {
        this._stepFailureHandler = handler;
    }

    async associatePrecondition(
        test: TestCase,
        issueKey: string,
        _opLog: { info: (msg: string, meta?: LogContext) => void },
    ): Promise<ActionResult | null> {
        if (!test.precondition || test.precondition.length === 0) return null;
        const references = test.precondition.filter((p) => p.type === 'reference');
        if (references.length === 0) return null;
        const keys = references.map((p) => p.value);
        const onFailure = this._stepFailureHandler
            ? async (error: Error, stepInfo: StepInfo) => {
                  if (isMissingKeyError(error)) {
                      const missingKeys = keys.filter((k) => {
                          const msg = error instanceof Error ? error.message : String(error);
                          return msg.includes(k);
                      });
                      if (missingKeys.length > 0) {
                          rootLogger.warn(
                              'Pre-condition key(s) "' +
                                  missingKeys.join('", "') +
                                  '" não encontrada(s) no Jira (404) — pulando: ' +
                                  formatErr(error),
                          );
                          if (!isQuiet()) print(applyPalette('yellow')('w'));
                          return 'skip';
                      }
                  }
                  return this._stepFailureHandler!(error, stepInfo);
              }
            : undefined;
        const outcome = await executeOperation({
            run: async () => {
                await this.linkManager.associatePrecondition(issueKey, keys);
                for (const key of keys) {
                    if (!isQuiet()) success('  Pre-condition ' + key + ' associada');
                }
            },
            ctx: {
                label: 'Pre-conditions de "' + test.title + '"',
                step: 'associate-precondition',
                totalSteps: 1,
                completedSteps: [],
                currentInput: keys,
            },
            ...(onFailure ? { onFailure } : {}),
        });
        if (outcome.ok) return null;
        if (outcome.decision === 'skip') {
            const missingKeys = keys.filter((k) => {
                const msg = outcome.error instanceof Error ? outcome.error.message : String(outcome.error);
                return msg.includes(k);
            });
            return { action: 'skip', missingKey: missingKeys.length > 0 ? missingKeys.join(', ') : keys.join(', ') };
        }
        return { action: 'abort' };
    }

    async linkIssues(issueKey: string, test: TestCase): Promise<ActionResult | null> {
        if (!test.linkedIssues || test.linkedIssues.length === 0) return null;
        const existingLinks = await this.linkManager.getIssueLinks(issueKey);
        const typesToClear = new Set(existingLinks.map((l) => l.linkType));
        for (const li of test.linkedIssues) {
            typesToClear.add(li.linkType);
        }
        for (const type of typesToClear) {
            if (!type) continue;
            try {
                rootLogger.info(
                    'Limpando issue links de tipo "' + type + '" existentes em ' + issueKey + ' antes de linkar...',
                );
                await this.linkManager.clearIssueLinksByType(issueKey, type);
            } catch (err) {
                rootLogger.warn(
                    'Falha ao limpar issue links de tipo "' + type + '" em ' + issueKey + ': ' + formatErr(err),
                );
            }
        }
        const linkedIssues = test.linkedIssues;
        const onFailure = this._stepFailureHandler
            ? async (error: Error, stepInfo: StepInfo) => {
                  if (isMissingKeyError(error)) {
                      rootLogger.warn(
                          'Linked issue key não encontrado no Jira (404) em "' +
                              test.title +
                              '" — pulando: ' +
                              formatErr(error),
                      );
                      if (!isQuiet()) print(applyPalette('yellow')('w'));
                      return 'skip';
                  }
                  if (isDuplicateLinkError(error)) {
                      rootLogger.warn(
                          'Link duplicado detectado em "' + test.title + '" — já existente: ' + formatErr(error),
                      );
                      if (!isQuiet()) print(applyPalette('yellow')('w'));
                      return 'skip';
                  }
                  return this._stepFailureHandler!(error, stepInfo);
              }
            : undefined;
        const outcome = await executeOperation({
            run: async () => {
                const result = await this.linkManager.linkSourceToTargets(issueKey, linkedIssues);
                if (result.missing.length > 0) {
                    rootLogger.warn(
                        'Linked issue(s) não encontrada(s) no Jira em "' +
                            test.title +
                            '": ' +
                            result.missing.join(', '),
                    );
                    if (!isQuiet()) print(applyPalette('yellow')('w'));
                }
                if (result.failed.length > 0) {
                    throw new Error('Falha ao criar linked issues: ' + result.failed.join(', '));
                }
                if (!isQuiet()) success('  ' + linkedIssues.length + ' linked issue(s) criados');
            },
            ctx: {
                label: 'Linked issues de "' + test.title + '"',
                step: 'link-issues',
                totalSteps: 1,
                completedSteps: [],
                currentInput: linkedIssues,
            },
            ...(onFailure ? { onFailure } : {}),
        });
        if (outcome.ok) return null;
        if (outcome.decision === 'skip') {
            return { action: 'skip', missingKey: linkedIssues.map((l) => l.key).join(', ') };
        }
        return { action: 'abort' };
    }

    async updateCrossReferences(tests: TestCase[], ids: string[]): Promise<string[]> {
        const groups = buildCrossRefGroups(tests, ids);
        const crossLog = rootLogger.child({ operation: 'cross-ref' });
        const allFailed: string[] = [];

        for (const group of Object.values(groups)) {
            if (group.members.length < MIN_GROUP_MEMBERS) continue;
            crossLog.info('Atualizando descrições do grupo "' + group.name + '" (' + group.members.length + ' issues)');
            await sleep(CROSS_REF_SLEEP_MS);
            const failed = await updateGroupLinks(
                this.jiraResource,
                group,
                crossLog,
                this._stepFailureHandler ?? undefined,
            );
            allFailed.push(...failed);
        }
        return allFailed;
    }
}

export default IssueLinker;
