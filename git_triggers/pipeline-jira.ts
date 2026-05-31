/** Pipeline Jira — bug creation from CI/CD failure analysis. */
import { confirm, success, printError } from '../shared/prompt';
import Config from '../shared/config';
import JiraClient from '../shared/jira-client';
import { collectAutomated, fileToJira } from '../shared/bug-report';
import { _jiraEnv } from './test-results';
import { currentProvider, pushHistory } from './session-state';
import type { ParseResult } from '../shared/result_parser';
import type { AnalysisReport } from '../shared/failure-analysis';

export async function handleBugCreation(
    parsed: ParseResult,
    pipelineId: string | number,
    branch: string,
    analysisReport: AnalysisReport,
    jiraResource: JiraClient,
): Promise<void> {
    const jira = _jiraEnv();
    if (!jira || !confirm('Criar bug no Jira com o resumo das falhas?', false)) return;
    try {
        const bugReport = collectAutomated(parsed, {
            pipelineId: String(pipelineId),
            branch,
            provider: currentProvider,
        });
        bugReport.description = analysisReport.content;
        const key = await fileToJira(jiraResource, bugReport, Config.jiraProject || 'ECSPOL');
        success('Bug criado: ' + jira.base + '/browse/' + key);
        pushHistory('create-jira-issue', key, 'ok');
    } catch (err) {
        printError('Falha ao criar bug no Jira', err);
        pushHistory('create-jira-issue', pipelineId + '', 'error');
    }
}
