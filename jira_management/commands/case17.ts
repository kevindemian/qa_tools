import fs from 'fs';
import path from 'path';
import { createHttpClient } from '../../shared/http-client';
import { rootLogger } from '../../shared/logger';
import { ask, askConfirm, info, printError, title, withSpinner } from '../../shared/prompt';
import type { JiraSearchResult } from '../../shared/types';
import type { ParseResult, FlatTest } from '../../shared/result_parser';
import { writeReport } from '../../shared/temp-dir';
import { parseTestResultsFile } from '../../shared/result_parser';
import {
    generateHtmlReport,
    categorizeFailure,
    loadKnownIssues,
    type TestRunTab,
    type ReportOptions,
} from '../../shared/report-generator';
import { loadMetrics, calculateFlakiness } from '../../shared/metrics';
import { analyzeFailuresWithReport, type LlmContext } from '../../shared/failure-analysis';
import { collectAutomated, interactiveBugReportFlow } from '../../shared/bug-report';
import { openWithFallback } from '../../shared/open';
import { publishReport } from '../../shared/publish';
import { TestHistoryCache } from '../xray-history';
import type { CommandContext } from './context';
import {
    buildGitTrendHtml,
    buildJiraContextHtml,
    injectAnalysisSection,
    parseCliExtra,
    saveMetricsJson,
} from './case17-helpers';
import { computeDiff, fetchGitHistory, resolveTestHistory } from './case17-test-utils';
import Config from '../../shared/config';

export type { RunStats, CiContext } from './case17-helpers';
export {
    CTRF_LAST_FILE,
    GIT_HISTORY_RUNS,
    isGitHubCi,
    isGitLabCi,
    buildGitTrendHtml,
    buildJiraContextHtml,
    injectAnalysisSection,
    buildDiffSummary,
    isValidCtrfData,
    parseCliExtra,
    saveMetricsJson,
} from './case17-helpers';
export { resolveMapping, resolveTestHistory, computeDiff, fetchGitHistory } from './case17-test-utils';

async function _fetchJiraContext(
    failedTests: FlatTest[],
    jiraResource: CommandContext['jiraResource'],
    projectName: string,
): Promise<string> {
    if (failedTests.length === 0 || !projectName) return '';

    const testNames = failedTests.slice(0, 10).map((t) => t.title.replace(/['"]/g, ''));
    const jql = `project=${projectName} AND issuetype=Bug AND (${testNames.map((t) => `summary~"${t}"`).join(' OR ')})`;
    try {
        const result = await jiraResource.getJiraResource('search?jql=' + encodeURIComponent(jql) + '&maxResults=5');
        const data = result as unknown as JiraSearchResult;
        const issues = data.issues || [];
        if (issues.length === 0) return '';

        let s = '';
        for (const issue of issues.slice(0, 5)) {
            const key = issue.key;
            const fields = issue.fields;
            const summary = fields.summary || '';
            const status = fields.status?.name || '';
            s += `- ${key} (${status}): ${summary}\n`;
        }
        return s;
    } catch (err) {
        rootLogger.error('Falha ao buscar contexto Jira: ' + (err as Error).message);
        return '';
    }
}

async function _addAiAnalysis(html: string, tests: ParseResult['tests'], context?: LlmContext): Promise<string> {
    const analysis = await withSpinner('Analisando falhas com IA...', () => analyzeFailuresWithReport(tests, context));
    if (!analysis || !analysis.content) return html;
    return injectAnalysisSection(html, analysis.content);
}

async function _writeReportFile(html: string, projectName: string): Promise<string> {
    const defaultName = `report-${projectName}-${Date.now()}.html`;
    const outPath = await ask('Caminho de saída do HTML', { default: '' });
    if (outPath.trim()) {
        const resolvedPath = path.resolve(outPath.trim());
        fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
        fs.writeFileSync(resolvedPath, html, 'utf8');
        return resolvedPath;
    }
    return writeReport(defaultName, html);
}

async function _autoCreateJiraBugs(
    diffNewFailures: FlatTest[],
    jiraResource: CommandContext['jiraResource'],
    projectName: string,
): Promise<void> {
    if (diffNewFailures.length === 0) return;
    const cat = categorizeFailure(diffNewFailures[0]?.error || '');

    for (const failure of diffNewFailures) {
        const summary = `[QA Tools] New test failure: ${failure.title}`;
        const description =
            `h2. Test Failure Detected\n\n` +
            `*Test:* ${failure.title}\n` +
            `*Error:* {code}${failure.error || 'N/A'}{code}\n` +
            `*Category:* ${cat}\n` +
            `*Duration:* ${failure.duration}ms\n\n` +
            `h3. Failure Analysis\n\n` +
            `This failure was automatically detected by QA Tools during test execution. ` +
            `It was passing in the previous run and is now failing.\n\n` +
            `h3. Recommended Action\n\n` +
            `1. Investigate the error message above\n` +
            `2. Check recent code changes that may have affected this test\n` +
            `3. Fix the issue and re-run the test suite\n`;

        const payload = {
            fields: {
                project: { key: projectName },
                summary,
                description,
                issuetype: { name: 'Bug' },
            },
        };

        try {
            const result = await jiraResource.postJiraResource('issue', payload);
            const keyVal: unknown = result.key;
            info('Jira bug auto-criado: ' + (typeof keyVal === 'string' ? keyVal : ''));
        } catch (err) {
            printError('Erro ao criar bug no Jira para: ' + failure.title, err);
        }
    }
}

async function _postPrComment(stats: ParseResult['stats']): Promise<void> {
    const githubToken = Config.get('githubToken');
    const repo = Config.get('GITHUB_REPOSITORY');
    const prNumber = Config.get('GITHUB_PR_NUMBER') || Config.get('CI_PR_NUMBER');

    if (!githubToken || !repo || !prNumber) return;

    const passRate = stats.total > 0 ? ((stats.passed / stats.total) * 100).toFixed(1) : '0.0';
    const body =
        `### 🤖 QA Tools — Test Report\n\n` +
        `**${stats.passed} ✅ passed** | **${stats.failed} ❌ failed** | **${stats.skipped} ⏭ skipped** | **${stats.total} total**\n\n` +
        `**Pass rate:** ${passRate}%\n\n` +
        `[View full report](${Config.get('CI_JOB_URL') || ''})\n`;

    try {
        const client = createHttpClient({
            baseUrl: 'https://api.github.com',
            authHeader: { Authorization: 'Bearer ' + githubToken },
        });
        await client.post(`/repos/${repo}/issues/${prNumber}/comments`, { body });
        info('PR comment posted successfully');
    } catch (err) {
        printError('Erro ao postar comment no PR', err);
    }
}

function _loadFlakinessMap(c: CommandContext): Record<string, number> {
    try {
        const store = loadMetrics();
        const projectRuns = store.runs.filter((r) => r.project === c.ctx.project_name);
        const flakyEntries = projectRuns.length >= 2 ? calculateFlakiness({ runs: projectRuns }, 2) : [];
        const map: Record<string, number> = {};
        for (const entry of flakyEntries) {
            map[entry.title] = entry.rate;
        }
        return map;
    } catch (err: unknown) {
        rootLogger.warn('Failed to load flakiness metrics: ' + (err as Error).message);
        return {};
    }
}

async function _buildReportOptions(
    c: CommandContext,
    result: ParseResult,
    diff: ReturnType<typeof computeDiff>,
    cliExtra: ReturnType<typeof parseCliExtra>,
): Promise<ReportOptions> {
    const historyCache = new TestHistoryCache();
    const testHistory = await resolveTestHistory(result.tests, c, historyCache);
    const knownIssues = loadKnownIssues(Config.get('knownIssuesPath'));

    const runs: TestRunTab[] = [];
    for (const extra of cliExtra.extraRuns) {
        const r = parseTestResultsFile(extra.file);
        if (r.error) {
            printError('Erro ao ler run adicional: ' + extra.file, new Error(r.error));
            continue;
        }
        runs.push({ name: extra.name, tests: r.tests });
    }
    if (runs.length > 0) {
        runs.unshift({ name: 'Primary', tests: result.tests });
    }

    const flakinessMap = _loadFlakinessMap(c);
    const qualityGateThreshold = parseFloat(Config.get('QA_FAIL_ON') || '');

    const genOptions: ReportOptions = {
        title: `Relatório - ${c.ctx.project_name}`,
        generatedAt: new Date().toISOString(),
        source: 'Relatório HTML',
        testHistory: Object.keys(testHistory).length > 0 ? testHistory : undefined,
        knownIssues: knownIssues.length > 0 ? knownIssues : undefined,
        runs: runs.length > 0 ? runs : undefined,
        diffComparison: diff,
        flakinessMap: Object.keys(flakinessMap).length > 0 ? flakinessMap : undefined,
    };
    if (!isNaN(qualityGateThreshold)) {
        genOptions.qualityGate = qualityGateThreshold;
    }
    return genOptions;
}

async function _enrichHtmlWithContext(
    html: string,
    c: CommandContext,
    failedTests: FlatTest[],
): Promise<{ html: string; ciContext: Awaited<ReturnType<typeof fetchGitHistory>>; jiraContext: string }> {
    const ciContext = await fetchGitHistory();
    const gitHtml = buildGitTrendHtml(ciContext);
    let enriched = html;
    if (gitHtml) {
        enriched = enriched.replace('</body>', gitHtml + '</body>');
    }

    const jiraContext = await _fetchJiraContext(failedTests, c.jiraResource, c.ctx.project_name);
    const jiraHtml = buildJiraContextHtml(jiraContext);
    if (jiraHtml) {
        enriched = enriched.replace('</body>', jiraHtml + '</body>');
    }
    return { html: enriched, ciContext, jiraContext };
}

async function _runAiAnalysis(
    html: string,
    result: ParseResult,
    ciContext: Awaited<ReturnType<typeof fetchGitHistory>>,
    jiraContext: string,
): Promise<string> {
    const llmContext: LlmContext = {};
    if (ciContext.commits) llmContext.gitCommits = ciContext.commits;
    if (ciContext.runs.length > 0) {
        llmContext.gitTrend = ciContext.runs
            .map(
                (r) =>
                    `Run ${r.runId} (${(r.createdAt || '').slice(0, 10)}): ${r.passRate.toFixed(1)}% (${r.passed}/${r.total})`,
            )
            .join('\n');
    }
    if (jiraContext) llmContext.jiraIssues = jiraContext;

    if (result.stats.failed > 0 && (await askConfirm('Incluir análise das falhas (IA)?', true))) {
        return _addAiAnalysis(html, result.tests, llmContext);
    }
    return html;
}

function _handlePublish(resolvedPath: string, cliExtra: ReturnType<typeof parseCliExtra>): void {
    const publishTarget = cliExtra.publishTarget || Config.get('QA_PUBLISH') || '';
    if (publishTarget && (publishTarget === 's3' || publishTarget === 'gh-pages')) {
        info('Publicando relatório para ' + publishTarget + '...');
        publishReport({ target: publishTarget, filePath: resolvedPath });
    }
}

async function _handleAutoBugs(c: CommandContext, diff: ReturnType<typeof computeDiff>): Promise<void> {
    if (Config.get('QA_AUTO_BUG') === 'true' && diff.newFailures.length > 0) {
        info('Criando bugs no Jira para novas falhas...');
        await _autoCreateJiraBugs(diff.newFailures, c.jiraResource, c.ctx.project_name);
    }
}

function _printDiffSummary(diff: ReturnType<typeof computeDiff>): void {
    if (diff.newFailures.length > 0 || diff.newPasses.length > 0) {
        info(`Diff: ${diff.newFailures.length} novas falhas, ${diff.newPasses.length} novos passes`);
    }
}

async function _handleQualityGateCheck(
    result: ParseResult,
    diff: ReturnType<typeof computeDiff>,
    qualityGateThreshold: number,
): Promise<boolean> {
    _printDiffSummary(diff);
    await _postPrComment(result.stats);

    if (
        !isNaN(qualityGateThreshold) &&
        result.stats.total > 0 &&
        (result.stats.passed / result.stats.total) * 100 < qualityGateThreshold
    ) {
        printError('Quality Gate', new Error(`Pass rate below threshold (${qualityGateThreshold}%)`));
        return false;
    }
    return true;
}

async function _handleInteractiveBugReport(c: CommandContext, result: ParseResult): Promise<void> {
    if (
        result.stats.failed > 0 &&
        (await askConfirm('Deseja criar um relatório de bug (Bug Report) no Jira para as falhas?', false))
    ) {
        const automatedReport = collectAutomated(result);
        await interactiveBugReportFlow(c.jiraResource, c.ctx.project_name, automatedReport, c.linkManager);
    }
}

async function handler(c: CommandContext): Promise<boolean | void> {
    const filePath = await ask('Caminho do arquivo de resultados JSON', {
        hint: 'ex: cypress/reports/ctrf-report.json',
    });
    if (!filePath.trim()) {
        printError('Relatório HTML', new Error('Caminho do arquivo vazio.'));
        return;
    }

    const cliExtra = parseCliExtra();
    title('Analisando relatório...');
    const result = parseTestResultsFile(filePath.trim());
    if (result.error) {
        printError('Erro ao ler relatório', new Error(result.error));
        return;
    }

    const diff = computeDiff(result.tests);
    const genOptions = await _buildReportOptions(c, result, diff, cliExtra);
    let html = generateHtmlReport(result.tests, genOptions);

    const failedTests = result.tests.filter((t) => t.state === 'failed');
    const enriched = await _enrichHtmlWithContext(html, c, failedTests);
    html = enriched.html;
    html = await _runAiAnalysis(html, result, enriched.ciContext, enriched.jiraContext);

    const resolvedPath = await _writeReportFile(html, c.ctx.project_name);
    saveMetricsJson(result.tests, path.dirname(resolvedPath));
    await openWithFallback(resolvedPath, 'Relatório', info);
    c.pushHistory(
        'html-report',
        `${result.stats.total} testes (${result.stats.passed} pass, ${result.stats.failed} fail)`,
        'ok',
    );

    _handlePublish(resolvedPath, cliExtra);
    await _handleAutoBugs(c, diff);

    const qualityGateThreshold = parseFloat(Config.get('QA_FAIL_ON') || '');
    const gateOk = await _handleQualityGateCheck(result, diff, qualityGateThreshold);
    if (!gateOk) return false;

    await _handleInteractiveBugReport(c, result);
}

export default { handler };
