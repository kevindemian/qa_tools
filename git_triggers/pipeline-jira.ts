/** Pipeline Jira — bug creation from CI/CD failure analysis.
 *  Supports QA_AUTO_BUG=true env var to skip interactive confirmation. */
import { confirm, success, printError } from '../shared/ui/prompt.js';
import Config from '../shared/config-accessor.js';
import JiraClient from '../shared/jira/jira-client.js';
import { collectAutomated, fileToJira } from '../shared/report/bug-report.js';
import { _jiraEnv } from './test-results.js';
import { currentProvider, pushHistory } from './session-state.js';
import { getDataHub, isDataHubInitialized } from '../shared/data-hub/global-hub.js';
import { classifyFailure } from '../shared/validation/failure-analysis.js';
import type { ParseResult } from '../shared/result_parser.js';
import type { AnalysisReport } from '../shared/validation/failure-analysis.js';
import type { StoreBackend } from '../shared/infra/store-backend.js';
import { rootLogger } from '../shared/logger.js';
import { extractErrorMessage } from '../shared/ui/prompt-errors.js';

function isAutoBugEnabled(): boolean {
    return Config.get('QA_AUTO_BUG') === 'true' || process.env['QA_AUTO_BUG'] === 'true';
}

async function persistFailureClassifications(parsed: ParseResult, _backend: StoreBackend): Promise<void> {
    try {
        const hub = getDataHub();
        const failed = parsed.tests.filter((t) => t.state === 'failed');
        for (const test of failed) {
            const category = await classifyFailure(test.title, test.error || '');
            if (!hub.raw.failureClassifications) {
                hub.raw.failureClassifications = [];
            }
            hub.raw.failureClassifications.push({
                timestamp: new Date().toISOString(),
                testTitle: test.title,
                category,
                project: Config.get('jiraProject') || 'unknown',
            });
        }
        hub.saveMetricsStore({
            runs: hub.computed.metricsRuns ?? [],
            failureClassifications: hub.raw.failureClassifications ?? [],
        });
    } catch (err) {
        rootLogger.warn('pipeline-jira: metrics save failed: ' + extractErrorMessage(err));
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
        const bugReport = collectAutomated(
            parsed,
            {
                pipelineId: String(pipelineId),
                branch,
                provider: currentProvider,
            },
            { dataHub: isDataHubInitialized() ? getDataHub() : undefined },
        );
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
