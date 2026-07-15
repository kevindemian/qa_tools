/** Issue linker — links test issues to requirements/stories and associates pre-conditions. */
import { applyPalette } from '../shared/palette.js';
import { success, isQuiet, onError, print } from '../shared/prompt.js';
import { rootLogger } from '../shared/logger.js';
import { sleep } from '../shared/http-client.js';
import type { JiraResourceLike } from '../shared/types.js';
import type JiraLinkManager from './jira_link_manager.js';
import type { LogContext, TestCase } from '../shared/types.js';

const CROSS_REF_SLEEP_MS = 500;
const MIN_GROUP_MEMBERS = 2;

interface ActionResult {
    action?: string;
}

interface CrossRefMember {
    id: string;
    description: string;
}

interface CrossRefGroup {
    name: string;
    members: CrossRefMember[];
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
): Promise<void> {
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
            crossLog.error('Falha ao atualizar descrição de ' + member.id + ' no grupo "' + group.name + '"', {
                status,
            });
            if (!isQuiet()) print(applyPalette('red')('x'));
        }
    }
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
        try {
            await this.linkManager.linkIssues(issueKey, test.linkedIssues);
            if (!isQuiet()) success('  ' + test.linkedIssues.length + ' linked issue(s) criados');
            return null;
        } catch (err) {
            return {
                action: onError('  Linked issues de "' + test.title + '"', err, { details: true }),
            };
        }
    }

    async updateCrossReferences(tests: TestCase[], ids: string[]): Promise<void> {
        const groups = buildCrossRefGroups(tests, ids);
        const crossLog = rootLogger.child({ operation: 'cross-ref' });

        for (const group of Object.values(groups)) {
            if (group.members.length < MIN_GROUP_MEMBERS) continue;
            crossLog.info('Atualizando descrições do grupo "' + group.name + '" (' + group.members.length + ' issues)');
            await sleep(CROSS_REF_SLEEP_MS);
            await updateGroupLinks(this.jiraResource, group, crossLog);
        }
    }
}

export default IssueLinker;
