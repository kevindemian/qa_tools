/** Issue linker — links test issues to requirements/stories and associates pre-conditions. */
import { applyPalette } from '../shared/ui/palette.js';
import { success, isQuiet, onError, print } from '../shared/ui/prompt.js';
import { rootLogger } from '../shared/logger.js';
import { formatErr } from '../shared/errors.js';
import { sleep } from '../shared/infra/http-client.js';
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
): Promise<string[]> {
    const failed: string[] = [];
    for (const member of group.members) {
        const others = group.members
            .filter((m) => m.id !== member.id)
            .map((m) => m.id)
            .join(', ');
        const refText = '\n\nThis test case is part of the set ' + group.name + ': ' + others;

        try {
            const current = await jiraResource.getJiraResource<{ fields?: { description?: string } }>(
                'issue/' + member.id,
            );
            const currentDesc = current.fields?.description || '';
            if (
                currentDesc.includes('faz parte do conjunto') ||
                currentDesc.includes('This test case is part of the set')
            ) {
                crossLog.info('  ' + member.id + ': ja atualizado, pulando');
                continue;
            }

            await jiraResource.putJiraResource('issue/' + member.id, {
                fields: { description: currentDesc + refText },
            });
            if (!isQuiet()) print(applyPalette('green')('+'));
            crossLog.info('  ' + member.id + ': descrição atualizada');
        } catch (err: unknown) {
            const status = (err as { response?: { status?: number } }).response?.status;
            const msg =
                'Falha ao atualizar descrição de ' +
                member.id +
                ' no grupo "' +
                group.name +
                '"' +
                (status ? ' (HTTP ' + status + ')' : '');
            crossLog.error(msg, { status });
            if (!isQuiet()) print(applyPalette('red')('x'));
            onError('  Cross-ref "' + group.name + '"', err, { details: true });
            failed.push(member.id);
        }
    }
    return failed;
}

class IssueLinker {
    jiraResource: JiraResourceLike;
    linkManager: JiraLinkManager;

    constructor(jiraResource: JiraResourceLike, linkManager: JiraLinkManager) {
        this.jiraResource = jiraResource;
        this.linkManager = linkManager;
    }

    async associatePrecondition(
        test: TestCase,
        issueKey: string,
        _opLog: { info: (msg: string, meta?: LogContext) => void },
    ): Promise<ActionResult | null> {
        if (!test.precondition || test.precondition.length === 0) return null;
        const references = test.precondition.filter((p) => p.type === 'reference');
        if (references.length === 0) return null;
        let result: ActionResult | null = null;
        for (const p of references) {
            try {
                await this.linkManager.associatePrecondition(issueKey, p.value);
                if (!isQuiet()) success('  Pre-condition ' + p.value + ' associada');
            } catch (err) {
                if (isMissingKeyError(err)) {
                    rootLogger.warn(
                        'Pre-condition key "' + p.value + '" não encontrada no Jira (404) — pulando: ' + formatErr(err),
                    );
                    if (!isQuiet()) print(applyPalette('yellow')('w'));
                    result = { action: 'skip', missingKey: p.value };
                    continue;
                }
                if (!result) {
                    result = {
                        action: onError('  Pre-condition de "' + test.title + '" (' + p.value + ')', err, {
                            details: true,
                        }),
                    };
                }
            }
        }
        return result;
    }

    async linkIssues(issueKey: string, test: TestCase): Promise<ActionResult | null> {
        if (!test.linkedIssues || test.linkedIssues.length === 0) return null;
        for (const li of test.linkedIssues) {
            try {
                rootLogger.info(
                    'Limpando issue links de tipo "' +
                        li.linkType +
                        '" existentes em ' +
                        issueKey +
                        ' antes de linkar...',
                );
                await this.linkManager.linkOperations.clearIssueLinksByType(issueKey, li.linkType);
            } catch (err) {
                rootLogger.warn(
                    'Falha ao limpar issue links de tipo "' + li.linkType + '" em ' + issueKey + ': ' + formatErr(err),
                );
            }
        }
        try {
            await this.linkManager.linkIssues(issueKey, test.linkedIssues);
            if (!isQuiet()) success('  ' + test.linkedIssues.length + ' linked issue(s) criados');
            return null;
        } catch (err) {
            if (isMissingKeyError(err)) {
                rootLogger.warn(
                    'Linked issue key não encontrado no Jira (404) em "' +
                        test.title +
                        '" — pulando: ' +
                        formatErr(err),
                );
                if (!isQuiet()) print(applyPalette('yellow')('w'));
                return { action: 'skip', missingKey: test.linkedIssues.map((l) => l.key).join(', ') };
            }
            if (isDuplicateLinkError(err)) {
                rootLogger.warn('Link duplicado detectado em "' + test.title + '" — já existente: ' + formatErr(err));
                if (!isQuiet()) print(applyPalette('yellow')('w'));
                return null;
            }
            return {
                action: onError('  Linked issues de "' + test.title + '"', err, { details: true }),
            };
        }
    }

    async updateCrossReferences(tests: TestCase[], ids: string[]): Promise<string[]> {
        const groups = buildCrossRefGroups(tests, ids);
        const crossLog = rootLogger.child({ operation: 'cross-ref' });
        const allFailed: string[] = [];

        for (const group of Object.values(groups)) {
            if (group.members.length < MIN_GROUP_MEMBERS) continue;
            crossLog.info('Atualizando descrições do grupo "' + group.name + '" (' + group.members.length + ' issues)');
            await sleep(CROSS_REF_SLEEP_MS);
            const failed = await updateGroupLinks(this.jiraResource, group, crossLog);
            allFailed.push(...failed);
        }
        return allFailed;
    }
}

export default IssueLinker;
