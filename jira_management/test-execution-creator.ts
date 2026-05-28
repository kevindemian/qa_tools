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
                info('Vinculando testes ao Test Execution (link type: Tests)...');
                const linkedKeys: string[] = [];
                const keysToLink = [...testKeys];

                try {
                    const te = await this.jiraResource.getJiraResource<{
                        fields?: { issuelinks?: Array<{ outwardIssue?: { key: string } }> };
                    }>('issue/' + result.key);
                    if (te?.fields?.issuelinks) {
                        for (const link of te.fields.issuelinks) {
                            if (link.outwardIssue?.key && keysToLink.includes(link.outwardIssue.key)) {
                                linkedKeys.push(link.outwardIssue.key);
                            }
                        }
                    }
                } catch (err) {
                    rootLogger.warn('Não foi possível verificar links existentes: ' + (err as Error).message);
                }

                const unlinked = keysToLink.filter((k) => !linkedKeys.includes(k));
                if (unlinked.length === 0) {
                    info('Todos os testes já estão vinculados ao Test Execution.');
                } else {
                    let linkCount = 0;
                    await withSpinner('Linkando ' + unlinked.length + ' teste(s)...', async () => {
                        for (const key of unlinked) {
                            try {
                                await this.linkManager.createIssueLink(key, result.key, 'Tests');
                                linkCount++;
                            } catch (err) {
                                rootLogger.warn('Falha ao linkar ' + key + ': ' + (err as Error).message);
                            }
                        }
                    });
                    if (linkCount > 0) success(linkCount + '/' + unlinked.length + ' testes vinculados.');
                }
            } catch (err) {
                rootLogger.error('Erro ao vincular testes: ' + (err as Error).message);
            }
        }

        return result;
    }
}

export default TestExecutionCreator;
