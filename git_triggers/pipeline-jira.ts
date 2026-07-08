/** Pipeline Jira — bug creation from CI/CD failure analysis.
 *  Supports QA_AUTO_BUG=true env var to skip interactive confirmation. */
import { confirm, success, printError } from '../shared/prompt.js';
import Config from '../shared/config.js';
import JiraClient from '../shared/jira-client.js';
import { collectAutomated, fileToJira } from '../shared/bug-report.js';
import { _jiraEnv } from './test-results.js';
import { currentProvider, pushHistory } from './session-state.js';
import { createDataHubPersistence } from '../shared/data-hub/persistence.js';
import { classifyFailure } from '../shared/failure-analysis.js';
import type { ParseResult } from '../shared/result_parser.js';
import type { AnalysisReport } from '../shared/failure-analysis.js';
import type { StoreBackend } from '../shared/store-backend.js';
import { rootLogger } from '../shared/logger.js';

function isAutoBugEnabled(): boolean {
    return Config.get('QA_AUTO_BUG') === 'true' || process.env['QA_AUTO_BUG'] === 'true';
}

async function persistFailureClassifications(parsed: ParseResult, backend: StoreBackend): Promise<void> {
    try {
        const persistence = createDataHubPersistence(Config.get('jiraProject') || 'unknown', backend);
        const store = persistence.loadMetricsStore();
        if (!store.failureClassifications) {
            store.failureClassifications = [];
        }
        const failed = parsed.tests.filter((t) => t.state === 'failed');
        for (const test of failed) {
            const category = await classifyFailure(test.title, test.error || '');
            store.failureClassifications.push({
                timestamp: new Date().toISOString(),
                testTitle: test.title,
                category,
                project: Config.get('jiraProject') || 'unknown',
            });
        }
        persistence.saveMetricsStore(store);
    } catch (err) {
        rootLogger.warn('pipeline-jira: metrics save failed: ' + (err instanceof Error ? err.message : String(err)));
    }
}

export async function handleBugCreation(
    parsed: ParseResult,
    pipelineId: string | number,
    branch: string,
    analysisReport: AnalysisReport,
    jiraResource: JiraClient,
    backend: StoreBackend,
): Promise<void> {
    const jira = _jiraEnv();
    const autoBug = isAutoBugEnabled();
    if (!jira) return;
    if (!autoBug && !confirm('Criar bug no Jira com o resumo das falhas?', false)) return;
    try {
        const bugReport = collectAutomated(parsed, {
            pipelineId: String(pipelineId),
            branch,
            provider: currentProvider,
        });
        bugReport.description = analysisReport.content;
        const key = await fileToJira(jiraResource, bugReport, Config.get('jiraProject'));
        success('Bug criado: ' + jira.base + '/browse/' + key);
        pushHistory('create-jira-issue', key, 'ok');
        await persistFailureClassifications(parsed, backend);
    } catch (err) {
        printError('Falha ao criar bug no Jira', err);
        pushHistory('create-jira-issue', pipelineId + '', 'error');
    }
}
