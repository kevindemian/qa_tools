import chalk from 'chalk';
import { success, isQuiet, onError, print } from '../shared/prompt';
import { rootLogger } from '../shared/logger';
import { sleep } from '../shared/http-client';
import type JiraResource from './jira_resource';
import type JiraLinkManager from './jira_link_manager';
import type { TestCase } from '../shared/types';

interface ActionResult {
    action?: string;
}

class IssueLinker {
    jiraResource: JiraResource;
    linkManager: JiraLinkManager;

    constructor(jiraResource: JiraResource, linkManager: JiraLinkManager) {
        this.jiraResource = jiraResource;
        this.linkManager = linkManager;
    }

    async associatePrecondition(
        test: TestCase,
        issueKey: string,
        _opLog: { info: (msg: string, meta?: Record<string, unknown>) => void },
    ): Promise<ActionResult | null> {
        if (!test.precondition) return null;
        try {
            await this.linkManager.associatePrecondition(issueKey, test.precondition.value);
            if (!isQuiet()) success('  Pre-condition ' + test.precondition.value + ' associada');
            return null;
        } catch (err) {
            const action = await onError('  Pre-condition de "' + test.title + '"', err, { details: true });
            return { action };
        }
    }

    async linkIssues(issueKey: string, test: TestCase): Promise<ActionResult | null> {
        if (!test.linkedIssues || test.linkedIssues.length === 0) return null;
        try {
            await this.linkManager.linkIssues(issueKey, test.linkedIssues);
            if (!isQuiet()) success('  ' + test.linkedIssues.length + ' linked issue(s) criados');
            return null;
        } catch (err) {
            return {
                action: await onError('  Linked issues de "' + test.title + '"', err, { details: true }),
            };
        }
    }

    async updateCrossReferences(tests: TestCase[], ids: string[]): Promise<void> {
        const valid = tests.map((t, i) => ({ test: t, id: ids[i] })).filter((x) => x.id && x.test.group);

        const groups: Record<string, { name: string; members: Array<{ id: string; description: string }> }> = {};
        for (const { test, id } of valid) {
            const key = test.group!.toUpperCase();
            if (!groups[key]) groups[key] = { name: test.group!, members: [] };
            groups[key].members.push({ id, description: test.description || '' });
        }

        const crossLog = rootLogger.child({ operation: 'cross-ref' });

        for (const group of Object.values(groups)) {
            if (group.members.length < 2) continue;

            crossLog.info('Atualizando descrições do grupo "' + group.name + '" (' + group.members.length + ' issues)');

            await sleep(500);

            for (const member of group.members) {
                const others = group.members
                    .filter((m) => m.id !== member.id)
                    .map((m) => m.id)
                    .join(', ');
                const refText = '\n\nThis test case is part of the set ' + group.name + ': ' + others;

                try {
                    const current = await this.jiraResource.getJiraResource<{ fields?: { description?: string } }>(
                        'issue/' + member.id,
                    );
                    const currentDesc = current?.fields?.description || '';
                    if (
                        currentDesc.includes('faz parte do conjunto') ||
                        currentDesc.includes('This test case is part of the set')
                    ) {
                        crossLog.info('  ' + member.id + ': ja atualizado, pulando');
                        continue;
                    }

                    await this.jiraResource.putJiraResource('issue/' + member.id, {
                        fields: { description: currentDesc + refText },
                    });
                    if (!isQuiet()) print(chalk.green('+'));
                    crossLog.info('  ' + member.id + ': descrição atualizada');
                } catch (err) {
                    const status = (err as { response?: { status?: number } }).response?.status;
                    crossLog.error('Falha ao atualizar descrição de ' + member.id + ' no grupo "' + group.name + '"', {
                        status,
                    });
                    if (!isQuiet()) print(chalk.red('x'));
                }
            }
        }
    }
}

export default IssueLinker;
