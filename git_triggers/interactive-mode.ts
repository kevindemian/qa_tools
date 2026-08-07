/**
 * Interactive mode — handles the main menu loop and project selection.
 * Extracted from main.ts for single responsibility and testability.
 */
import { pushBreadcrumb, clearBreadcrumbs } from '../shared/ui/breadcrumbs.js';
import { createValidateEnv, offerEnvSetup, setupSigint } from '../shared/ui/cli_base.js';
import Config from '../shared/config-accessor.js';
import { isJiraConfigured } from '../shared/jira/config.js';
import { getCurrentProject, setCurrentProject } from '../shared/project-context.js';
import { showSplash } from '../shared/ui/splash.js';
import { calcRunFailureRate } from '../shared/data-hub/compute/run-failure-rate.js';
import type { MetricsRun, RawXrayData } from '../shared/types/data-hub.js';
import { compareRuns } from '../shared/quality/run-comparison.js';
import { calculateHealthScore } from '../shared/quality/health-score.js';
import { palette } from '../shared/ui/palette.js';
import { defaultOutput } from '../shared/ui/output.js';
import { rootLogger } from '../shared/logger.js';
import { formatErr } from '../shared/errors.js';
import {
    success,
    warn,
    info,
    title,
    prompt,
    showSelect,
    printError,
    confirm as promptConfirm,
} from '../shared/ui/prompt.js';
import { load as loadState, update as updateState } from '../shared/state.js';
import type { GitProvider, JsonObject, StateContainer } from '../shared/types.js';
import {
    sessionLog,
    sessionContext,
    isBusy,
    providerLabel,
    buildActionChoices,
    displayProjects,
    displayRecentPipelines,
    printSessionSummary,
    getProviderForProject,
    createManagerForProject,
    pushHistory,
    setProjectId,
    setManager,
    projectId,
    getProjects,
    ensureDataHub,
    getDataHub,
    isDataHubInitialized,
    prefetchAllProjects,
    ensureDataHubSync,
} from './session-state.js';
import {
    handleTriggerPipeline,
    handleExportVariables,
    isComplete,
    pollPipeline,
    _jiraEnv,
    _resolveGlob,
    downloadTestArtifacts,
    parseTestResults,
    createTestExecution,
    collectTestResults,
} from './pipeline-handler.js';
import { nivelarBranchesWrapper, handleCreateMR, handleListApprovedMRs, handleMergeMR } from './mr-handler.js';
import { ensureDirs, registerCleanup } from '../shared/infra/temp-dir.js';
import {
    handleListSchedules,
    handleRunSchedule,
    handleChangeProject,
    generateWeeklyQualityReport,
} from './schedule-handler.js';
import { tryBatchMode } from './batch-mode.js';
import { interactiveBugReportFlow } from '../shared/report/bug-report.js';
import JiraClient from '../shared/jira/jira-client.js';
import JiraLinkManager from '../jira_management/jira_link_manager.js';

import { generateReleaseScoreHtml } from '../shared/quality/release-score-renderer.js';
import { generateDefectTrendHtml } from '../shared/quality/defect-trend.js';
import { generateSeasonalityHtml } from '../shared/quality/defect-seasonality.js';
import { generateDeveloperProfileHtml } from '../shared/quality/developer-profile.js';
import { generateBacklogHealthHtml } from '../shared/report/backlog-health.js';
import { generateIncidentReportHtml } from '../shared/report/incident-report.js';
import { generatePipelineCostHtml } from '../shared/quality/pipeline-cost.js';
import { generateImpactAlertHtml } from '../shared/report/impact-alert.js';
import { buildIncidentReport } from '../shared/report/incident-report.js';
import { analyzePipelineImpact } from '../shared/report/impact-alert.js';
import { writeReport } from '../shared/infra/temp-dir.js';
import { runQualityGate } from '../shared/quality/quality-gate.js';
import { openWithFallback } from '../shared/open.js';
import { generateCoverageGapHtml } from '../shared/report/generate-coverage-gap-html.js';
import { buildQualityGateSection } from '../shared/report/report-sections.js';
import { buildHtmlPage } from '../shared/primitives/html-factory.js';
import { buildCss } from '../shared/primitives/report-styles.js';
import { resolveGeneratedAt } from '../shared/date-utils.js';
import { handleHelp as _handleHelp, handleShowHistory as _handleShowHistory } from './ui-helpers.js';
import { handleSetupWizard as _handleSetupWizard } from './case00-handler.js';
import { handlePrReportReconfig } from './pr-report-setup-handler.js';
import { showDocs } from '../shared/report/show-docs.js';
import { showDashboardMenu } from '../shared/ui/dashboard-menu.js';
import type { DashboardDef } from '../shared/ui/dashboard-menu.js';
import type { CliArgs } from './cli-args.js';
import { generatePrDescription } from './ai-pr-desc.js';

const validateEnv = createValidateEnv([
    { key: 'GIT_TOKEN', label: 'GIT_TOKEN (token de autenticação GitLab)', example: 'GIT_TOKEN=seu-token-aqui' },
    {
        key: 'GIT_BASE_URL',
        label: 'GIT_BASE_URL (URL base do GitLab)',
        example: 'GIT_BASE_URL=https://gitlab.seusite.com',
    },
    {
        key: 'GITHUB_TOKEN',
        label: 'GITHUB_TOKEN (token GitHub, opcional se usar GitHub)',
        example: 'GITHUB_TOKEN=seu-token-github',
    },
]);

async function handleHelp(): Promise<void> {
    await _handleHelp();
}

async function handleShowHistory(): Promise<void> {
    await _handleShowHistory();
}

function buildContextLine(): string {
    return providerLabel().toUpperCase() + ' TOOLS' + sessionContext.buildContextLine();
}

function _selectProject(): { projectName: string | null; names: string[] } {
    const envProject = process.env['QA_CURRENT_PROJECT'];
    const activeProject = getCurrentProject();
    if (envProject && envProject.length > 0 && activeProject) {
        setProjectId(Reflect.get(getProjects(), activeProject));
        updateState((s: StateContainer) => {
            s['lastProject'] = activeProject;
        });
        success('Projeto selecionado (env): ' + activeProject + ' (' + getProviderForProject(activeProject) + ')');
        return { projectName: activeProject, names: [] };
    }
    const state = loadState();
    const allProjects = getProjects();
    const names = Object.keys(allProjects).sort((a, b) => a.localeCompare(b));
    displayProjects(names, state['lastProject'] as string);
    const firstDefault = typeof state['lastProject'] === 'string' ? state['lastProject'] : '';
    const firstChoice = prompt('Escolha um projeto', {
        hint: '1-' + names.length,
        default: firstDefault,
    });
    const firstIdx = !firstChoice.trim() ? names.indexOf(firstDefault) + 1 : parseInt(firstChoice, 10);
    if (isNaN(firstIdx) || firstIdx < 1 || firstIdx > names.length) {
        warn('Projeto inválido.');
        return { projectName: null, names };
    }
    const projectName = names[firstIdx - 1] as string;
    setCurrentProject(projectName);
    setProjectId(Reflect.get(allProjects, projectName));
    updateState((s: StateContainer) => {
        s['lastProject'] = projectName;
    });
    success('Projeto selecionado: ' + projectName + ' (' + getProviderForProject(projectName) + ')');
    return { projectName, names };
}

function _buildSessionHeader(): string[] {
    const headerLines: string[] = [];
    if (sessionContext.sessionCounters.length > 0) {
        const ok = sessionContext.sessionCounters.filter((c: { status: string }) => c.status === 'ok').length;
        const err = sessionContext.sessionCounters.filter((c: { status: string }) => c.status === 'error').length;
        headerLines.push(
            `   ${palette.muted(sessionContext.sessionCounters.length + ' operações')}  ·  ${palette.green('' + ok + ' ✓')}${err > 0 ? '  ' + palette.red('' + err + ' ✗') : ''}`,
        );
    }
    return headerLines;
}

function _getLastChoice(): string | undefined {
    const lastChoice = loadState()['lastChoice'] as string | undefined;
    return lastChoice && lastChoice !== '0' ? lastChoice : undefined;
}

async function _promptChoice(stateHint: string): Promise<string> {
    if (process.stdout.isTTY && !Config.get('quiet')) {
        const ctx = buildContextLine();
        const headerLines = _buildSessionHeader();
        if (headerLines.length > 0) {
            defaultOutput.box(headerLines, { border: 'double', padding: 1, title: 'QA Tools · ' + ctx, width: 80 });
        }

        const defaultChoice = _getLastChoice();
        return showSelect('      Escolha uma opção', buildActionChoices(), {
            ...(defaultChoice ? { default: defaultChoice } : {}),
            pageSize: (process.stdout.rows || 24) - 4,
        });
    }
    const nonTtyLines = buildActionChoices()
        .filter((c: JsonObject) => c['name'])
        .map((c: JsonObject) => '  ' + String(c['name']));
    nonTtyLines.unshift('');
    nonTtyLines.push('  /help   Ajuda');
    nonTtyLines.push('  /exit   Voltar ao menu principal');
    nonTtyLines.push('');
    defaultOutput.box(nonTtyLines, {
        border: 'double',
        padding: 1,
        title: 'QA Tools · ' + providerLabel().toUpperCase() + ' TOOLS',
    });
    const choice = prompt('Escolha uma opção', { hint: stateHint });
    const lastChoice = _getLastChoice();
    const resolved = !choice.trim() && lastChoice ? lastChoice : choice;
    if (resolved !== choice) info('Repetindo última opção: ' + resolved);
    return resolved;
}

function withErrorHandling(
    handler: (m: GitProvider, pn: string, ns: string[]) => Promise<unknown>,
): (m: GitProvider, pn: string, ns: string[]) => Promise<boolean> {
    return (m, pn, ns) =>
        handler(m, pn, ns).then(
            () => false,
            (err) => {
                printError('Handler error', err);
                return false;
            },
        );
}

/**
 * Handler for run comparison — compares the two most recent runs for the current project.
 */
async function handleRunComparison(): Promise<boolean> {
    const project = getCurrentProject() ?? '';
    if (!project) {
        warn('Nenhum projeto selecionado.');
        return false;
    }
    const hub = getDataHub();
    const projectRuns = (hub.computed.metricsRuns ?? [])
        .filter((r) => r.project === project)
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    if (projectRuns.length < 2) {
        warn('São necessárias pelo menos 2 execuções para comparar.');
        return false;
    }
    const runA = projectRuns[projectRuns.length - 2] as MetricsRun;
    const runB = projectRuns[projectRuns.length - 1] as MetricsRun;
    const comparison = await compareRuns(runA, runB);
    if (comparison) {
        title('Comparação de Execuções');
        info(comparison);
    } else {
        warn('Falha ao gerar comparação.');
    }
    return false;
}

/**
 * Handler for AI PR Description — generates PR/MR description from git diff.
 */
async function handleAiPrDescription(m: GitProvider): Promise<boolean> {
    const source = prompt('Branch de origem (ex: feature/minha-branch):', { hint: 'source branch' });
    if (!source.trim()) {
        warn('Branch de origem obrigatória.');
        return false;
    }
    const target = prompt('Branch de destino (ex: main, develop):', { hint: 'target branch', default: 'main' });
    if (!target.trim()) {
        warn('Branch de destino obrigatória.');
        return false;
    }
    info('Gerando descrição do PR/MR via IA...');
    const description = await generatePrDescription(m, source.trim(), target.trim());
    if (description) {
        title('Descrição do PR/MR Gerada');
        info(description);
    } else {
        warn('Falha ao gerar descrição (diff vazio ou erro na IA).');
    }
    return false;
}

/**
 * Handler for Bug Report Interactive Flow — creates bug reports in Jira.
 */
async function handleBugReportFlow(_m: GitProvider): Promise<boolean> {
    if (!Config.get('jiraBaseUrl') || !Config.get('jiraPersonalToken')) {
        warn('Jira não configurado. Configure JIRA_BASE_URL e JIRA_PERSONAL_TOKEN no .env');
        return false;
    }
    const projectKey = Config.get('jiraProject');
    if (!projectKey) {
        warn('JIRA_PROJECT não configurado no .env');
        return false;
    }
    const jiraResource = new JiraClient(
        Config.get('jiraPersonalToken'),
        Config.get('jiraBaseUrl') + '/rest/api/2',
        Config.get('jiraMode'),
    );
    const linkManager = new JiraLinkManager(jiraResource);
    await interactiveBugReportFlow(jiraResource, projectKey, undefined, linkManager);
    return false;
}

/**
 * Load project runs from the Data Hub — shared helper for dashboards that
 * need run-level metrics. Data comes exclusively from hub.computed.metricsRuns.
 */
function _loadProjectRunsHelper(): {
    projectRuns: MetricsRun[];
} | null {
    if (!getCurrentProject()) {
        warn('Nenhum projeto selecionado.');
        return null;
    }
    const hub = getDataHub();
    const projectRuns = (hub.computed.metricsRuns ?? []).filter((r) => r.project === (getCurrentProject() ?? ''));
    if (projectRuns.length < 2) {
        warn('Menos de 2 execuções registradas. Execute pipelines para gerar dados primeiro.');
        return null;
    }
    return { projectRuns };
}

async function _generateAndOpenDashboard(html: string, suffix: string, label: string): Promise<void> {
    const outPath = writeReport('dashboard-' + suffix + '-' + (getCurrentProject() ?? '') + '.html', html);
    await openWithFallback(outPath, label, info);
}

async function _dashboardReleaseScore(): Promise<void> {
    const data = _loadProjectRunsHelper();
    if (!data) return;
    const dataHub = getDataHub();
    const releaseScore = dataHub.computed.releaseScore;
    await _generateAndOpenDashboard(generateReleaseScoreHtml(releaseScore), 'release-score', 'Release Score');
}

async function _dashboardDefectTrends(): Promise<void> {
    if (!getCurrentProject()) {
        warn('Nenhum projeto selecionado.');
        return;
    }
    const hub = getDataHub();
    const defects = hub.computed.defectAggregation;
    if (!defects) {
        warn('Nenhum dado de defeitos disponível no DataHub. Execute pipelines para gerar dados primeiro.');
        return;
    }
    await _generateAndOpenDashboard(generateDefectTrendHtml(defects), 'defect-trends', 'Defect Trends');
}

async function _dashboardSeasonality(): Promise<void> {
    if (!getCurrentProject()) {
        warn('Nenhum projeto selecionado.');
        return;
    }
    const hub = getDataHub();
    const seasonality = hub.computed.seasonalityAggregation;
    if (!seasonality) {
        warn('Nenhum dado de sazonalidade disponível no DataHub. Execute pipelines para gerar dados primeiro.');
        return;
    }
    await _generateAndOpenDashboard(generateSeasonalityHtml(seasonality), 'seasonality', 'Defect Seasonality');
}

async function _dashboardDeveloperProfile(): Promise<void> {
    if (!getCurrentProject()) {
        warn('Nenhum projeto selecionado.');
        return;
    }
    const hub = getDataHub();
    const devProfile = hub.computed.developerProfile;
    if (!devProfile) {
        warn('Nenhum perfil de desenvolvedor disponível no DataHub.');
        return;
    }
    await _generateAndOpenDashboard(generateDeveloperProfileHtml(devProfile), 'developer-profile', 'Developer Profile');
}

async function _dashboardBacklogHealth(): Promise<void> {
    if (!getCurrentProject()) {
        warn('Nenhum projeto selecionado.');
        return;
    }
    const hub = getDataHub();
    const backlog = hub.computed.backlogHealth;
    if (!backlog) {
        warn('Nenhum dado de saúde do backlog disponível no DataHub. Configure a integração Jira e sincronize.');
        return;
    }
    await _generateAndOpenDashboard(generateBacklogHealthHtml(backlog), 'backlog-health', 'Backlog Health');
}

async function _dashboardIncidentReport(): Promise<void> {
    const data = _loadProjectRunsHelper();
    if (!data) return;
    const dataHub = getDataHub();
    const health = calculateHealthScore({ dataHub });
    const regression = dataHub.computed.regressionDetection;
    const seasonality = dataHub.computed.seasonalityAggregation;
    const coverageGap = dataHub.computed.coverageGap;
    const failRate = calcRunFailureRate(data.projectRuns);

    const uncoveredEpics = coverageGap?.gateConfig.failingEpics ?? [];

    const incidentReport = buildIncidentReport(
        failRate,
        regression?.regressions.length ?? 0,
        seasonality?.peakDay ?? 'N/A',
        uncoveredEpics,
        health.overall,
        coverageGap,
    );
    await _generateAndOpenDashboard(generateIncidentReportHtml(incidentReport), 'incident-report', 'Incident Report');
}

async function _dashboardPipelineCost(): Promise<void> {
    if (!getCurrentProject()) {
        warn('Nenhum projeto selecionado.');
        return;
    }
    const dataHub = getDataHub();
    const pipelineCost = dataHub.computed.pipelineCostResult;
    if (!pipelineCost) {
        warn('Nenhum dado de custo de pipeline disponível no DataHub.');
        return;
    }
    await _generateAndOpenDashboard(generatePipelineCostHtml(pipelineCost), 'pipeline-cost', 'Pipeline Cost');
}

async function _dashboardImpactAlert(): Promise<void> {
    const data = _loadProjectRunsHelper();
    if (!data) return;
    const dataHub = getDataHub();
    const health = calculateHealthScore({ dataHub });
    const defects = dataHub.computed.defectAggregation;
    const coverageGap = dataHub.computed.coverageGap;

    const uncoveredEpics = coverageGap?.gateConfig.failingEpics ?? [];

    const trendCategories = new Set<string>();
    for (const t of defects?.trends ?? []) {
        for (const cat of Object.keys(t.categories)) {
            trendCategories.add(cat);
        }
    }
    const impactAlert = analyzePipelineImpact(
        health.dimensions.passRate.score,
        data.projectRuns.filter((r) => r.failed > 0).length,
        [...trendCategories].slice(0, 5),
        health.dimensions.coverage.score,
        uncoveredEpics,
        coverageGap,
    );
    await _generateAndOpenDashboard(generateImpactAlertHtml(impactAlert), 'impact-alert', 'Pipeline Impact Alert');
}

async function _dashboardQualityGate(): Promise<void> {
    if (!getCurrentProject()) {
        warn('Nenhum projeto selecionado.');
        return;
    }
    const dataHub = getDataHub();
    const qualityGate = runQualityGate({ project: getCurrentProject() ?? '', dataHub });
    const timestamp = resolveGeneratedAt();
    const html = buildHtmlPage({
        title: 'Quality Gate',
        styles: buildCss(),
        theme: 'system',
        bodyContent:
            '<div data-dashboard="quality-gate">' +
            '<h1>Quality Gate</h1>' +
            `<div data-part="timestamp" data-dashboard="quality-gate">${timestamp.slice(0, 10)}</div>` +
            buildQualityGateSection(qualityGate) +
            '</div>',
        footer: 'Generated by QA Tools — Quality Gate',
    });
    await _generateAndOpenDashboard(html, 'quality-gate', 'Quality Gate');
}

async function _dashboardCoverageGap(): Promise<void> {
    if (!getCurrentProject()) {
        warn('Nenhum projeto selecionado.');
        return;
    }
    const hub = getDataHub();
    const result = hub.computed.coverageGap;
    if (!result) {
        warn('Nenhum resultado de Coverage Gap no DataHub. Sincronize os issues do Jira para gerar a análise.');
        return;
    }
    await _generateAndOpenDashboard(
        generateCoverageGapHtml(result, 'Coverage Gap — ' + (getCurrentProject() ?? '')),
        'coverage-gap',
        'Coverage Gap',
    );
}

/**
 * Display CI Data Hub summary in interactive mode.
 *
 * Fetches pipeline data from the CI provider and displays key metrics:
 * - Pass rate, average duration, suite speed P95
 * - Top failing jobs with failure rates
 * - Flaky tests with oscillation rates
 * - Branch breakdown with pass rates
 *
 * @param m - GitProvider instance for fetching CI data
 */
async function _showDataHubSummary(): Promise<void> {
    try {
        info('Buscando dados do CI Data Hub...');
        await ensureDataHub();

        if (!isDataHubInitialized()) {
            warn('Nenhum dado de pipeline encontrado para este repositório.');
            return;
        }
        const hub = getDataHub();

        if (hub.raw.runs.length === 0) {
            warn('Nenhum dado de pipeline encontrado para este repositório.');
            return;
        }

        const lines = [
            '',
            '  === CI Data Hub — ' + (getCurrentProject() ?? '') + ' ===',
            '',
            '  Provider:          ' + hub.provider,
            '  Repositório:       ' + hub.repo,
            '  Runs analisadas:   ' + hub.raw.runs.length,
            '  Pass Rate:         ' + hub.computed.passRate + '%',
            '  Duração média:     ' + Math.round(hub.computed.avgDuration) + 's',
            '  Suite Speed P95:   ' + hub.computed.suiteSpeedP95 + 'ms',
            '',
        ];

        if (hub.computed.topFailingJobs.length > 0) {
            lines.push('  Top Jobs com Falha:');
            for (const job of hub.computed.topFailingJobs.slice(0, 5)) {
                lines.push('    - ' + job.name + ': ' + job.failureRate + '% (' + job.count + ' falhas)');
            }
            lines.push('');
        }

        if (hub.computed.flakyRate.length > 0) {
            lines.push('  Testes Flaky:');
            for (const test of hub.computed.flakyRate.slice(0, 5)) {
                lines.push('    - ' + test.title + ': ' + test.rate + '% (' + test.runs + ' runs)');
            }
            lines.push('');
        }

        if (Object.keys(hub.computed.branchBreakdown).length > 0) {
            lines.push('  Pass Rate por Branch:');
            for (const [branch, data] of Object.entries(hub.computed.branchBreakdown)) {
                lines.push('    - ' + branch + ': ' + data.passRate + '% (' + data.count + ' runs)');
            }
            lines.push('');
        }

        if (hub.raw.jiraIssues?.length) {
            lines.push('  Jira Issues:       ' + hub.raw.jiraIssues.length);
            lines.push('');
        }

        if (hub.raw.xray) {
            lines.push(...buildXraySummaryLines(hub.raw.xray));
        }

        info(lines.join('\n'));
    } catch (err) {
        printError('CI Data Hub error', err);
    }
}

/** Constrói as linhas de resumo de dados Xray (test executions + test runs). */
function buildXraySummaryLines(xray: RawXrayData): string[] {
    const lines: string[] = [];
    const totalRuns = xray.testRuns.length;
    const passed = xray.testRuns.filter((r) => r.status === 'PASSED').length;
    const failed = xray.testRuns.filter((r) => r.status === 'FAILED').length;
    const skipped = xray.testRuns.filter((r) => r.status === 'SKIPPED').length;
    lines.push('  Xray — Test Executions: ' + xray.testExecutions.length);
    lines.push('    Test Runs: ' + totalRuns + ' (pass ' + passed + ' / fail ' + failed + ' / skip ' + skipped + ')');
    for (const exec of xray.testExecutions.slice(0, 5)) {
        lines.push(
            '    - ' +
                exec.key +
                ': ' +
                (exec.status ?? '?') +
                ' (' +
                (exec.passed ?? 0) +
                '/' +
                (exec.total ?? 0) +
                ' pass)',
        );
    }
    lines.push('');
    return lines;
}

async function _showDashboardMenu(): Promise<void> {
    const dashboards: DashboardDef[] = [
        { id: '1', label: 'Release Score', handler: _dashboardReleaseScore },
        { id: '2', label: 'Defect Trends', handler: _dashboardDefectTrends },
        { id: '3', label: 'Defect Seasonality', handler: _dashboardSeasonality },
        { id: '4', label: 'Developer Profile', handler: _dashboardDeveloperProfile },
        { id: '5', label: 'Backlog Health', handler: _dashboardBacklogHealth },
        { id: '6', label: 'Incident Report', handler: _dashboardIncidentReport },
        { id: '7', label: 'Pipeline Cost', handler: _dashboardPipelineCost },
        { id: '8', label: 'Pipeline Impact Alert', handler: _dashboardImpactAlert },
        { id: '9', label: 'Quality Gate', handler: _dashboardQualityGate },
        { id: '10', label: 'Coverage Gap', handler: _dashboardCoverageGap },
    ];
    await showDashboardMenu(getCurrentProject() ?? '', dashboards);
}

const ACTION_HANDLERS: Record<string, (m: GitProvider, pn: string, ns: string[]) => Promise<boolean>> = {
    '00': () => _handleSetupWizard(),
    w: () => _handleSetupWizard(),
    '1': withErrorHandling((m, pn) => handleTriggerPipeline(m, pn)),
    '2': withErrorHandling((m) => handleListSchedules(m)),
    '3': withErrorHandling((m) => handleRunSchedule(m)),
    '4': withErrorHandling((m) => handleCreateMR(m)),
    '5': withErrorHandling((m) => handleListApprovedMRs(m)),
    '6': withErrorHandling((m) => handleMergeMR(m)),
    '7': withErrorHandling((m) => nivelarBranchesWrapper(m)),
    '8': withErrorHandling((m) => handleExportVariables(m)),
    '9': withErrorHandling((_m, _pn, ns) => handleChangeProject(ns)),
    b: async () => {
        await tryBatchMode();
        return false;
    },
    c: async () => {
        await handleRunComparison();
        return false;
    },
    d: async () => {
        await _showDashboardMenu();
        return false;
    },
    h: async (_m, _pn, _ns) => {
        await _showDataHubSummary();
        return false;
    },
    f: () => {
        handlePrReportReconfig();
        return Promise.resolve(false);
    },
    g: withErrorHandling((m) => handleBugReportFlow(m)),
    i: withErrorHandling((m) => handleAiPrDescription(m)),
    q: async () => {
        await _dashboardQualityGate();
        return false;
    },
    t: () => {
        const current = Config.get<boolean>('qaAutoBug');
        Config.set('qaAutoBug', !current);
        success('Bug automático ' + (!current ? 'ativado' : 'desativado') + '.');
        return Promise.resolve(false);
    },
    r: () => {
        generateWeeklyQualityReport();
        return Promise.resolve(false);
    },
};

function _handleExit(): boolean {
    clearBreadcrumbs();
    title('Até logo!');
    printSessionSummary();
    return true;
}

async function _dispatchAction(
    finalChoice: string,
    m: GitProvider,
    projectName: string,
    names: string[],
): Promise<boolean> {
    const cmd = finalChoice.trim().toLowerCase();
    if (cmd === '/h' || cmd === '/help') {
        await handleHelp();
        return false;
    }
    if (cmd === '/history') {
        await handleShowHistory();
        return false;
    }
    if (cmd === '/docs' || cmd === '/d') {
        await showDocs();
        return false;
    }
    if (cmd === '/back' || cmd === '/menu') {
        return false;
    }
    if (finalChoice === '0' || cmd === '/exit' || cmd === '/sair') return _handleExit();

    const handlerFn = Reflect.get(ACTION_HANDLERS, finalChoice) as
        ((m: GitProvider, projectName: string, names: string[]) => boolean | Promise<boolean>) | undefined;
    if (handlerFn !== undefined) return handlerFn(m, projectName, names);
    warn('Opção inválida.');
    return false;
}

function _initInfrastructure(): void {
    ensureDirs();
    registerCleanup();
}

async function _ensureProjectsConfigured(): Promise<boolean> {
    let projs = getProjects();
    if (Object.keys(projs).length === 0) {
        warn('Nenhum projeto configurado.');
        try {
            const wantsSetup = promptConfirm('Deseja configurar um projeto agora?');
            if (wantsSetup) {
                await _handleSetupWizard();
                projs = getProjects();
            }
        } catch (err) {
            rootLogger.debug('Project setup cancelled: ' + formatErr(err));
        }
        if (Object.keys(projs).length === 0) {
            warn('É necessário configurar ao menos um projeto. Configure projects.json ou execute o setup wizard.');
            return false;
        }
    }
    return true;
}

async function _initEnvironment(): Promise<void> {
    setupSigint(
        () => isBusy,
        () => printSessionSummary(),
    );
    try {
        const envResult = validateEnv();
        if (offerEnvSetup(envResult)) {
            try {
                await _handleSetupWizard();
            } catch (err) {
                rootLogger.debug('Setup wizard failed: ' + formatErr(err));
            }
        }
    } catch (err) {
        rootLogger.debug('Env setup failed: ' + formatErr(err));
    }
    sessionLog.info('Sessão iniciada');
}

function _getStateHint(): string {
    const lastChoice = loadState()['lastChoice'] as string | undefined;
    return lastChoice && lastChoice !== '0' ? 'Enter = ' + lastChoice : '0-9';
}

function _clearScreen(args: CliArgs): void {
    if (process.stdout.isTTY && !args.noClear && Config.get<boolean>('qaToolsNoClear') !== true) {
        process.stdout.write('\x1b[2J\x1b[H');
    }
}

async function _handleMissingToken(projectName: string): Promise<GitProvider | null> {
    warn('Token de acesso não encontrado.');
    if (!promptConfirm('Deseja configurar agora?')) {
        return null;
    }
    try {
        await _handleSetupWizard();
        return createManagerForProject(projectName, projectId);
    } catch (err) {
        rootLogger.error('Create manager for project failed after setup: ' + formatErr(err));
        // Contract sentinel: setup wizard failed -> no manager available (caller handles null).
        return null;
    }
}

async function _selectProjectAndCreateManager(): Promise<{
    projectName: string;
    names: string[];
    manager: GitProvider;
} | null> {
    const { projectName, names } = _selectProject();
    if (!projectName) return null;

    let m: GitProvider;
    try {
        m = createManagerForProject(projectName, projectId);
    } catch (e) {
        if ((e as Error).name === 'MissingTokenError') {
            const result = await _handleMissingToken(projectName);
            if (!result) return null;
            m = result;
        } else {
            printError('Erro ao criar gerenciador do projeto', e);
            rootLogger.error('createManagerForProject failed', { projectName, error: String(e) });
            return null;
        }
    }
    setManager(m);
    return { projectName, names, manager: m };
}

/**
 * Initialize DataHub in background — fire-and-forget prefetch for all projects.
 * For current project, ensures DataHub is ready before menu loop.
 * In CI environments, blocks to guarantee fresh data.
 */
async function _initDataHubBackground(): Promise<void> {
    // Launch async prefetch for ALL projects — does not block menu
    prefetchAllProjects().catch((err: unknown) => {
        rootLogger.debug(`prefetchAllProjects background failed: ${String(err)}`);
    });

    // For current project: ensure DataHub is ready (uses cache if prefetch already completed)
    if (process.env['CI'] === 'true') {
        await ensureDataHubSync();
    } else {
        await ensureDataHub();
    }
}

/**
 * Compute health score from DataHub (must be called after DataHub init).
 */
function _computeHealthScore(): { score: number; grade: string } | undefined {
    try {
        const hub = getDataHub();
        const health = calculateHealthScore({ dataHub: hub });
        return { score: health.overall, grade: health.grade };
    } catch (err) {
        rootLogger.debug('Health score failed: ' + formatErr(err));
        return undefined;
    }
}

/**
 * Show splash screen with health score.
 */
async function _showSplashWithHealth(healthScore: { score: number; grade: string } | undefined): Promise<void> {
    try {
        await showSplash(
            undefined,
            isJiraConfigured() ? Config.get('jiraBaseUrl') : undefined,
            isJiraConfigured() ? Config.get('jiraPersonalToken') : undefined,
            Config.get('jiraMode'),
            healthScore,
        );
    } catch (err) {
        rootLogger.debug('Splash failed: ' + formatErr(err));
        defaultOutput.print('🔧 QA Tools  v1.0.0 — Gestão de Testes & Automação de CI/CD');
    }
}

/**
 * Runs the interactive mode — validates environment, shows splash, and enters menu loop.
 * @param args Parsed CLI arguments
 */
export async function runInteractiveMode(args: CliArgs): Promise<void> {
    _initInfrastructure();

    const hasProjects = await _ensureProjectsConfigured();
    if (!hasProjects) return;

    await _initEnvironment();

    const result = await _selectProjectAndCreateManager();
    if (!result) return;
    const { projectName, names, manager: m } = result;

    await _initDataHubBackground();

    // Compute health score AFTER DataHub is initialized
    const healthScore = _computeHealthScore();

    // Show splash AFTER health score is computed
    await _showSplashWithHealth(healthScore);

    clearBreadcrumbs();
    pushBreadcrumb('GIT');
    pushBreadcrumb(projectName);

    await displayRecentPipelines(m);

    const stateHint = _getStateHint();

    for (;;) {
        _clearScreen(args);
        const finalChoice = await _promptChoice(stateHint);
        updateState((s: StateContainer) => {
            s['lastChoice'] = finalChoice;
        });
        try {
            const shouldExit = await _dispatchAction(finalChoice, m, projectName, names);
            if (shouldExit) return;
        } catch (e) {
            const errObj = e && 'name' in (e as never) ? (e as { name?: string }) : undefined;
            if (errObj?.name === 'CancelError') continue;
            printError('Erro na operação', e);
            rootLogger.error('Handler error', { error: String(e) });
            continue;
        }
    }
}

/**
 * Exports for testing and external access.
 */
export const _testExports = {
    _initInfrastructure,
    _ensureProjectsConfigured,
    _initEnvironment,
    _selectProjectAndCreateManager,
    _selectProject,
    _promptChoice,
    withErrorHandling,
    _handleExit,
    _dispatchAction,
    ACTION_HANDLERS,
    buildContextLine,
    handleHelp,
    handleShowHistory,
    nivelarBranchesWrapper,
    isComplete,
    providerLabel,
    buildActionChoices,
    getProviderForProject,
    _jiraEnv,
    _resolveGlob,
    pushHistory,
    pollPipeline,
    handleListSchedules,
    handleRunSchedule,
    handleCreateMR,
    handleListApprovedMRs,
    handleMergeMR,
    handleExportVariables,
    handleChangeProject,
    handleTriggerPipeline,
    parseTestResults,
    downloadTestArtifacts,
    createTestExecution,
    collectTestResults,
    printSessionSummary,
    displayProjects,
    displayRecentPipelines,
    handleSetupWizard: _handleSetupWizard,
    tryBatchMode,
    _loadProjectRunsHelper,
    _generateAndOpenDashboard,
    handleBugReportFlow,
    handleAiPrDescription,
    handleRunComparison,
    _showDashboardMenu,
    _dashboardReleaseScore,
    _dashboardQualityGate,
    _dashboardBacklogHealth,
    _dashboardPipelineCost,
    _dashboardDefectTrends,
    _dashboardSeasonality,
    _dashboardDeveloperProfile,
    _dashboardIncidentReport,
    _dashboardImpactAlert,
    _dashboardCoverageGap,
    _showDataHubSummary,
};
