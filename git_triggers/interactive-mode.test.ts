import os from 'os';
import path from 'path';
vi.mock('../shared/breadcrumbs', () => ({ pushBreadcrumb: vi.fn(), clearBreadcrumbs: vi.fn() }));
vi.mock('../shared/cli_base', () => ({
    createValidateEnv: vi.fn(() => vi.fn()),
    offerEnvSetup: vi.fn(() => false),
    setupSigint: vi.fn(),
    mask: vi.fn((v: string) => v),
    sanitizeUrl: vi.fn((url: string) => url),
}));
vi.mock('../shared/config', () => ({ default: { get: vi.fn(() => '') }, __esModule: true }));
vi.mock('../shared/splash', () => ({ showSplash: vi.fn() }));
vi.mock('../shared/metrics', () => ({
    loadMetrics: vi.fn(() => ({ runs: [] })),
    calculateFlakiness: vi.fn(() => []),
}));
vi.mock('../shared/run-comparison', () => ({ compareRuns: vi.fn(() => '') }));
vi.mock('../shared/health-score', () => ({
    calculateHealthScore: vi.fn(() => ({
        overall: 50,
        grade: 'C',
        dimensions: { passRate: { score: 80 }, flakyRate: { score: 90 }, coverage: { score: 70 } },
    })),
}));
vi.mock('../shared/palette', () => ({
    palette: { muted: vi.fn((s: string) => s), green: vi.fn((s: string) => s), red: vi.fn((s: string) => s) },
}));
vi.mock('../shared/output', () => ({ defaultOutput: { box: vi.fn() } }));
vi.mock('../shared/logger', () => ({
    rootLogger: {
        error: vi.fn(),
        warn: vi.fn(),
        info: vi.fn(),
        debug: vi.fn(),
        filePath: path.join(os.tmpdir(), 'qa-test.log'),
        child: vi.fn(() => ({ info: vi.fn(), debug: vi.fn(), error: vi.fn() })),
        writeFileOnly: vi.fn(),
    },
}));
vi.mock('../shared/prompt', () => {
    class CancelError extends Error {
        constructor(msg?: string) {
            super(msg);
            this.name = 'CancelError';
        }
    }
    return {
        CancelError,
        success: vi.fn(),
        warn: vi.fn(),
        info: vi.fn(),
        title: vi.fn(),
        prompt: vi.fn(() => 'test'),
        showSelect: vi.fn(() => 'test'),
        printError: vi.fn(),
        confirm: vi.fn(() => true),
        print: vi.fn(),
        divider: vi.fn(),
    };
});
vi.mock('../shared/state', () => ({ load: vi.fn(() => ({})), update: vi.fn() }));
const mockSessionState = {
    currentProjectName: '',
    currentProvider: 'gitlab',
};
vi.mock('./session-state', () => ({
    sessionLog: { info: vi.fn(), error: vi.fn() },
    sessionContext: { sessionCounters: [], buildContextLine: vi.fn(() => 'ctx') },
    isBusy: vi.fn(() => false),
    providerLabel: vi.fn(() => 'GITLAB'),
    buildActionChoices: vi.fn(() => [{ name: 'Option 1', value: '1' }]),
    displayProjects: vi.fn(),
    displayRecentPipelines: vi.fn(),
    printSessionSummary: vi.fn(),
    getProviderForProject: vi.fn(() => 'gitlab'),
    getProjects: vi.fn(() => ({})),
    pushHistory: vi.fn(),
    setCurrentProjectName: vi.fn(),
    setProjectId: vi.fn(),
    setManager: vi.fn(),
    getCiDataHub: vi.fn(() => undefined),
    getDataHub: vi.fn(() => undefined),
    setDataHub: vi.fn(),
    ensureCiDataHub: vi.fn(() => undefined),
    get currentProjectName() {
        return mockSessionState.currentProjectName;
    },
    get currentProvider() {
        return mockSessionState.currentProvider;
    },
    projectId: '',
}));
vi.mock('../shared/temp-dir', () => ({
    ensureDirs: vi.fn(),
    registerCleanup: vi.fn(),
    writeReport: vi.fn(() => path.join(os.tmpdir(), 'qa-test-report.html')),
}));
vi.mock('./ai-pr-desc', () => ({ generatePrDescription: vi.fn() }));
vi.mock('../shared/bug-report', () => ({ interactiveBugReportFlow: vi.fn() }));
vi.mock('../shared/jira-client', () => ({ default: vi.fn() }));
vi.mock('../jira_management/jira_link_manager', () => ({ default: vi.fn() }));
vi.mock('./pipeline-handler', () => ({
    handleTriggerPipeline: vi.fn(),
    handleExportVariables: vi.fn(),
    isComplete: vi.fn(() => true),
    pollPipeline: vi.fn(),
    _jiraEnv: vi.fn(() => ({})),
    _resolveGlob: vi.fn(() => []),
    downloadTestArtifacts: vi.fn(),
    parseTestResults: vi.fn(),
    createTestExecution: vi.fn(),
    collectTestResults: vi.fn(),
}));
vi.mock('./mr-handler', () => ({
    nivelarBranchesWrapper: vi.fn(),
    handleCreateMR: vi.fn(),
    handleListApprovedMRs: vi.fn(),
    handleMergeMR: vi.fn(),
}));
vi.mock('./schedule-handler', () => ({
    handleListSchedules: vi.fn(),
    handleRunSchedule: vi.fn(),
    handleChangeProject: vi.fn(),
    handleFlakinessDashboard: vi.fn(),
    generateWeeklyQualityReport: vi.fn(),
}));
vi.mock('./batch-mode', () => ({ tryBatchMode: vi.fn(), handlePipelineHealth: vi.fn() }));
vi.mock('../shared/release-score', () => ({
    generateReleaseScoreHtml: vi.fn(() => ''),
    calculateReleaseScore: vi.fn(() => ({})),
}));
vi.mock('../shared/defect-trend', () => ({
    generateDefectTrendHtml: vi.fn(() => ''),
    aggregateDefectTrends: vi.fn(() => ({ trends: [] })),
}));
vi.mock('../shared/traceability-matrix', () => ({
    generateTraceabilityHtml: vi.fn(() => ''),
    buildTraceabilityMatrix: vi.fn(() => ({ nodes: [] })),
}));
vi.mock('../shared/ai-effectiveness', () => ({
    generateAiEffectivenessHtml: vi.fn(() => ''),
    computeAiEffectiveness: vi.fn(() => ({})),
}));
vi.mock('../shared/defect-seasonality', () => ({
    generateSeasonalityHtml: vi.fn(() => ''),
    aggregateDefectSeasonality: vi.fn(() => ({ peakDay: '' })),
}));
vi.mock('../shared/silent-regression', () => ({
    generateSilentRegressionHtml: vi.fn(() => ''),
    detectSilentRegression: vi.fn(() => ({ regressions: [] })),
}));
vi.mock('../shared/ai-comparison', () => ({
    generateAiComparisonHtml: vi.fn(() => ''),
    compareAiVsManual: vi.fn(() => []),
}));
vi.mock('../shared/cross-squad-benchmark', () => ({
    generateBenchmarkHtml: vi.fn(() => ''),
    computeCrossSquadBenchmark: vi.fn(() => ({})),
}));
vi.mock('../shared/developer-profile', () => ({
    generateDeveloperProfileHtml: vi.fn(() => ''),
    buildDeveloperProfile: vi.fn(() => []),
}));
vi.mock('../shared/suite-optimization', () => ({
    generateOptimizationHtml: vi.fn(() => ''),
    analyzeSuiteOptimization: vi.fn(() => ({})),
}));
vi.mock('../shared/backlog-health', () => ({
    generateBacklogHealthHtml: vi.fn(() => ''),
    analyzeBacklogHealth: vi.fn(() => ({})),
}));
vi.mock('../shared/incident-report', () => ({
    generateIncidentReportHtml: vi.fn(() => ''),
    buildIncidentReport: vi.fn(() => ({
        events: [],
        eventCount: 0,
        highCount: 0,
        mediumCount: 0,
        lowCount: 0,
        summary: '',
        overallSeverity: 'none' as const,
        timestamp: new Date().toISOString(),
    })),
}));
vi.mock('../shared/pipeline-cost', () => ({
    generatePipelineCostHtml: vi.fn(() => ''),
    calculatePipelineCost: vi.fn(() => ({})),
}));
vi.mock('../shared/impact-alert', () => ({
    generateImpactAlertHtml: vi.fn(() => ''),
    analyzePipelineImpact: vi.fn(() => ({})),
}));
vi.mock('../shared/requirement-score', () => ({
    generateRequirementScoreHtml: vi.fn(() => ''),
    calculateRequirementScores: vi.fn(() => []),
}));
vi.mock('../shared/quality-gate', () => ({
    runQualityGate: vi.fn(() => ({ passed: true })),
    formatQualityGateText: vi.fn(() => ''),
}));
vi.mock('../shared/open', () => ({ openWithFallback: vi.fn() }));
vi.mock('../shared/generate-coverage-gap-html', () => ({ generateCoverageGapHtml: vi.fn(() => '') }));
vi.mock('../shared/coverage-gap', () => ({ analyzeCoverageGaps: vi.fn(() => []) }));
vi.mock('../shared/git-metrics-adapter', () => ({
    generateGitMetricsRuns: vi.fn(() => []),
    generateGitFailureClassifications: vi.fn(() => []),
    getLastGitLogError: vi.fn(() => undefined),
    clearGitLogError: vi.fn(),
}));
vi.mock('./ui-helpers', () => ({ handleHelp: vi.fn(), handleShowHistory: vi.fn() }));
vi.mock('./case00-handler', () => ({ handleSetupWizard: vi.fn() }));
vi.mock('../shared/show-docs', () => ({ showDocs: vi.fn() }));
vi.mock('../shared/dashboard-menu', () => ({ showDashboardMenu: vi.fn() }));
vi.mock('../shared/flakiness-dashboard', () => ({ generateFlakinessHtml: vi.fn(() => '') }));

import { _testExports } from './interactive-mode.js';
import { warn, printError } from '../shared/prompt.js';
import { setupSigint } from '../shared/cli_base.js';
import { load } from '../shared/state.js';
import { ensureDirs, registerCleanup } from '../shared/temp-dir.js';
import { openWithFallback } from '../shared/open.js';
import { showDashboardMenu } from '../shared/dashboard-menu.js';

const mockWarn = vi.mocked(warn);
const mockPrintError = vi.mocked(printError);
const mockLoad = vi.mocked(load);
const mockOpenWithFallback = vi.mocked(openWithFallback);
const mockSetupSigint = vi.mocked(setupSigint);
const mockShowDashboardMenu = vi.mocked(showDashboardMenu);

describe('Interactive-mode test exports', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('BuildContextLine', () => {
        it('returns a formatted context line', () => {
            const line = _testExports.buildContextLine();

            expect(typeof line).toBe('string');
        });
    });

    describe('WithErrorHandling', () => {
        it('wraps handler and returns false on success', async () => {
            expect.hasAssertions();

            const handler = vi.fn().mockResolvedValue('ok');
            const wrapped = _testExports.withErrorHandling(handler);
            const result = await wrapped({} as never, 'proj', []);

            expect(result).toBeFalsy();
            expect(handler).toHaveBeenCalledWith({}, 'proj', []);
        });

        it('wraps handler and returns false on error', async () => {
            expect.hasAssertions();

            const handler = vi.fn().mockRejectedValue(new Error('fail'));
            const wrapped = _testExports.withErrorHandling(handler);
            const result = await wrapped({} as never, 'proj', []);

            expect(result).toBeFalsy();
            expect(mockPrintError).toHaveBeenCalledWith('Handler error', expect.any(Error));
        });
    });

    describe('HandleHelp', () => {
        it('calls ui-helpers handleHelp', async () => {
            expect.hasAssertions();

            await _testExports.handleHelp();
            const uiHelpers = await import('./ui-helpers.js');

            expect(uiHelpers.handleHelp).toHaveBeenCalledWith();
        });
    });

    describe('HandleShowHistory', () => {
        it('calls ui-helpers handleShowHistory', async () => {
            expect.hasAssertions();

            await _testExports.handleShowHistory();
            const uiHelpers = await import('./ui-helpers.js');

            expect(uiHelpers.handleShowHistory).toHaveBeenCalledWith();
        });
    });

    describe('SelectProject', () => {
        it('returns null project when prompt returns invalid index', () => {
            mockLoad.mockReturnValue({ lastProject: '' });
            const result = _testExports._selectProject();

            expect(result.projectName).toBeNull();
        });
    });

    describe('HandleExit', () => {
        it('returns true', () => {
            const result = _testExports._handleExit();

            expect(result).toBeTruthy();
        });
    });

    describe('DispatchAction', () => {
        it('handles /help command', async () => {
            expect.hasAssertions();

            const result = await _testExports._dispatchAction('/help', {} as never, 'proj', []);

            expect(result).toBeFalsy();
        });

        it('handles /history command', async () => {
            expect.hasAssertions();

            const result = await _testExports._dispatchAction('/history', {} as never, 'proj', []);

            expect(result).toBeFalsy();
        });

        it('handles /docs command', async () => {
            expect.hasAssertions();

            const result = await _testExports._dispatchAction('/docs', {} as never, 'proj', []);

            expect(result).toBeFalsy();
        });

        it('handles /back command', async () => {
            expect.hasAssertions();

            const result = await _testExports._dispatchAction('/back', {} as never, 'proj', []);

            expect(result).toBeFalsy();
        });

        it('handles exit command 0', async () => {
            expect.hasAssertions();

            const result = await _testExports._dispatchAction('0', {} as never, 'proj', []);

            expect(result).toBeTruthy();
        });

        it('handles /exit command', async () => {
            expect.hasAssertions();

            const result = await _testExports._dispatchAction('/exit', {} as never, 'proj', []);

            expect(result).toBeTruthy();
        });

        it('warns on invalid option', async () => {
            expect.hasAssertions();

            const result = await _testExports._dispatchAction('99', {} as never, 'proj', []);

            expect(result).toBeFalsy();
            expect(mockWarn).toHaveBeenCalledWith('Opção inválida.');
        });
    });

    describe('InitInfrastructure', () => {
        it('calls ensureDirs and registerCleanup', () => {
            expect.hasAssertions();

            _testExports._initInfrastructure();

            expect(ensureDirs).toHaveBeenCalledWith();
            expect(registerCleanup).toHaveBeenCalledWith();
        });
    });

    describe('EnsureProjectsConfigured', () => {
        it('returns true when projects exist', async () => {
            expect.hasAssertions();

            const sessionState = await import('./session-state.js');
            (sessionState.getProjects as ReturnType<typeof vi.fn>).mockReturnValue({ proj1: '1' });
            const result = await _testExports._ensureProjectsConfigured();

            expect(result).toBeTruthy();
        });

        it('warns when no projects configured', async () => {
            expect.hasAssertions();

            const sessionState = await import('./session-state.js');
            (sessionState.getProjects as ReturnType<typeof vi.fn>).mockReturnValue({});
            const result = await _testExports._ensureProjectsConfigured();

            expect(result).toBeFalsy();
        });
    });

    describe('ACTION_HANDLERS', () => {
        it('is a non-empty record', () => {
            expect(typeof _testExports.ACTION_HANDLERS).toBe('object');
            expect(Object.keys(_testExports.ACTION_HANDLERS).length).toBeGreaterThan(0);
        });
    });

    describe('InitEnvironment', () => {
        it('completes successfully with valid env', async () => {
            expect.hasAssertions();

            await _testExports._initEnvironment();

            expect(mockSetupSigint).toHaveBeenCalledWith(expect.any(Function), expect.any(Function));
        });
    });

    describe('PromptChoice', () => {
        it('returns a choice string', async () => {
            expect.hasAssertions();

            const result = await _testExports._promptChoice('test');

            expect(typeof result).toBe('string');
        });
    });

    describe('SelectProjectAndCreateManager', () => {
        it('returns null when no projects exist', async () => {
            expect.hasAssertions();

            const sessionState = await import('./session-state.js');
            (sessionState.getProjects as ReturnType<typeof vi.fn>).mockReturnValue({});
            mockSessionState.currentProjectName = '';
            const result = await _testExports._selectProjectAndCreateManager();

            expect(result).toBeNull();
        });
    });

    describe('LoadProjectRunsHelper', () => {
        it('returns null when no project selected', () => {
            mockSessionState.currentProjectName = '';
            const result = _testExports._loadProjectRunsHelper();

            expect(result).toBeNull();
            expect(mockWarn).toHaveBeenCalledWith('Nenhum projeto selecionado.');
        });

        it('returns data when project has runs', async () => {
            expect.hasAssertions();

            mockSessionState.currentProjectName = 'proj1';
            const metricsMod = await import('../shared/metrics.js');
            (metricsMod.loadMetrics as ReturnType<typeof vi.fn>).mockReturnValue({
                runs: [
                    {
                        project: 'proj1',
                        timestamp: '2024-01-01',
                        total: 1,
                        passed: 1,
                        failed: 0,
                        skipped: 0,
                        duration: 10,
                        tests: [],
                    },
                    {
                        project: 'proj1',
                        timestamp: '2024-01-02',
                        total: 1,
                        passed: 1,
                        failed: 0,
                        skipped: 0,
                        duration: 10,
                        tests: [],
                    },
                ],
                failureClassifications: [],
            });
            const result = _testExports._loadProjectRunsHelper();

            expect(result && result.projectRuns.length).toBe(2);
        });

        it('returns null when git fallback has <2 runs', async () => {
            expect.hasAssertions();

            mockSessionState.currentProjectName = 'proj1';
            const metricsMod = await import('../shared/metrics.js');
            (metricsMod.loadMetrics as ReturnType<typeof vi.fn>).mockReturnValue({
                runs: [
                    {
                        project: 'proj1',
                        timestamp: '',
                        total: 0,
                        passed: 0,
                        failed: 0,
                        skipped: 0,
                        duration: 0,
                        tests: [],
                    },
                ],
                failureClassifications: [],
            });
            const result = _testExports._loadProjectRunsHelper();

            expect(result).toBeNull();
            expect(mockWarn).toHaveBeenCalledWith('Menos de 2 execuções registradas. Execute pipelines primeiro.');
        });

        it('uses git fallback when metrics has <2 runs but git has >=2', async () => {
            expect.hasAssertions();

            mockSessionState.currentProjectName = 'proj1';
            const metricsMod = await import('../shared/metrics.js');
            (metricsMod.loadMetrics as ReturnType<typeof vi.fn>).mockReturnValue({
                runs: [
                    {
                        project: 'proj1',
                        timestamp: '',
                        total: 0,
                        passed: 0,
                        failed: 0,
                        skipped: 0,
                        duration: 0,
                        tests: [],
                    },
                ],
                failureClassifications: [],
            });
            const gitMod = await import('../shared/git-metrics-adapter.js');
            (gitMod.generateGitMetricsRuns as ReturnType<typeof vi.fn>).mockReturnValue([
                {
                    project: 'proj1',
                    timestamp: '2024-01-01',
                    total: 1,
                    passed: 1,
                    failed: 0,
                    skipped: 0,
                    duration: 10,
                    tests: [],
                },
                {
                    project: 'proj1',
                    timestamp: '2024-01-02',
                    total: 1,
                    passed: 1,
                    failed: 0,
                    skipped: 0,
                    duration: 10,
                    tests: [],
                },
            ]);
            (gitMod.generateGitFailureClassifications as ReturnType<typeof vi.fn>).mockReturnValue([
                { testTitle: 't1', category: 'cat1', timestamp: '' },
            ]);
            const result = _testExports._loadProjectRunsHelper();

            expect(result && result.usingGitFallback).toBeTruthy();
        });
    });

    describe('GenerateAndOpenDashboard', () => {
        it('writes report and opens browser', async () => {
            expect.hasAssertions();

            mockSessionState.currentProjectName = 'proj1';
            await _testExports._generateAndOpenDashboard('<html>', 'test', 'Test');
            const openMod = await import('../shared/open.js');

            expect(openMod.openWithFallback as ReturnType<typeof vi.fn>).toHaveBeenCalledWith(
                expect.any(String),
                expect.any(String),
                expect.any(Function),
            );
        });
    });

    describe('HandleBugReportFlow', () => {
        it('warns when Jira not configured', async () => {
            expect.hasAssertions();

            const configMod = await import('../shared/config.js');
            (configMod.default.get as ReturnType<typeof vi.fn>).mockReturnValue('');
            const result = await _testExports.handleBugReportFlow({} as never);

            expect(result).toBeFalsy();
            expect(mockWarn).toHaveBeenCalledWith(
                'Jira não configurado. Configure JIRA_BASE_URL e JIRA_PERSONAL_TOKEN no .env',
            );
        });

        it('runs bug report flow when Jira configured', async () => {
            expect.hasAssertions();

            const configMod = await import('../shared/config.js');
            (configMod.default.get as ReturnType<typeof vi.fn>).mockReturnValue('configured');
            const result = await _testExports.handleBugReportFlow({} as never);

            expect(result).toBeFalsy();
        });
    });

    describe('HandleAiPrDescription', () => {
        it('warns when source branch empty', async () => {
            expect.hasAssertions();

            const promptMod = await import('../shared/prompt.js');
            (promptMod.prompt as ReturnType<typeof vi.fn>).mockReturnValue('');
            const result = await _testExports.handleAiPrDescription({} as never);

            expect(result).toBeFalsy();
            expect(mockWarn).toHaveBeenCalledWith('Branch de origem obrigatória.');
        });

        it('handles AI PR description generation', async () => {
            expect.hasAssertions();

            const promptMod = await import('../shared/prompt.js');
            (promptMod.prompt as ReturnType<typeof vi.fn>).mockReturnValue('feature/my-branch');
            const aiMod = await import('./ai-pr-desc.js');
            (aiMod.generatePrDescription as ReturnType<typeof vi.fn>).mockResolvedValue('Generated PR description');
            const result = await _testExports.handleAiPrDescription({} as never);

            expect(result).toBeFalsy();
        });

        it('warns when AI PR description fails', async () => {
            expect.hasAssertions();

            const promptMod = await import('../shared/prompt.js');
            (promptMod.prompt as ReturnType<typeof vi.fn>).mockReturnValue('feature/my-branch');
            const aiMod = await import('./ai-pr-desc.js');
            (aiMod.generatePrDescription as ReturnType<typeof vi.fn>).mockResolvedValue('');
            const result = await _testExports.handleAiPrDescription({} as never);

            expect(result).toBeFalsy();
            expect(mockWarn).toHaveBeenCalledWith('Falha ao gerar descrição (diff vazio ou erro na IA).');
        });
    });

    describe('HandleRunComparison', () => {
        it('warns when no project selected', async () => {
            expect.hasAssertions();

            mockSessionState.currentProjectName = '';
            const result = await _testExports.handleRunComparison();

            expect(result).toBeFalsy();
            expect(mockWarn).toHaveBeenCalledWith('Nenhum projeto selecionado.');
        });

        it('compares when runs exist', async () => {
            expect.hasAssertions();

            mockSessionState.currentProjectName = 'proj1';
            const metricsMod = await import('../shared/metrics.js');
            (metricsMod.loadMetrics as ReturnType<typeof vi.fn>).mockReturnValue({
                runs: [
                    {
                        project: 'proj1',
                        timestamp: '2024-01-01',
                        total: 1,
                        passed: 1,
                        failed: 0,
                        skipped: 0,
                        duration: 10,
                        tests: [],
                    },
                    {
                        project: 'proj1',
                        timestamp: '2024-01-02',
                        total: 1,
                        passed: 1,
                        failed: 0,
                        skipped: 0,
                        duration: 10,
                        tests: [],
                    },
                ],
                failureClassifications: [],
            });
            const runCompMod = await import('../shared/run-comparison.js');
            (runCompMod.compareRuns as ReturnType<typeof vi.fn>).mockReturnValue('comparison');
            const result = await _testExports.handleRunComparison();

            expect(result).toBeFalsy();
        });

        it('warns when <2 runs exist', async () => {
            expect.hasAssertions();

            mockSessionState.currentProjectName = 'proj1';
            const metricsMod = await import('../shared/metrics.js');
            (metricsMod.loadMetrics as ReturnType<typeof vi.fn>).mockReturnValue({
                runs: [
                    {
                        project: 'proj1',
                        timestamp: '',
                        total: 0,
                        passed: 0,
                        failed: 0,
                        skipped: 0,
                        duration: 0,
                        tests: [],
                    },
                ],
                failureClassifications: [],
            });
            const result = await _testExports.handleRunComparison();

            expect(result).toBeFalsy();
            expect(mockWarn).toHaveBeenCalledWith('São necessárias pelo menos 2 execuções para comparar.');
        });
    });

    describe('ShowDashboardMenu', () => {
        it('shows dashboard menu', async () => {
            expect.hasAssertions();

            mockSessionState.currentProjectName = 'proj1';
            await _testExports._showDashboardMenu();

            expect(mockShowDashboardMenu).toHaveBeenCalledWith(expect.any(String), expect.any(Array));
        });
    });

    describe('HandlePipelineHealthWrapper', () => {
        it('calls handlePipelineHealth and returns false', async () => {
            expect.hasAssertions();

            const result = await _testExports.handlePipelineHealthWrapper({} as never);

            expect(result).toBeFalsy();
        });
    });

    describe('DashboardReleaseScore', () => {
        it('generates release score dashboard', async () => {
            expect.hasAssertions();

            mockSessionState.currentProjectName = 'proj1';
            const metricsMod = await import('../shared/metrics.js');
            (metricsMod.loadMetrics as ReturnType<typeof vi.fn>).mockReturnValue({
                runs: [
                    {
                        project: 'proj1',
                        timestamp: '2024-01-01',
                        total: 1,
                        passed: 1,
                        failed: 0,
                        skipped: 0,
                        duration: 10,
                        tests: [],
                    },
                    {
                        project: 'proj1',
                        timestamp: '2024-01-02',
                        total: 1,
                        passed: 1,
                        failed: 0,
                        skipped: 0,
                        duration: 10,
                        tests: [],
                    },
                ],
                failureClassifications: [],
            });
            await _testExports._dashboardReleaseScore();

            expect(mockOpenWithFallback).toHaveBeenCalledWith(
                expect.any(String),
                'Release Score',
                expect.any(Function),
            );
        });
    });

    describe('DashboardQualityGate', () => {
        it('warns when no project selected', async () => {
            expect.hasAssertions();

            mockSessionState.currentProjectName = '';
            await _testExports._dashboardQualityGate();

            expect(mockWarn).toHaveBeenCalledWith('Nenhum projeto selecionado.');
        });

        it('generates quality gate dashboard', async () => {
            expect.hasAssertions();

            mockSessionState.currentProjectName = 'proj1';
            await _testExports._dashboardQualityGate();

            expect(mockOpenWithFallback).toHaveBeenCalledWith(expect.any(String), 'Quality Gate', expect.any(Function));
        });
    });

    describe('DashboardBacklogHealth', () => {
        it('generates backlog health dashboard', async () => {
            expect.hasAssertions();

            await _testExports._dashboardBacklogHealth();

            expect(mockOpenWithFallback).toHaveBeenCalledWith(
                expect.any(String),
                'Backlog Health',
                expect.any(Function),
            );
        });
    });

    describe('DashboardRequirementScore', () => {
        it('generates requirement score dashboard', async () => {
            expect.hasAssertions();

            await _testExports._dashboardRequirementScore();

            expect(mockOpenWithFallback).toHaveBeenCalledWith(
                expect.any(String),
                'Requirement Score',
                expect.any(Function),
            );
        });
    });

    describe('DashboardPipelineCost', () => {
        it('generates pipeline cost dashboard', async () => {
            expect.hasAssertions();

            mockSessionState.currentProjectName = 'proj1';
            const metricsMod = await import('../shared/metrics.js');
            (metricsMod.loadMetrics as ReturnType<typeof vi.fn>).mockReturnValue({
                runs: [
                    {
                        project: 'proj1',
                        timestamp: '2024-01-01',
                        total: 1,
                        passed: 1,
                        failed: 0,
                        skipped: 0,
                        duration: 10,
                        tests: [],
                    },
                    {
                        project: 'proj1',
                        timestamp: '2024-01-02',
                        total: 1,
                        passed: 1,
                        failed: 0,
                        skipped: 0,
                        duration: 10,
                        tests: [],
                    },
                ],
                failureClassifications: [],
            });
            await _testExports._dashboardPipelineCost();

            expect(mockOpenWithFallback).toHaveBeenCalledWith(
                expect.any(String),
                'Pipeline Cost',
                expect.any(Function),
            );
        });
    });

    describe('DashboardAiEffectiveness', () => {
        it('generates AI effectiveness dashboard', async () => {
            expect.hasAssertions();

            await _testExports._dashboardAiEffectiveness();

            expect(mockOpenWithFallback).toHaveBeenCalledWith(
                expect.any(String),
                'AI Effectiveness',
                expect.any(Function),
            );
        });
    });

    describe('DashboardDefectTrends', () => {
        it('generates defect trends dashboard', async () => {
            expect.hasAssertions();

            mockSessionState.currentProjectName = 'proj1';
            const metricsMod = await import('../shared/metrics.js');
            (metricsMod.loadMetrics as ReturnType<typeof vi.fn>).mockReturnValue({
                runs: [
                    {
                        project: 'proj1',
                        timestamp: '',
                        total: 0,
                        passed: 0,
                        failed: 0,
                        skipped: 0,
                        duration: 0,
                        tests: [],
                    },
                    {
                        project: 'proj1',
                        timestamp: '',
                        total: 0,
                        passed: 0,
                        failed: 0,
                        skipped: 0,
                        duration: 0,
                        tests: [],
                    },
                ],
                failureClassifications: [],
            });
            await _testExports._dashboardDefectTrends();

            expect(mockOpenWithFallback).toHaveBeenCalledWith(
                expect.any(String),
                'Defect Trends',
                expect.any(Function),
            );
        });
    });

    describe('DashboardTraceabilityMatrix', () => {
        it('generates traceability matrix dashboard', async () => {
            expect.hasAssertions();

            mockSessionState.currentProjectName = 'proj1';
            const metricsMod = await import('../shared/metrics.js');
            (metricsMod.loadMetrics as ReturnType<typeof vi.fn>).mockReturnValue({
                runs: [
                    {
                        project: 'proj1',
                        timestamp: '',
                        total: 0,
                        passed: 0,
                        failed: 0,
                        skipped: 0,
                        duration: 0,
                        tests: [],
                    },
                    {
                        project: 'proj1',
                        timestamp: '',
                        total: 0,
                        passed: 0,
                        failed: 0,
                        skipped: 0,
                        duration: 0,
                        tests: [],
                    },
                ],
                failureClassifications: [],
            });
            await _testExports._dashboardTraceabilityMatrix();

            expect(mockOpenWithFallback).toHaveBeenCalledWith(
                expect.any(String),
                'Traceability Matrix',
                expect.any(Function),
            );
        });
    });

    describe('DashboardSeasonality', () => {
        it('generates seasonality dashboard', async () => {
            expect.hasAssertions();

            mockSessionState.currentProjectName = 'proj1';
            const metricsMod = await import('../shared/metrics.js');
            (metricsMod.loadMetrics as ReturnType<typeof vi.fn>).mockReturnValue({
                runs: [
                    {
                        project: 'proj1',
                        timestamp: '',
                        total: 0,
                        passed: 0,
                        failed: 0,
                        skipped: 0,
                        duration: 0,
                        tests: [],
                    },
                    {
                        project: 'proj1',
                        timestamp: '',
                        total: 0,
                        passed: 0,
                        failed: 0,
                        skipped: 0,
                        duration: 0,
                        tests: [],
                    },
                ],
                failureClassifications: [],
            });
            await _testExports._dashboardSeasonality();

            expect(mockOpenWithFallback).toHaveBeenCalledWith(
                expect.any(String),
                'Defect Seasonality',
                expect.any(Function),
            );
        });
    });

    describe('DashboardSilentRegression', () => {
        it('generates silent regression dashboard', async () => {
            expect.hasAssertions();

            mockSessionState.currentProjectName = 'proj1';
            const metricsMod = await import('../shared/metrics.js');
            (metricsMod.loadMetrics as ReturnType<typeof vi.fn>).mockReturnValue({
                runs: [
                    {
                        project: 'proj1',
                        timestamp: '',
                        total: 0,
                        passed: 0,
                        failed: 0,
                        skipped: 0,
                        duration: 0,
                        tests: [],
                    },
                    {
                        project: 'proj1',
                        timestamp: '',
                        total: 0,
                        passed: 0,
                        failed: 0,
                        skipped: 0,
                        duration: 0,
                        tests: [],
                    },
                ],
                failureClassifications: [],
            });
            await _testExports._dashboardSilentRegression();

            expect(mockOpenWithFallback).toHaveBeenCalledWith(
                expect.any(String),
                'Silent Regression',
                expect.any(Function),
            );
        });
    });

    describe('DashboardAiComparison', () => {
        it('generates AI comparison dashboard', async () => {
            expect.hasAssertions();

            await _testExports._dashboardAiComparison();

            expect(mockOpenWithFallback).toHaveBeenCalledWith(
                expect.any(String),
                'AI Test Comparison',
                expect.any(Function),
            );
        });
    });

    describe('DashboardBenchmark', () => {
        it('generates benchmark dashboard', async () => {
            expect.hasAssertions();

            mockSessionState.currentProjectName = 'proj1';
            const metricsMod = await import('../shared/metrics.js');
            (metricsMod.loadMetrics as ReturnType<typeof vi.fn>).mockReturnValue({
                runs: [
                    {
                        project: 'proj1',
                        timestamp: '',
                        total: 0,
                        passed: 0,
                        failed: 0,
                        skipped: 0,
                        duration: 0,
                        tests: [],
                    },
                    {
                        project: 'proj1',
                        timestamp: '',
                        total: 0,
                        passed: 0,
                        failed: 0,
                        skipped: 0,
                        duration: 0,
                        tests: [],
                    },
                ],
                failureClassifications: [],
            });
            await _testExports._dashboardBenchmark();

            expect(mockOpenWithFallback).toHaveBeenCalledWith(
                expect.any(String),
                'Cross-Squad Benchmark',
                expect.any(Function),
            );
        });
    });

    describe('DashboardDeveloperProfile', () => {
        it('generates developer profile dashboard', async () => {
            expect.hasAssertions();

            mockSessionState.currentProjectName = 'proj1';
            const metricsMod = await import('../shared/metrics.js');
            (metricsMod.loadMetrics as ReturnType<typeof vi.fn>).mockReturnValue({
                runs: [
                    {
                        project: 'proj1',
                        timestamp: '',
                        total: 0,
                        passed: 0,
                        failed: 0,
                        skipped: 0,
                        duration: 0,
                        tests: [],
                    },
                    {
                        project: 'proj1',
                        timestamp: '',
                        total: 0,
                        passed: 0,
                        failed: 0,
                        skipped: 0,
                        duration: 0,
                        tests: [],
                    },
                ],
                failureClassifications: [{ testTitle: 't1', category: 'cat1', timestamp: '' }],
            });
            await _testExports._dashboardDeveloperProfile();

            expect(mockOpenWithFallback).toHaveBeenCalledWith(
                expect.any(String),
                'Developer Profile',
                expect.any(Function),
            );
        });
    });

    describe('DashboardSuiteOptimization', () => {
        it('generates suite optimization dashboard', async () => {
            expect.hasAssertions();

            mockSessionState.currentProjectName = 'proj1';
            const metricsMod = await import('../shared/metrics.js');
            (metricsMod.loadMetrics as ReturnType<typeof vi.fn>).mockReturnValue({
                runs: [
                    {
                        project: 'proj1',
                        timestamp: '',
                        total: 0,
                        passed: 0,
                        failed: 0,
                        skipped: 0,
                        duration: 0,
                        tests: [],
                    },
                    {
                        project: 'proj1',
                        timestamp: '',
                        total: 0,
                        passed: 0,
                        failed: 0,
                        skipped: 0,
                        duration: 0,
                        tests: [],
                    },
                ],
                failureClassifications: [],
            });
            await _testExports._dashboardSuiteOptimization();

            expect(mockOpenWithFallback).toHaveBeenCalledWith(
                expect.any(String),
                'Suite Optimization',
                expect.any(Function),
            );
        });
    });

    describe('DashboardIncidentReport', () => {
        it('generates incident report dashboard', async () => {
            expect.hasAssertions();

            mockSessionState.currentProjectName = 'proj1';
            const metricsMod = await import('../shared/metrics.js');
            (metricsMod.loadMetrics as ReturnType<typeof vi.fn>).mockReturnValue({
                runs: [
                    {
                        project: 'proj1',
                        timestamp: '',
                        total: 0,
                        passed: 0,
                        failed: 0,
                        skipped: 0,
                        duration: 0,
                        tests: [],
                    },
                    {
                        project: 'proj1',
                        timestamp: '',
                        total: 0,
                        passed: 0,
                        failed: 0,
                        skipped: 0,
                        duration: 0,
                        tests: [],
                    },
                ],
                failureClassifications: [],
            });
            await _testExports._dashboardIncidentReport();

            expect(mockOpenWithFallback).toHaveBeenCalledWith(
                expect.any(String),
                'Incident Report',
                expect.any(Function),
            );
        });
    });

    describe('DashboardImpactAlert', () => {
        it('generates impact alert dashboard', async () => {
            expect.hasAssertions();

            mockSessionState.currentProjectName = 'proj1';
            const metricsMod = await import('../shared/metrics.js');
            (metricsMod.loadMetrics as ReturnType<typeof vi.fn>).mockReturnValue({
                runs: [
                    {
                        project: 'proj1',
                        timestamp: '',
                        total: 0,
                        passed: 0,
                        failed: 0,
                        skipped: 0,
                        duration: 0,
                        tests: [],
                    },
                    {
                        project: 'proj1',
                        timestamp: '',
                        total: 0,
                        passed: 0,
                        failed: 0,
                        skipped: 0,
                        duration: 0,
                        tests: [],
                    },
                ],
                failureClassifications: [],
            });
            await _testExports._dashboardImpactAlert();

            expect(mockOpenWithFallback).toHaveBeenCalledWith(
                expect.any(String),
                'Pipeline Impact Alert',
                expect.any(Function),
            );
        });
    });

    describe('DashboardCoverageGap', () => {
        it('warns when no project selected', async () => {
            expect.hasAssertions();

            mockSessionState.currentProjectName = '';
            await _testExports._dashboardCoverageGap();

            expect(mockWarn).toHaveBeenCalledWith('Nenhum projeto selecionado.');
        });

        it('generates coverage gap dashboard', async () => {
            expect.hasAssertions();

            mockSessionState.currentProjectName = 'proj1';
            const configMod = await import('../shared/config.js');
            (configMod.default.get as ReturnType<typeof vi.fn>).mockReturnValue('configured');
            await _testExports._dashboardCoverageGap();

            expect(mockOpenWithFallback).toHaveBeenCalledWith(expect.any(String), 'Coverage Gap', expect.any(Function));
        });
    });
});
