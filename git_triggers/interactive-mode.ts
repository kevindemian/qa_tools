/**
 * Interactive mode — handles the main menu loop and project selection.
 * Extracted from main.ts for single responsibility and testability.
 */
import { pushBreadcrumb, clearBreadcrumbs } from '../shared/breadcrumbs.js';
import { createValidateEnv, offerEnvSetup, setupSigint } from '../shared/cli_base.js';
import Config from '../shared/config.js';
import { showSplash } from '../shared/splash.js';
import { createDataHubPersistence } from '../shared/data-hub/persistence.js';
import { calcFlakinessEntries } from '../shared/data-hub/compute/flakiness-entries.js';
import type { MetricsRun } from '../shared/types/data-hub.js';
import { compareRuns } from '../shared/run-comparison.js';
import { calculateHealthScore } from '../shared/health-score.js';
import { palette } from '../shared/palette.js';
import { defaultOutput } from '../shared/output.js';
import { rootLogger } from '../shared/logger.js';
import {
    success,
    warn,
    info,
    title,
    prompt,
    showSelect,
    printError,
    confirm as promptConfirm,
} from '../shared/prompt.js';
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
    setCurrentProjectName,
    setProjectId,
    setManager,
    projectId,
    getProjects,
    clearProjectCache,
    currentProjectName,
    ensureDataHub,
    getDataHub,
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
import { ensureDirs, registerCleanup } from '../shared/temp-dir.js';
import {
    handleListSchedules,
    handleRunSchedule,
    handleChangeProject,
    handleFlakinessDashboard,
    generateWeeklyQualityReport,
} from './schedule-handler.js';
import { tryBatchMode, handlePipelineHealth } from './batch-mode.js';
import { generatePrDescription } from './ai-pr-desc.js';
import { interactiveBugReportFlow } from '../shared/bug-report.js';
import JiraClient from '../shared/jira-client.js';
import JiraLinkManager from '../jira_management/jira_link_manager.js';

import { generateReleaseScoreHtml } from '../shared/release-score.js';
import { generateDefectTrendHtml } from '../shared/defect-trend.js';
import { generateTraceabilityHtml } from '../shared/traceability-matrix.js';
import { generateAiEffectivenessHtml } from '../shared/ai-effectiveness.js';
import { generateSeasonalityHtml } from '../shared/defect-seasonality.js';
import { generateSilentRegressionHtml } from '../shared/silent-regression.js';
import { generateAiComparisonHtml } from '../shared/ai-comparison.js';
import { generateBenchmarkHtml } from '../shared/cross-squad-benchmark.js';
import { generateDeveloperProfileHtml } from '../shared/developer-profile.js';
import { generateOptimizationHtml } from '../shared/suite-optimization.js';
import { generateBacklogHealthHtml } from '../shared/backlog-health.js';
import { generateIncidentReportHtml } from '../shared/incident-report.js';
import { generatePipelineCostHtml } from '../shared/pipeline-cost.js';
import { generateImpactAlertHtml } from '../shared/impact-alert.js';
import { generateRequirementScoreHtml } from '../shared/requirement-score.js';
import { calculateReleaseScore } from '../shared/release-score.js';
import { aggregateDefectTrends } from '../shared/defect-trend.js';
import { buildTraceabilityMatrix } from '../shared/traceability-matrix.js';
import { computeAiEffectiveness } from '../shared/ai-effectiveness.js';
import { aggregateDefectSeasonality } from '../shared/defect-seasonality.js';
import { detectSilentRegression } from '../shared/silent-regression.js';
import { compareAiVsManual } from '../shared/ai-comparison.js';
import { computeCrossSquadBenchmark } from '../shared/cross-squad-benchmark.js';
import { buildDeveloperProfile } from '../shared/developer-profile.js';
import { analyzeSuiteOptimization } from '../shared/suite-optimization.js';
import { analyzeBacklogHealth } from '../shared/backlog-health.js';
import { buildIncidentReport } from '../shared/incident-report.js';
import { analyzePipelineImpact } from '../shared/impact-alert.js';
import { calculatePipelineCost } from '../shared/pipeline-cost.js';
import { calculateRequirementScores } from '../shared/requirement-score.js';
import { writeReport } from '../shared/temp-dir.js';
import { runQualityGate, formatQualityGateText } from '../shared/quality-gate.js';
import { openWithFallback } from '../shared/open.js';
import { generateCoverageGapHtml } from '../shared/generate-coverage-gap-html.js';
import { analyzeCoverageGaps } from '../shared/coverage-gap.js';
import {
    generateGitMetricsRuns,
    generateGitFailureClassifications,
    getLastGitLogError,
} from '../shared/git-metrics-adapter.js';
import { handleHelp as _handleHelp, handleShowHistory as _handleShowHistory } from './ui-helpers.js';
import { handleSetupWizard as _handleSetupWizard } from './case00-handler.js';
import { handlePrReportReconfig } from './pr-report-setup-handler.js';
import { showDocs } from '../shared/show-docs.js';
import { showDashboardMenu } from '../shared/dashboard-menu.js';
import type { DashboardDef } from '../shared/dashboard-menu.js';
import type { CliArgs } from './cli-args.js';

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

function _getDataHub() {
    return getDataHub();
}

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
    setCurrentProjectName(projectName);
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
    const project = currentProjectName;
    if (!project) {
        warn('Nenhum projeto selecionado.');
        return false;
    }
    const persistence = createDataHubPersistence(project);
    const store = persistence.loadMetricsStore();
    const projectRuns = store.runs
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
 * Handler for pipeline health report — generates standalone pipeline health HTML.
 */
async function handlePipelineHealthWrapper(m: GitProvider): Promise<boolean> {
    await handlePipelineHealth(m);
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
 * Load project runs with git fallback — shared helper for dashboards.
 */
function _loadProjectRunsHelper(): {
    projectRuns: MetricsRun[];
    failureClassifications: import('../shared/metrics.js').FailureClassification[];
    usingGitFallback: boolean;
} | null {
    if (!currentProjectName) {
        warn('Nenhum projeto selecionado.');
        return null;
    }
    const persistence = createDataHubPersistence(currentProjectName);
    const store = persistence.loadMetricsStore();
    let projectRuns = store.runs.filter((r) => r.project === currentProjectName);
    let failureClassifications = store.failureClassifications ?? [];
    let usingGitFallback = false;
    if (projectRuns.length < 2) {
        const gitRuns = generateGitMetricsRuns({ projectName: currentProjectName });
        const gitError = getLastGitLogError();
        if (gitRuns.length >= 2) {
            projectRuns = gitRuns;
            failureClassifications = generateGitFailureClassifications({ projectName: currentProjectName });
            usingGitFallback = true;
        } else if (gitError) {
            warn('Não foi possível obter o git history. ' + gitError + ' Execute pipelines para gerar dados primeiro.');
            return null;
        } else {
            warn('Menos de 2 execuções registradas. Execute pipelines primeiro.');
            return null;
        }
    }
    return { projectRuns, failureClassifications, usingGitFallback };
}

async function _generateAndOpenDashboard(html: string, suffix: string, label: string): Promise<void> {
    const outPath = writeReport('dashboard-' + suffix + '-' + currentProjectName + '.html', html);
    await openWithFallback(outPath, label, info);
}

async function _dashboardReleaseScore(): Promise<void> {
    const data = _loadProjectRunsHelper();
    if (!data) return;
    const dataHub = _getDataHub();
    const health = calculateHealthScore(
        { runs: data.projectRuns, failureClassifications: data.failureClassifications },
        ...(dataHub ? [{ dataHub }] : []),
    );
    const flaky = calcFlakinessEntries(data.projectRuns, 2);
    const releaseScore = calculateReleaseScore(
        80,
        health.overall,
        health.overall >= 70 ? 'pass' : 'fail',
        70,
        flaky.length > 0
            ? Math.min(100, Math.round((flaky.filter((f) => f.rate > 0.3).length / flaky.length) * 100))
            : 0,
    );
    await _generateAndOpenDashboard(generateReleaseScoreHtml(releaseScore), 'release-score', 'Release Score');
}

async function _dashboardDefectTrends(): Promise<void> {
    const data = _loadProjectRunsHelper();
    if (!data) return;
    const defects = aggregateDefectTrends(data.failureClassifications);
    await _generateAndOpenDashboard(generateDefectTrendHtml(defects), 'defect-trends', 'Defect Trends');
}

async function _dashboardTraceabilityMatrix(): Promise<void> {
    const data = _loadProjectRunsHelper();
    if (!data) return;
    const dataHub = _getDataHub();
    const effectiveStore = { runs: data.projectRuns, failureClassifications: data.failureClassifications };
    const matrix = buildTraceabilityMatrix(effectiveStore, undefined, dataHub);
    await _generateAndOpenDashboard(generateTraceabilityHtml(matrix), 'traceability', 'Traceability Matrix');
}

async function _dashboardAiEffectiveness(): Promise<void> {
    const aiResult = computeAiEffectiveness({ records: [] });
    await _generateAndOpenDashboard(generateAiEffectivenessHtml(aiResult), 'ai-effectiveness', 'AI Effectiveness');
}

async function _dashboardSeasonality(): Promise<void> {
    const data = _loadProjectRunsHelper();
    if (!data) return;
    const seasonality = aggregateDefectSeasonality(data.failureClassifications);
    await _generateAndOpenDashboard(generateSeasonalityHtml(seasonality), 'seasonality', 'Defect Seasonality');
}

async function _dashboardSilentRegression(): Promise<void> {
    const data = _loadProjectRunsHelper();
    if (!data) return;
    const testDurationMap: Record<string, number[]> = {};
    for (const run of data.projectRuns) {
        for (const t of run.tests) {
            if (t.state === 'skipped') continue;
            if (!testDurationMap[t.title]) testDurationMap[t.title] = [];
            testDurationMap[t.title]?.push(t.duration);
        }
    }
    const regression = detectSilentRegression(testDurationMap);
    await _generateAndOpenDashboard(generateSilentRegressionHtml(regression), 'silent-regression', 'Silent Regression');
}

async function _dashboardAiComparison(): Promise<void> {
    const aiComparison = compareAiVsManual([]);
    await _generateAndOpenDashboard(generateAiComparisonHtml(aiComparison), 'ai-comparison', 'AI Test Comparison');
}

async function _dashboardBenchmark(): Promise<void> {
    const data = _loadProjectRunsHelper();
    if (!data) return;
    const dataHub = _getDataHub();
    const projectNames = [...new Set(data.projectRuns.map((r) => r.project))];
    const persistence = createDataHubPersistence(currentProjectName);
    const store = persistence.loadMetricsStore();
    const projectBenchmarks = projectNames.map((name) => {
        const pRuns = store.runs.filter((r) => r.project === name);
        const isCurrentProject = name === currentProjectName;
        const pHealth = calculateHealthScore(
            { runs: pRuns, failureClassifications: data.failureClassifications },
            ...(isCurrentProject && dataHub ? [{ dataHub }] : []),
        );
        return {
            name,
            healthScore: pHealth.overall,
            grade: pHealth.grade,
            passRate: pHealth.dimensions.passRate.score,
            flakyRate: pHealth.dimensions.flakyRate.score,
            coveragePct: pHealth.dimensions.coverage.score,
            runCount: pRuns.length,
        };
    });
    const benchmark = computeCrossSquadBenchmark(projectBenchmarks);
    await _generateAndOpenDashboard(generateBenchmarkHtml(benchmark), 'benchmark', 'Cross-Squad Benchmark');
}

async function _dashboardDeveloperProfile(): Promise<void> {
    const data = _loadProjectRunsHelper();
    if (!data) return;
    const devProfile = buildDeveloperProfile(
        data.failureClassifications.map((fc) => ({
            testTitle: fc.testTitle,
            category: fc.category,
            timestamp: fc.timestamp,
        })),
    );
    await _generateAndOpenDashboard(generateDeveloperProfileHtml(devProfile), 'developer-profile', 'Developer Profile');
}

async function _dashboardSuiteOptimization(): Promise<void> {
    const data = _loadProjectRunsHelper();
    if (!data) return;
    const flatTests = data.projectRuns.flatMap((r) =>
        r.tests.map((t) => ({ title: t.title, duration: t.duration, flakiness: 0 })),
    );
    const optimization = analyzeSuiteOptimization(flatTests);
    await _generateAndOpenDashboard(generateOptimizationHtml(optimization), 'suite-optimization', 'Suite Optimization');
}

async function _dashboardBacklogHealth(): Promise<void> {
    const backlog = analyzeBacklogHealth([]);
    await _generateAndOpenDashboard(generateBacklogHealthHtml(backlog), 'backlog-health', 'Backlog Health');
}

async function _dashboardIncidentReport(): Promise<void> {
    const data = _loadProjectRunsHelper();
    if (!data) return;
    const dataHub = _getDataHub();
    const health = calculateHealthScore(
        { runs: data.projectRuns, failureClassifications: data.failureClassifications },
        ...(dataHub ? [{ dataHub }] : []),
    );
    const matrix = buildTraceabilityMatrix(
        {
            runs: data.projectRuns,
            failureClassifications: data.failureClassifications,
        },
        undefined,
        dataHub,
    );
    const testDurationMap: Record<string, number[]> = {};
    for (const run of data.projectRuns) {
        for (const t of run.tests) {
            if (t.state === 'skipped') continue;
            if (!testDurationMap[t.title]) testDurationMap[t.title] = [];
            testDurationMap[t.title]?.push(t.duration);
        }
    }
    const regression = detectSilentRegression(testDurationMap);
    const seasonality = aggregateDefectSeasonality(data.failureClassifications);
    const failRate =
        data.projectRuns.length > 0
            ? Math.round((data.projectRuns.filter((r) => r.failed > 0).length / data.projectRuns.length) * 100)
            : 0;
    const uncoveredEpics = matrix.nodes.reduce((acc: string[], n) => {
        if (n.coverage < 100) acc.push(n.epic);
        return acc;
    }, []);
    const incidentReport = buildIncidentReport(
        failRate,
        regression.regressions.length,
        seasonality.peakDay,
        uncoveredEpics,
        health.overall,
    );
    await _generateAndOpenDashboard(generateIncidentReportHtml(incidentReport), 'incident-report', 'Incident Report');
}

async function _dashboardPipelineCost(): Promise<void> {
    const data = _loadProjectRunsHelper();
    if (!data) return;
    const dataHub = _getDataHub();
    const pipelineCost = calculatePipelineCost(data.projectRuns, undefined, dataHub);
    await _generateAndOpenDashboard(generatePipelineCostHtml(pipelineCost), 'pipeline-cost', 'Pipeline Cost');
}

async function _dashboardImpactAlert(): Promise<void> {
    const data = _loadProjectRunsHelper();
    if (!data) return;
    const dataHub = _getDataHub();
    const health = calculateHealthScore(
        { runs: data.projectRuns, failureClassifications: data.failureClassifications },
        ...(dataHub ? [{ dataHub }] : []),
    );
    const defects = aggregateDefectTrends(data.failureClassifications);
    const matrix = buildTraceabilityMatrix(
        {
            runs: data.projectRuns,
            failureClassifications: data.failureClassifications,
        },
        undefined,
        dataHub,
    );
    const uncoveredEpics = matrix.nodes.reduce((acc: string[], n) => {
        if (n.coverage < 100) acc.push(n.epic);
        return acc;
    }, []);
    const trendCategories = new Set<string>();
    for (const t of defects.trends) {
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
    );
    await _generateAndOpenDashboard(generateImpactAlertHtml(impactAlert), 'impact-alert', 'Pipeline Impact Alert');
}

async function _dashboardRequirementScore(): Promise<void> {
    const requirementScores = calculateRequirementScores([]);
    await _generateAndOpenDashboard(
        generateRequirementScoreHtml(requirementScores),
        'requirement-score',
        'Requirement Score',
    );
}

async function _dashboardQualityGate(): Promise<void> {
    if (!currentProjectName) {
        warn('Nenhum projeto selecionado.');
        return;
    }
    const dataHub = _getDataHub();
    const qualityGate = runQualityGate({ project: currentProjectName, ...(dataHub ? { dataHub } : {}) });
    const html = '<html><body><h1>Quality Gate</h1><pre>' + formatQualityGateText(qualityGate) + '</pre></body></html>';
    await _generateAndOpenDashboard(html, 'quality-gate', 'Quality Gate');
}

async function _dashboardCoverageGap(): Promise<void> {
    if (!currentProjectName) {
        warn('Nenhum projeto selecionado.');
        return;
    }
    if (!Config.get('jiraBaseUrl') || !Config.get('jiraPersonalToken')) {
        warn('Jira não configurado. Coverage Gap requer JIRA_BASE_URL e JIRA_PERSONAL_TOKEN.');
        return;
    }
    const projectKey = Config.get('jiraProject');
    if (!projectKey) {
        warn('JIRA_PROJECT não configurado.');
        return;
    }
    const jiraResource = new JiraClient(
        Config.get('jiraPersonalToken'),
        Config.get('jiraBaseUrl') + '/rest/api/2',
        Config.get('jiraMode'),
    );
    const result = await analyzeCoverageGaps(jiraResource, projectKey);
    await _generateAndOpenDashboard(
        generateCoverageGapHtml(result, 'Coverage Gap — ' + currentProjectName),
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
        const hub = getDataHub();

        if (!hub || hub.raw.runs.length === 0) {
            warn('Nenhum dado de pipeline encontrado para este repositório.');
            return;
        }

        const lines = [
            '',
            '  === CI Data Hub — ' + currentProjectName + ' ===',
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

        info(lines.join('\n'));
    } catch (err) {
        printError('CI Data Hub error', err);
    }
}

async function _showDashboardMenu(): Promise<void> {
    const dashboards: DashboardDef[] = [
        { id: '1', label: 'Release Score', handler: _dashboardReleaseScore },
        { id: '2', label: 'Defect Trends', handler: _dashboardDefectTrends },
        { id: '3', label: 'Traceability Matrix', handler: _dashboardTraceabilityMatrix },
        { id: '4', label: 'AI Effectiveness', handler: _dashboardAiEffectiveness },
        { id: '5', label: 'Defect Seasonality', handler: _dashboardSeasonality },
        { id: '6', label: 'Silent Regression', handler: _dashboardSilentRegression },
        { id: '7', label: 'AI Test Comparison', handler: _dashboardAiComparison },
        { id: '8', label: 'Cross-Squad Benchmark', handler: _dashboardBenchmark },
        { id: '9', label: 'Developer Profile', handler: _dashboardDeveloperProfile },
        { id: '10', label: 'Suite Optimization', handler: _dashboardSuiteOptimization },
        { id: '11', label: 'Backlog Health', handler: _dashboardBacklogHealth },
        { id: '12', label: 'Incident Report', handler: _dashboardIncidentReport },
        { id: '13', label: 'Pipeline Cost', handler: _dashboardPipelineCost },
        { id: '14', label: 'Pipeline Impact Alert', handler: _dashboardImpactAlert },
        { id: '15', label: 'Requirement Score', handler: _dashboardRequirementScore },
        { id: '16', label: 'Quality Gate', handler: _dashboardQualityGate },
        { id: '17', label: 'Coverage Gap', handler: _dashboardCoverageGap },
    ];
    await showDashboardMenu(currentProjectName, dashboards);
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
    a: () => {
        void handleFlakinessDashboard().catch((err: unknown) => printError('Dashboard error', err));
        return Promise.resolve(false);
    },
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
    e: () => {
        info(
            'Git Metrics Adapter — gera métricas de pipeline a partir do git history como fallback.\n' +
                'Funções: generateGitMetricsRuns() e generateGitFailureClassifications().\n' +
                'Usado automaticamente quando não há dados de pipeline (menos de 2 execuções).',
        );
        return Promise.resolve(false);
    },
    f: () => {
        handlePrReportReconfig();
        return Promise.resolve(false);
    },
    g: withErrorHandling((m) => handleBugReportFlow(m)),
    i: withErrorHandling((m) => handleAiPrDescription(m)),
    p: withErrorHandling((m) => handlePipelineHealthWrapper(m)),
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
                clearProjectCache();
                projs = getProjects();
            }
        } catch (err) {
            rootLogger.debug('Project setup cancelled: ' + _getErrorMessage(err));
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
                rootLogger.debug('Setup wizard failed: ' + _getErrorMessage(err));
            }
        }
    } catch (err) {
        rootLogger.debug('Env setup failed: ' + _getErrorMessage(err));
    }
    let healthScore: { score: number; grade: string } | undefined;
    try {
        const persistence = createDataHubPersistence(currentProjectName);
        const store = persistence.loadMetricsStore();
        const _hub = _getDataHub();
        const health = calculateHealthScore(store, _hub ? { dataHub: _hub } : undefined);
        healthScore = { score: health.overall, grade: health.grade };
    } catch (err) {
        rootLogger.debug('Health score failed: ' + _getErrorMessage(err));
    }
    try {
        await showSplash(undefined, undefined, undefined, undefined, healthScore);
    } catch (err) {
        rootLogger.debug('Splash failed: ' + _getErrorMessage(err));
        defaultOutput.print('🔧 QA Tools  v1.0.0 — Gestão de Testes & Automação de CI/CD');
    }
    sessionLog.info('Sessão iniciada');
}

function _hasMessage(err: unknown): err is { message: string } {
    return err !== null && err !== undefined && 'message' in (err as never);
}

function _getErrorMessage(err: unknown): string {
    if (_hasMessage(err)) {
        return err.message;
    }
    return String(err);
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
        clearProjectCache();
        return createManagerForProject(projectName, projectId);
    } catch (err) {
        rootLogger.debug('Create manager for project failed: ' + _getErrorMessage(err));
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
    handleFlakinessDashboard,
    handleSetupWizard: _handleSetupWizard,
    tryBatchMode,
    _loadProjectRunsHelper,
    _generateAndOpenDashboard,
    handleBugReportFlow,
    handleAiPrDescription,
    handleRunComparison,
    _showDashboardMenu,
    handlePipelineHealthWrapper,
    _dashboardReleaseScore,
    _dashboardQualityGate,
    _dashboardBacklogHealth,
    _dashboardRequirementScore,
    _dashboardPipelineCost,
    _dashboardAiEffectiveness,
    _dashboardDefectTrends,
    _dashboardTraceabilityMatrix,
    _dashboardSeasonality,
    _dashboardSilentRegression,
    _dashboardAiComparison,
    _dashboardBenchmark,
    _dashboardDeveloperProfile,
    _dashboardSuiteOptimization,
    _dashboardIncidentReport,
    _dashboardImpactAlert,
    _dashboardCoverageGap,
    _showDataHubSummary,
};
