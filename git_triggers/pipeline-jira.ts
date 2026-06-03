/** Pipeline Jira — bug creation from CI/CD failure analysis.
 *  Supports QA_AUTO_BUG=true env var to skip interactive confirmation. */
import { confirm, success, printError } from '../shared/prompt';
import Config from '../shared/config';
import JiraClient from '../shared/jira-client';
import { collectAutomated, fileToJira } from '../shared/bug-report';
import { _jiraEnv } from './test-results';
import { currentProvider, pushHistory } from './session-state';
import { loadMetrics, saveMetrics, type MetricsStore } from '../shared/metrics';
import { classifyFailure } from '../shared/failure-analysis';
import type { ParseResult } from '../shared/result_parser';
import type { AnalysisReport } from '../shared/failure-analysis';

function isAutoBugEnabled(): boolean {
    return Config.get('QA_AUTO_BUG') === 'true' || process.env.QA_AUTO_BUG === 'true';
}

async function persistFailureClassifications(parsed: ParseResult): Promise<void> {
    try {
        const store: MetricsStore = loadMetrics();
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
        saveMetrics(store);
    } catch {
        // Non-critical — do not fail the pipeline
    }
}

export async function handleBugCreation(
    parsed: ParseResult,
    pipelineId: string | number,
    branch: string,
    analysisReport: AnalysisReport,
    jiraResource: JiraClient,
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
        await persistFailureClassifications(parsed);
    } catch (err) {
        printError('Falha ao criar bug no Jira', err);
        pushHistory('create-jira-issue', pipelineId + '', 'error');
    }
}
