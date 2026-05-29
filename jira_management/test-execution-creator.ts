/** Test Execution creator — creates Test Execution issues and associates test results. */
import { rootLogger } from '../shared/logger';
import { success, info, withSpinner } from '../shared/prompt';
import type JiraResource from './jira_resource';
import type JiraLinkManager from './jira_link_manager';
import {
    ISSUE_TYPE_NOT_FOUND,
    CUSTOM_FIELD_NOT_FOUND,
    FAILED_TO_GET_ISSUE_TYPES,
    FAILED_TO_GET_CUSTOM_FIELDS,
} from './constants';
import type { JsonObject } from '../shared/types';

interface TestExecutionResult {
    key: string;
    summary: string;
}

class TestExecutionCreator {
    jiraResource: JiraResource;
    linkManager: JiraLinkManager;

    constructor(jiraResource: JiraResource, linkManager: JiraLinkManager) {
        this.jiraResource = jiraResource;
        this.linkManager = linkManager;
    }

    async create(
        projectName: string,
        testKeys: string[],
        csvName: string,
        titleOverride?: string,
    ): Promise<TestExecutionResult> {
        const timestamp = new Date().toLocaleString('pt-BR', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
        });
        const summary = titleOverride || (csvName || 'Automated Execution') + ' - ' + timestamp;

        const execLog = rootLogger.child({ operation: 'create-testexec' });
        execLog.info('Descobrindo issue type "Test Execution"...');
        const issueTypes = await this.jiraResource.getJiraResource<Array<{ id: string; name: string }>>('issuetype');
        if (!Array.isArray(issueTypes)) throw new Error(FAILED_TO_GET_ISSUE_TYPES);

        const execType = issueTypes.find((t) => t.name === 'Test Execution');
        if (!execType) throw new Error(ISSUE_TYPE_NOT_FOUND);
        execLog.info('Issue type encontrado: id=' + execType.id);

        execLog.info('Descobrindo custom field para tests...');
        const fields =
            await this.jiraResource.getJiraResource<Array<{ id: string; name: string; schema?: { custom?: string } }>>(
                'field',
            );
        if (!Array.isArray(fields)) throw new Error(FAILED_TO_GET_CUSTOM_FIELDS);

        const testField = fields.find(
            (f) => f.schema?.custom === 'com.xpandit.plugins.xray:testexec-tests-custom-field',
        );
        if (!testField) throw new Error(CUSTOM_FIELD_NOT_FOUND);
        execLog.info('Custom field encontrado: ' + testField.id + ' (' + testField.name + ')');

        const payload: JsonObject = {
            fields: {
                project: { key: projectName },
                summary,
                issuetype: { id: execType.id },
                [testField.id]: testKeys,
            },
        };

        const created = await this.jiraResource.postJiraResource('issue', payload);
        success('Test Execution criado: ' + String(created.key) + ' — ' + summary);
        execLog.info('Test Execution criado', { key: created.key, summary });
        return { key: created.key as string, summary };
    }

    /** Link tests to a Test Execution, skipping already-linked ones.
     * @internal Shared between createWithLinks and addTestsToExistingExecution. */
    async _linkTestsToExecution(teKey: string, testKeys: string[]): Promise<{ linked: number; failed: number }> {
        let linked = 0;
        let failed = 0;
        if (!teKey || testKeys.length === 0) return { linked, failed };

        const linkedKeys: string[] = [];
        try {
            const te = await this.jiraResource.getJiraResource<{
                fields?: { issuelinks?: Array<{ outwardIssue?: { key: string } }> };
            }>('issue/' + teKey);
            if (te?.fields?.issuelinks) {
                for (const link of te.fields.issuelinks) {
                    if (link.outwardIssue?.key && testKeys.includes(link.outwardIssue.key)) {
                        linkedKeys.push(link.outwardIssue.key);
                    }
                }
            }
        } catch (err) {
            rootLogger.warn('Não foi possível verificar links existentes: ' + (err as Error).message);
        }

        const unlinked = testKeys.filter((k) => !linkedKeys.includes(k));
        if (unlinked.length === 0) {
            info('Todos os testes já estão vinculados ao Test Execution.');
            return { linked: 0, failed: 0 };
        }

        await withSpinner('Linkando ' + unlinked.length + ' teste(s)...', async () => {
            for (const key of unlinked) {
                try {
                    await this.linkManager.createIssueLink(key, teKey, 'Tests');
                    linked++;
                } catch (err) {
                    rootLogger.warn('Falha ao linkar ' + key + ': ' + (err as Error).message);
                    failed++;
                }
            }
        });
        if (linked > 0) success(linked + '/' + unlinked.length + ' testes vinculados.');
        return { linked, failed };
    }

    /** Associate test keys with an existing Test Execution (custom field + issue links). */
    async addTestsToExistingExecution(teKey: string, testKeys: string[]): Promise<TestExecutionResult> {
        const execLog = rootLogger.child({ operation: 'add-tests-to-testexec' });

        const teIssue = await this.jiraResource.getJiraResource<{
            key: string;
            fields: { summary?: string; issuetype?: { name: string } };
        }>('issue/' + teKey);

        if (teIssue.fields?.issuetype?.name !== 'Test Execution') {
            throw new Error(
                '"' +
                    teKey +
                    '" não é uma Test Execution (tipo: ' +
                    (teIssue.fields?.issuetype?.name || 'desconhecido') +
                    ')',
            );
        }

        const fields =
            await this.jiraResource.getJiraResource<Array<{ id: string; name: string; schema?: { custom?: string } }>>(
                'field',
            );
        if (!Array.isArray(fields)) throw new Error(FAILED_TO_GET_CUSTOM_FIELDS);

        const testField = fields.find(
            (f) => f.schema?.custom === 'com.xpandit.plugins.xray:testexec-tests-custom-field',
        );
        if (!testField) throw new Error(CUSTOM_FIELD_NOT_FOUND);

        const currentTests: string[] = ((teIssue.fields as Record<string, unknown>)?.[testField.id] as string[]) || [];
        const merged = [...new Set([...currentTests, ...testKeys])];

        const payload: JsonObject = {};
        payload[testField.id] = merged;
        await this.jiraResource.putJiraResource('issue/' + teKey, { fields: payload });

        execLog.info('Tests adicionados à TE: ' + teKey + ' (' + merged.length + ' total)');

        const { linked, failed } = await this._linkTestsToExecution(teKey, testKeys);

        const summary = teIssue.fields?.summary || teKey;
        if (failed > 0) {
            info('✓ Associados: ' + linked + ' | ✗ Falha: ' + failed);
        }
        return { key: teKey, summary };
    }

    async createWithLinks(
        projectName: string,
        testKeys: string[],
        csvName: string,
        execOpts?: { title?: string; description?: string },
    ): Promise<TestExecutionResult> {
        const title = execOpts?.title || '';
        const result = await this.create(projectName, testKeys, csvName, title);

        if (result.key && testKeys.length > 0) {
            try {
                await this._linkTestsToExecution(result.key, testKeys);
            } catch (err) {
                rootLogger.error('Erro ao vincular testes: ' + (err as Error).message);
            }
        }

        return result;
    }
}

export default TestExecutionCreator;
