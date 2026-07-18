/** Test Execution creator — creates Test Execution issues and associates test results. */
import { formatErr } from '../shared/errors.js';
import { rootLogger } from '../shared/logger.js';
import { success, info, withSpinner } from '../shared/ui/prompt.js';
import Config from '../shared/config-accessor.js';
import { XrayCloudClient } from '../shared/jira/xray-cloud-client.js';
import type { JiraResourceLike } from '../shared/types.js';
import type JiraLinkManager from './jira_link_manager.js';
import {
    ISSUE_TYPE_NOT_FOUND,
    CUSTOM_FIELD_NOT_FOUND,
    FAILED_TO_GET_ISSUE_TYPES,
    FAILED_TO_GET_CUSTOM_FIELDS,
} from './constants.js';
import type { JsonObject } from '../shared/types.js';

interface TestExecutionResult {
    key: string;
    summary: string;
}

export class TestExecutionCreator {
    jiraResource: JiraResourceLike;
    linkManager: JiraLinkManager;

    constructor(jiraResource: JiraResourceLike, linkManager: JiraLinkManager) {
        this.jiraResource = jiraResource;
        this.linkManager = linkManager;
    }

    /** True when running against Jira Cloud (Xray Cloud app model). */
    private _isCloud(): boolean {
        try {
            return Config.getDefault().get('jiraMode') === 'cloud';
        } catch {
            return false;
        }
    }

    /** Search for an existing Test Execution with matching summary to ensure idempotency.
     *  Uses JQL to find TE issues in the project with exact summary match.
     *  Returns the first matching TE or null if none found. */
    private async findExistingTe(projectName: string, summary: string): Promise<TestExecutionResult | null> {
        const jql = `project = "${projectName}" AND issuetype = "Test Execution" AND summary ~ "${summary}"`;
        try {
            const result = await this.jiraResource.searchJiraIssues(jql, 1);
            if (result.issues.length > 0) {
                const issue = result.issues[0] as NonNullable<(typeof result.issues)[number]>;
                rootLogger.info('Test Execution existente encontrado: ' + issue.key);
                return { key: issue.key, summary: (issue.fields['summary'] as string) || summary };
            }
        } catch (err) {
            rootLogger.warn('Falha ao buscar Test Execution existente: ' + formatErr(err));
        }
        return null;
    }

    async create(
        projectName: string,
        testKeys: string[],
        csvName: string,
        titleOverride?: string,
    ): Promise<TestExecutionResult | null> {
        const summary = this._buildTimestampedSummary(csvName, titleOverride);
        const execLog = rootLogger.child({ operation: 'create-testexec' });

        const existing = await this.findExistingTe(projectName, summary);
        if (existing) {
            info('Reutilizando Test Execution existente: ' + existing.key + ' — ' + existing.summary);
            return existing;
        }

        const issueType = await this._resolveIssueType();
        if (!issueType) return null;

        const testField = await this._resolveTestField();
        if (!testField && !this._isCloud()) return null;

        const fields: JsonObject = {
            project: { key: projectName },
            summary,
            issuetype: { id: issueType.id },
        };
        if (testField) {
            fields[testField.id] = testKeys;
        }
        const payload: JsonObject = { fields };

        const created = await this.jiraResource.postJiraResource<JsonObject>('issue', payload);
        success('Test Execution criado: ' + String(created['key']) + ' — ' + summary);
        execLog.info('Test Execution criado', { key: created['key'], summary });
        return { key: created['key'] as string, summary };
    }

    private _buildTimestampedSummary(csvName: string, titleOverride?: string): string {
        const timestamp = new Date().toLocaleString('pt-BR', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
        });
        return titleOverride || (csvName || 'Automated Execution') + ' - ' + timestamp;
    }

    private async _resolveIssueType(): Promise<{ id: string } | null> {
        const execLog = rootLogger.child({ operation: 'create-testexec' });
        execLog.info('Descobrindo issue type "Test Execution"...');
        const issueTypes = await this.jiraResource.getJiraResource<Array<{ id: string; name: string }>>('issuetype');
        if (!Array.isArray(issueTypes)) {
            rootLogger.error(FAILED_TO_GET_ISSUE_TYPES);
            return null;
        }
        const execType = issueTypes.find((t) => t.name === 'Test Execution');
        if (!execType) {
            rootLogger.error(ISSUE_TYPE_NOT_FOUND);
            return null;
        }
        execLog.info('Issue type encontrado: id=' + execType.id);
        return { id: execType.id };
    }

    private async _resolveTestField(): Promise<{ id: string } | null> {
        if (this._isCloud()) {
            rootLogger.info(
                'Cloud mode: Xray Cloud stores Test associations natively (issue links). Skipping Server custom field lookup.',
            );
            return null;
        }
        const execLog = rootLogger.child({ operation: 'create-testexec' });
        execLog.info('Descobrindo custom field para tests...');
        const fields =
            await this.jiraResource.getJiraResource<Array<{ id: string; name: string; schema?: { custom?: string } }>>(
                'field',
            );
        if (!Array.isArray(fields)) {
            rootLogger.error(FAILED_TO_GET_CUSTOM_FIELDS);
            return null;
        }
        const testField = fields.find(
            (f) => f.schema?.custom === 'com.xpandit.plugins.xray:testexec-tests-custom-field',
        );
        if (!testField) {
            rootLogger.error(CUSTOM_FIELD_NOT_FOUND);
            return null;
        }
        execLog.info('Custom field encontrado: ' + testField.id + ' (' + testField.name + ')');
        return { id: testField.id };
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
            if (te.fields?.issuelinks) {
                for (const link of te.fields.issuelinks) {
                    if (link.outwardIssue?.key && testKeys.includes(link.outwardIssue.key)) {
                        linkedKeys.push(link.outwardIssue.key);
                    }
                }
            }
        } catch (err) {
            rootLogger.warn('Não foi possível verificar links existentes: ' + formatErr(err));
        }

        const unlinked = testKeys.filter((k) => !linkedKeys.includes(k));
        if (unlinked.length === 0) {
            info('Todos os testes já estão vinculados ao Test Execution.');
            return { linked: 0, failed: 0 };
        }

        if (this._isCloud()) {
            return this._linkTestsToExecutionCloud(teKey, unlinked, linked);
        }

        await withSpinner('Linkando ' + unlinked.length + ' teste(s)...', async () => {
            for (const key of unlinked) {
                try {
                    await this.linkManager.createIssueLink(key, teKey, 'Tests');
                    linked++;
                } catch (err: unknown) {
                    const msg = formatErr(err);
                    if (msg.includes('already exists') || msg.includes('already linked')) {
                        linked++;
                    } else {
                        rootLogger.warn('Falha ao linkar ' + key + ': ' + msg);
                        failed++;
                    }
                }
            }
        });
        if (linked > 0) success(linked + '/' + unlinked.length + ' testes vinculados.');
        return { linked, failed };
    }

    /** Resolve a Jira issue key to its numeric id via the REST API. */
    private async _resolveNumericId(key: string): Promise<number | null> {
        try {
            const issue = await this.jiraResource.getJiraResource<{ id?: string } | undefined>('issue/' + key);
            const numeric = Number(issue?.id);
            return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
        } catch (err) {
            rootLogger.warn('Falha ao resolver id numérico de ' + key + ': ' + formatErr(err));
            return null;
        }
    }

    /** Read Xray Cloud credentials from Config (throws if missing — safety mechanism). */
    private _getCloudCredentials(): { clientId: string; clientSecret: string } {
        const clientId = Config.getDefault().get('xrayClientId');
        const clientSecret = Config.getDefault().get('xrayClientSecret');
        if (!clientId || !clientSecret) {
            throw new Error(
                'Credenciais Xray Cloud (XRAY_CLIENT_ID/XRAY_CLIENT_SECRET) ausentes. Associação nativa Cloud indisponível.',
            );
        }
        return { clientId, clientSecret };
    }

    /** Cloud-native test association via Xray GraphQL (addTestsToTestExecution). */
    private async _linkTestsToExecutionCloud(
        teKey: string,
        unlinked: string[],
        alreadyLinked: number,
    ): Promise<{ linked: number; failed: number }> {
        const cloudLog = rootLogger.child({ xray: 'cloud', target: teKey });
        const teId = await this._resolveNumericId(teKey);
        const testIds: number[] = [];
        const unresolved: string[] = [];
        for (const key of unlinked) {
            const id = await this._resolveNumericId(key);
            if (id === null) {
                unresolved.push(key);
            } else {
                testIds.push(id);
            }
        }
        if (teId === null) {
            cloudLog.error('Test Execution ' + teKey + ' não possui id numérico válido (Cloud exige id numérico).');
            return { linked: alreadyLinked, failed: unlinked.length };
        }
        if (testIds.length === 0) {
            cloudLog.warn('Nenhum teste com id numérico válido para associar ao Test Execution Cloud.');
            return { linked: alreadyLinked, failed: unlinked.length };
        }
        try {
            const { clientId, clientSecret } = this._getCloudCredentials();
            const client = new XrayCloudClient();
            const associated = await client.addTestsToTestExecution(
                String(teId),
                testIds.map(String),
                clientId,
                clientSecret,
            );
            const failedCount = testIds.length - associated + unresolved.length;
            if (associated > 0) success(associated + '/' + testIds.length + ' teste(s) associado(s) (Xray Cloud).');
            if (unresolved.length > 0) {
                cloudLog.warn(
                    unresolved.length +
                        ' teste(s) sem id numérico não puderam ser associados: ' +
                        unresolved.join(', '),
                );
            }
            if (failedCount > 0) {
                cloudLog.error(failedCount + ' teste(s) falharam ao associar ao Test Execution Cloud.');
            }
            return { linked: alreadyLinked + associated, failed: failedCount };
        } catch (err: unknown) {
            cloudLog.error('Falha na associação nativa Xray Cloud: ' + formatErr(err));
            return { linked: alreadyLinked, failed: testIds.length + unresolved.length };
        }
    }

    /** Associate test keys with an existing Test Execution (custom field + issue links). */
    async addTestsToExistingExecution(teKey: string, testKeys: string[]): Promise<TestExecutionResult | null> {
        const execLog = rootLogger.child({ operation: 'add-tests-to-testexec' });

        const teIssue = await this.jiraResource.getJiraResource<{
            key: string;
            fields: { summary?: string; issuetype?: { name: string } };
        }>('issue/' + teKey);

        if (teIssue.fields.issuetype?.name !== 'Test Execution') {
            const actualType = teIssue.fields.issuetype?.name || 'desconhecido';
            rootLogger.error('"' + teKey + '" não é uma Test Execution (tipo: ' + actualType + ')');
            return null;
        }

        const fields =
            await this.jiraResource.getJiraResource<Array<{ id: string; name: string; schema?: { custom?: string } }>>(
                'field',
            );
        if (!Array.isArray(fields)) {
            rootLogger.error(FAILED_TO_GET_CUSTOM_FIELDS);
            return null;
        }

        const testField = fields.find(
            (f) => f.schema?.custom === 'com.xpandit.plugins.xray:testexec-tests-custom-field',
        );

        if (testField) {
            const currentTests = (teIssue.fields as Record<string, unknown>)[testField.id] as string[] | undefined;
            const merged = [...new Set([...(currentTests || []), ...testKeys])];

            const payload: JsonObject = {};
            payload[testField.id] = merged;
            await this.jiraResource.putJiraResource('issue/' + teKey, { fields: payload });

            execLog.info('Tests adicionados à TE: ' + teKey + ' (' + merged.length + ' total)');
        } else if (!this._isCloud()) {
            rootLogger.error(CUSTOM_FIELD_NOT_FOUND);
            return null;
        } else {
            execLog.info('Cloud mode: associando testes à TE via Xray Cloud nativo (GraphQL addTestsToTestExecution).');
        }

        const { linked, failed } = await this._linkTestsToExecution(teKey, testKeys);

        const summary = teIssue.fields.summary || teKey;
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
    ): Promise<TestExecutionResult | null> {
        const title = execOpts?.title || '';
        const result = await this.create(projectName, testKeys, csvName, title);
        if (!result) return null;

        if (testKeys.length > 0) {
            try {
                await this._linkTestsToExecution(result.key, testKeys);
            } catch (err) {
                rootLogger.error('Erro ao vincular testes: ' + formatErr(err));
            }
        }

        return result;
    }
}

export default TestExecutionCreator;
