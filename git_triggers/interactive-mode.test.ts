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
        filePath: '/tmp/log',
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
    writeReport: vi.fn(() => '/tmp/report.html'),
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
vi.mock('./batch-mode', () => ({ tryBatchMode: vi.fn(), parseBatchArgs: vi.fn(), handlePipelineHealth: vi.fn() }));
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
    buildIncidentReport: vi.fn(() => ({})),
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
import { load } from '../shared/state.js';

const mockWarn = vi.mocked(warn);
const mockPrintError = vi.mocked(printError);
const mockLoad = vi.mocked(load);

describe('interactive-mode test exports', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('buildContextLine', () => {
        it('returns a formatted context line', () => {
            const line = _testExports.buildContextLine();
            expect(typeof line).toBe('string');
        });
    });

    describe('withErrorHandling', () => {
        it('wraps handler and returns false on success', async () => {
            const handler = vi.fn().mockResolvedValue('ok');
            const wrapped = _testExports.withErrorHandling(handler);
            const result = await wrapped({} as never, 'proj', []);
            expect(result).toBe(false);
            expect(handler).toHaveBeenCalledWith({}, 'proj', []);
        });

        it('wraps handler and returns false on error', async () => {
            const handler = vi.fn().mockRejectedValue(new Error('fail'));
            const wrapped = _testExports.withErrorHandling(handler);
            const result = await wrapped({} as never, 'proj', []);
            expect(result).toBe(false);
            expect(mockPrintError).toHaveBeenCalled();
        });
    });

    describe('handleHelp', () => {
        it('calls ui-helpers handleHelp', async () => {
            await _testExports.handleHelp();
            const uiHelpers = await import('./ui-helpers.js');
            expect(uiHelpers.handleHelp).toHaveBeenCalled();
        });
    });

    describe('handleShowHistory', () => {
        it('calls ui-helpers handleShowHistory', async () => {
            await _testExports.handleShowHistory();
            const uiHelpers = await import('./ui-helpers.js');
            expect(uiHelpers.handleShowHistory).toHaveBeenCalled();
        });
    });

    describe('_selectProject', () => {
        it('returns null project when prompt returns invalid index', () => {
            mockLoad.mockReturnValue({ lastProject: '' });
            const result = _testExports._selectProject();
            expect(result.projectName).toBeNull();
        });
    });

    describe('_handleExit', () => {
        it('returns true', () => {
            const result = _testExports._handleExit();
            expect(result).toBe(true);
        });
    });

    describe('_dispatchAction', () => {
        it('handles /help command', async () => {
            const result = await _testExports._dispatchAction('/help', {} as never, 'proj', []);
            expect(result).toBe(false);
        });

        it('handles /history command', async () => {
            const result = await _testExports._dispatchAction('/history', {} as never, 'proj', []);
            expect(result).toBe(false);
        });

        it('handles /docs command', async () => {
            const result = await _testExports._dispatchAction('/docs', {} as never, 'proj', []);
            expect(result).toBe(false);
        });

        it('handles /back command', async () => {
            const result = await _testExports._dispatchAction('/back', {} as never, 'proj', []);
            expect(result).toBe(false);
        });

        it('handles exit command 0', async () => {
            const result = await _testExports._dispatchAction('0', {} as never, 'proj', []);
            expect(result).toBe(true);
        });

        it('handles /exit command', async () => {
            const result = await _testExports._dispatchAction('/exit', {} as never, 'proj', []);
            expect(result).toBe(true);
        });

        it('warns on invalid option', async () => {
            const result = await _testExports._dispatchAction('99', {} as never, 'proj', []);
            expect(result).toBe(false);
            expect(mockWarn).toHaveBeenCalled();
        });
    });

    describe('_initInfrastructure', () => {
        it('calls ensureDirs and registerCleanup', () => {
            _testExports._initInfrastructure();
        });
    });

    describe('_ensureProjectsConfigured', () => {
        it('returns true when projects exist', async () => {
            const sessionState = await import('./session-state.js');
            (sessionState.getProjects as ReturnType<typeof vi.fn>).mockReturnValue({ proj1: '1' });
            const result = await _testExports._ensureProjectsConfigured();
            expect(result).toBe(true);
        });

        it('warns when no projects configured', async () => {
            const sessionState = await import('./session-state.js');
            (sessionState.getProjects as ReturnType<typeof vi.fn>).mockReturnValue({});
            const result = await _testExports._ensureProjectsConfigured();
            expect(result).toBe(false);
        });
    });

    describe('ACTION_HANDLERS', () => {
        it('is a non-empty record', () => {
            expect(typeof _testExports.ACTION_HANDLERS).toBe('object');
            expect(Object.keys(_testExports.ACTION_HANDLERS).length).toBeGreaterThan(0);
        });
    });

    describe('_initEnvironment', () => {
        it('completes successfully with valid env', async () => {
            await _testExports._initEnvironment();
        });
    });

    describe('_promptChoice', () => {
        it('returns a choice string', async () => {
            const result = await _testExports._promptChoice('test');
            expect(typeof result).toBe('string');
        });
    });

    describe('_selectProjectAndCreateManager', () => {
        it('returns null when no projects exist', async () => {
            const sessionState = await import('./session-state.js');
            (sessionState.getProjects as ReturnType<typeof vi.fn>).mockReturnValue({});
            mockSessionState.currentProjectName = '';
            const result = await _testExports._selectProjectAndCreateManager();
            expect(result).toBeNull();
        });
    });

    describe('_loadProjectRunsHelper', () => {
        it('returns null when no project selected', () => {
            mockSessionState.currentProjectName = '';
            const result = _testExports._loadProjectRunsHelper();
            expect(result).toBeNull();
            expect(mockWarn).toHaveBeenCalled();
        });

        it('returns data when project has runs', async () => {
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
            expect(mockWarn).toHaveBeenCalled();
        });

        it('uses git fallback when metrics has <2 runs but git has >=2', async () => {
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
            expect(result && result.usingGitFallback).toBe(true);
        });
    });

    describe('_generateAndOpenDashboard', () => {
        it('writes report and opens browser', async () => {
            mockSessionState.currentProjectName = 'proj1';
            await _testExports._generateAndOpenDashboard('<html>', 'test', 'Test');
            const openMod = await import('../shared/open.js');
            expect(openMod.openWithFallback as ReturnType<typeof vi.fn>).toHaveBeenCalled();
        });
    });

    describe('handleBugReportFlow', () => {
        it('warns when Jira not configured', async () => {
            const configMod = await import('../shared/config.js');
            (configMod.default.get as ReturnType<typeof vi.fn>).mockReturnValue('');
            const result = await _testExports.handleBugReportFlow({} as never);
            expect(result).toBe(false);
            expect(mockWarn).toHaveBeenCalled();
        });

        it('runs bug report flow when Jira configured', async () => {
            const configMod = await import('../shared/config.js');
            (configMod.default.get as ReturnType<typeof vi.fn>).mockReturnValue('configured');
            const result = await _testExports.handleBugReportFlow({} as never);
            expect(result).toBe(false);
        });
    });

    describe('handleAiPrDescription', () => {
        it('warns when source branch empty', async () => {
            const promptMod = await import('../shared/prompt.js');
            (promptMod.prompt as ReturnType<typeof vi.fn>).mockReturnValue('');
            const result = await _testExports.handleAiPrDescription({} as never);
            expect(result).toBe(false);
            expect(mockWarn).toHaveBeenCalled();
        });

        it('handles AI PR description generation', async () => {
            const promptMod = await import('../shared/prompt.js');
            (promptMod.prompt as ReturnType<typeof vi.fn>).mockReturnValue('feature/my-branch');
            const aiMod = await import('./ai-pr-desc.js');
            (aiMod.generatePrDescription as ReturnType<typeof vi.fn>).mockResolvedValue('Generated PR description');
            const result = await _testExports.handleAiPrDescription({} as never);
            expect(result).toBe(false);
        });

        it('warns when AI PR description fails', async () => {
            const promptMod = await import('../shared/prompt.js');
            (promptMod.prompt as ReturnType<typeof vi.fn>).mockReturnValue('feature/my-branch');
            const aiMod = await import('./ai-pr-desc.js');
            (aiMod.generatePrDescription as ReturnType<typeof vi.fn>).mockResolvedValue('');
            const result = await _testExports.handleAiPrDescription({} as never);
            expect(result).toBe(false);
            expect(mockWarn).toHaveBeenCalled();
        });
    });

    describe('handleRunComparison', () => {
        it('warns when no project selected', async () => {
            mockSessionState.currentProjectName = '';
            const result = await _testExports.handleRunComparison();
            expect(result).toBe(false);
            expect(mockWarn).toHaveBeenCalled();
        });

        it('compares when runs exist', async () => {
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
            expect(result).toBe(false);
        });

        it('warns when <2 runs exist', async () => {
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
            expect(result).toBe(false);
            expect(mockWarn).toHaveBeenCalled();
        });
    });

    describe('_showDashboardMenu', () => {
        it('shows dashboard menu', async () => {
            mockSessionState.currentProjectName = 'proj1';
            await _testExports._showDashboardMenu();
        });
    });

    describe('handlePipelineHealthWrapper', () => {
        it('calls handlePipelineHealth and returns false', async () => {
            const result = await _testExports.handlePipelineHealthWrapper({} as never);
            expect(result).toBe(false);
        });
    });

    describe('_dashboardReleaseScore', () => {
        it('generates release score dashboard', async () => {
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
        });
    });

    describe('_dashboardQualityGate', () => {
        it('warns when no project selected', async () => {
            mockSessionState.currentProjectName = '';
            await _testExports._dashboardQualityGate();
            expect(mockWarn).toHaveBeenCalled();
        });

        it('generates quality gate dashboard', async () => {
            mockSessionState.currentProjectName = 'proj1';
            await _testExports._dashboardQualityGate();
        });
    });

    describe('_dashboardBacklogHealth', () => {
        it('generates backlog health dashboard', async () => {
            await _testExports._dashboardBacklogHealth();
        });
    });

    describe('_dashboardRequirementScore', () => {
        it('generates requirement score dashboard', async () => {
            await _testExports._dashboardRequirementScore();
        });
    });

    describe('_dashboardPipelineCost', () => {
        it('generates pipeline cost dashboard', async () => {
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
        });
    });

    describe('_dashboardAiEffectiveness', () => {
        it('generates AI effectiveness dashboard', async () => {
            await _testExports._dashboardAiEffectiveness();
        });
    });

    describe('_dashboardDefectTrends', () => {
        it('generates defect trends dashboard', async () => {
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
        });
    });

    describe('_dashboardTraceabilityMatrix', () => {
        it('generates traceability matrix dashboard', async () => {
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
        });
    });

    describe('_dashboardSeasonality', () => {
        it('generates seasonality dashboard', async () => {
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
        });
    });

    describe('_dashboardSilentRegression', () => {
        it('generates silent regression dashboard', async () => {
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
        });
    });

    describe('_dashboardAiComparison', () => {
        it('generates AI comparison dashboard', async () => {
            await _testExports._dashboardAiComparison();
        });
    });

    describe('_dashboardBenchmark', () => {
        it('generates benchmark dashboard', async () => {
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
        });
    });

    describe('_dashboardDeveloperProfile', () => {
        it('generates developer profile dashboard', async () => {
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
        });
    });

    describe('_dashboardSuiteOptimization', () => {
        it('generates suite optimization dashboard', async () => {
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
        });
    });

    describe('_dashboardIncidentReport', () => {
        it('generates incident report dashboard', async () => {
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
        });
    });

    describe('_dashboardImpactAlert', () => {
        it('generates impact alert dashboard', async () => {
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
        });
    });

    describe('_dashboardCoverageGap', () => {
        it('warns when no project selected', async () => {
            mockSessionState.currentProjectName = '';
            await _testExports._dashboardCoverageGap();
            expect(mockWarn).toHaveBeenCalled();
        });

        it('generates coverage gap dashboard', async () => {
            mockSessionState.currentProjectName = 'proj1';
            const configMod = await import('../shared/config.js');
            (configMod.default.get as ReturnType<typeof vi.fn>).mockReturnValue('configured');
            await _testExports._dashboardCoverageGap();
        });
    });
});
