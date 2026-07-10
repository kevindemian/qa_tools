import os from 'os';
import { sanitizePath } from '../shared/path-utils.js';
vi.mock('../shared/prompt', () => ({
    print: vi.fn(),
    success: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    title: vi.fn(),
    prompt: vi.fn(),
    confirm: vi.fn(),
    printError: vi.fn(),
    withSpinner: vi.fn(<T>(_: string, fn: () => Promise<T>) => fn()),
}));

const mockState = { currentProvider: 'gitlab', currentProjectName: '' };

vi.mock('./session-state', () => ({
    pushHistory: vi.fn(),
    displayProjects: vi.fn(),
    displayRecentPipelines: vi.fn(),
    createManagerForProject: vi.fn(() => mockManager),
    getProviderForProject: vi.fn(() => 'gitlab'),
    setCurrentProjectName: vi.fn(),
    setProjectId: vi.fn(),
    setManager: vi.fn(),
    getProjects: vi.fn(() => ({})),
    getDataHub: vi.fn().mockReturnValue({
        loadMetricsStore: vi.fn().mockReturnValue({ runs: [], failureClassifications: [] }),
        saveMetricsStore: vi.fn(),
    }),
    get currentProvider() {
        return mockState.currentProvider;
    },
    get currentProjectName() {
        return mockState.currentProjectName;
    },
}));

vi.mock('../shared/data-hub/global-hub.js', () => ({
    getDataHub: vi.fn().mockReturnValue({
        loadMetricsStore: vi.fn().mockReturnValue({ runs: [], failureClassifications: [] }),
        saveMetricsStore: vi.fn(),
    }),
}));

vi.mock('../shared/data-hub/compute/flakiness-entries.js', () => ({
    calcFlakinessEntries: vi.fn().mockReturnValue([]),
}));

vi.mock('../shared/health-score', () => ({
    calculateHealthScore: vi.fn(() => ({
        overall: 50,
        grade: 'needs_attention',
        dimensions: { passRate: { score: 50 }, flakyRate: { score: 50 }, coverage: { score: 50 } },
        qualityGate: 'fail',
    })),
}));
vi.mock('../shared/defect-trend', () => ({
    aggregateDefectTrends: vi.fn(() => ({ trends: [] })),
    generateDefectTrendHtml: vi.fn(() => ''),
}));
vi.mock('../shared/release-score', () => ({
    calculateReleaseScore: vi.fn(() => ({})),
    generateReleaseScoreHtml: vi.fn(() => ''),
}));
vi.mock('../shared/ai-effectiveness', () => ({
    computeAiEffectiveness: vi.fn(() => ({})),
    generateAiEffectivenessHtml: vi.fn(() => ''),
}));
vi.mock('../shared/traceability-matrix', () => ({
    buildTraceabilityMatrix: vi.fn(() => ({ nodes: [] })),
    generateTraceabilityHtml: vi.fn(() => ''),
}));
vi.mock('../shared/backlog-health', () => ({
    analyzeBacklogHealth: vi.fn(() => ({})),
    generateBacklogHealthHtml: vi.fn(() => ''),
}));
vi.mock('../shared/defect-seasonality', () => ({
    aggregateDefectSeasonality: vi.fn(() => ({ peakDay: '' })),
    generateSeasonalityHtml: vi.fn(() => ''),
}));
vi.mock('../shared/silent-regression', () => ({
    detectSilentRegression: vi.fn(() => ({ regressions: [] })),
    generateSilentRegressionHtml: vi.fn(() => ''),
}));
vi.mock('../shared/ai-comparison', () => ({
    compareAiVsManual: vi.fn(() => []),
    generateAiComparisonHtml: vi.fn(() => ''),
}));
vi.mock('../shared/cross-squad-benchmark', () => ({
    computeCrossSquadBenchmark: vi.fn(() => ({})),
    generateBenchmarkHtml: vi.fn(() => ''),
}));
vi.mock('../shared/developer-profile', () => ({
    buildDeveloperProfile: vi.fn(() => []),
    generateDeveloperProfileHtml: vi.fn(() => ''),
}));
vi.mock('../shared/suite-optimization', () => ({
    analyzeSuiteOptimization: vi.fn(() => ({})),
    generateOptimizationHtml: vi.fn(() => ''),
}));
vi.mock('../shared/incident-report', () => ({
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
    generateIncidentReportHtml: vi.fn(() => ''),
}));
vi.mock('../shared/impact-alert', () => ({
    analyzePipelineImpact: vi.fn(() => ({})),
    generateImpactAlertHtml: vi.fn(() => ''),
}));
vi.mock('../shared/pipeline-cost', () => ({
    calculatePipelineCost: vi.fn(() => ({})),
    generatePipelineCostHtml: vi.fn(() => ''),
}));
vi.mock('../shared/requirement-score', () => ({
    calculateRequirementScores: vi.fn(() => []),
    generateRequirementScoreHtml: vi.fn(() => ''),
}));
vi.mock('../shared/git-metrics-adapter', () => ({
    generateGitMetricsRuns: vi.fn(() => []),
    generateGitFailureClassifications: vi.fn(() => []),
    getLastGitLogError: vi.fn(() => undefined),
    clearGitLogError: vi.fn(),
}));
vi.mock('../shared/quality-gate', () => ({
    runQualityGate: vi.fn(() => ({ passed: true })),
    formatQualityGateText: vi.fn(() => ''),
}));
vi.mock('../shared/temp-dir', () => ({ writeReport: vi.fn((name: string) => sanitizePath(os.tmpdir(), name)) }));
vi.mock('../shared/jira-client', () => ({ default: vi.fn() }));

vi.mock('../shared/flakiness-dashboard', () => ({ generateFlakinessHtml: vi.fn(() => '<html>') }));

vi.mock('../shared/open', () => ({ openWithFallback: vi.fn() }));

vi.mock('../shared/state', () => ({ update: vi.fn() }));

vi.mock('fs', () => ({
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
    existsSync: vi.fn(),
    rmSync: vi.fn(),
}));

import { success, warn, info, print, prompt, printError } from '../shared/prompt.js';
import { pushHistory, getProjects, getDataHub as getSessionDataHub } from './session-state.js';
import { calcFlakinessEntries } from '../shared/data-hub/compute/flakiness-entries.js';
import { generateFlakinessHtml } from '../shared/flakiness-dashboard.js';
import {
    handleListSchedules,
    handleRunSchedule,
    handleChangeProject,
    handleFlakinessDashboard,
    generateWeeklyQualityReport,
} from './schedule-handler.js';
import { createMockGitProvider } from '../shared/test-utils/factories/index.js';
import type { GitProvider } from '../shared/types.js';

const mockPrompt = vi.mocked(prompt);
const mockPushHistory = vi.mocked(pushHistory);
const mockPrintError = vi.mocked(printError);
const mockWarn = vi.mocked(warn);
const mockInfo = vi.mocked(info);
const mockGetDataHub = vi.mocked(getSessionDataHub);
const mockCalcFlakinessEntries = vi.mocked(calcFlakinessEntries);
const mockGenerateHtml = vi.mocked(generateFlakinessHtml);

const mockManager = createMockGitProvider();

describe('Schedule Handler', () => {
    beforeAll(async () => {
        const openModule = (await import('../shared/open.js')) as { openWithFallback: (...args: unknown[]) => unknown };
        if (!vi.isMockFunction(openModule.openWithFallback)) {
            throw new Error('Guard FAILED: openWithFallback is NOT mocked. Browser would open!');
        }
    });

    beforeEach(() => {
        vi.clearAllMocks();
        mockState.currentProvider = 'gitlab';
        mockState.currentProjectName = '';
    });

    describe('HandleListSchedules', () => {
        it('lists schedules for gitlab', async () => {
            expect.hasAssertions();

            const schedules = [
                { id: '1', description: 'Nightly', next_run_at: '2026-01-01' },
                { id: '2', description: '' },
            ];
            vi.spyOn(mockManager, 'getSchedules').mockResolvedValue(schedules);

            await handleListSchedules(mockManager);

            expect(info).toHaveBeenCalledWith(expect.stringContaining('Schedules'));
            expect(print).toHaveBeenCalledTimes(2);
            expect(mockPushHistory).toHaveBeenCalledWith('list-schedules', '2 schedules', 'ok');
        });

        it('warns on empty schedules', async () => {
            expect.hasAssertions();

            vi.spyOn(mockManager, 'getSchedules').mockResolvedValue([]);

            await handleListSchedules(mockManager);

            expect(mockWarn).toHaveBeenCalledWith(expect.stringContaining('Nenhum schedule'));
        });

        it('warns for github provider', async () => {
            expect.hasAssertions();

            mockState.currentProvider = 'github';

            await handleListSchedules(mockManager);

            expect(mockWarn).toHaveBeenCalledWith(expect.stringContaining('GitHub'));
            expect(mockManager.getSchedules).not.toHaveBeenCalled();
        });

        it('handles error', async () => {
            expect.hasAssertions();

            vi.spyOn(mockManager, 'getSchedules').mockRejectedValue(new Error('API error'));

            await handleListSchedules(mockManager);

            expect(mockPrintError).toHaveBeenCalledWith(expect.any(String), expect.any(Error));
        });
    });

    describe('HandleRunSchedule', () => {
        it('runs schedule for gitlab', async () => {
            expect.hasAssertions();

            mockPrompt.mockReturnValue('schedule-1');
            vi.spyOn(mockManager, 'runSchedule').mockResolvedValue({ status: 'success' });

            await handleRunSchedule(mockManager);

            expect(mockManager.runSchedule).toHaveBeenCalledWith('schedule-1');
            expect(success).toHaveBeenCalledWith(expect.stringContaining('Schedule'));
            expect(mockPushHistory).toHaveBeenCalledWith('schedule-run', 'schedule-1', 'ok');
        });

        it('warns for github provider', async () => {
            expect.hasAssertions();

            mockState.currentProvider = 'github';

            await handleRunSchedule(mockManager);

            expect(mockWarn).toHaveBeenCalledWith(expect.stringContaining('GitHub'));
            expect(mockManager.runSchedule).not.toHaveBeenCalled();
        });

        it('handles error', async () => {
            expect.hasAssertions();

            mockPrompt.mockReturnValue('sched-1');
            vi.spyOn(mockManager, 'runSchedule').mockRejectedValue(new Error('fail'));

            await handleRunSchedule(mockManager);

            expect(mockPrintError).toHaveBeenCalledWith(expect.any(String), expect.any(Error));
        });
    });

    describe('HandleChangeProject', () => {
        const names = ['proj1', 'proj2'];

        it('changes to valid project', async () => {
            expect.hasAssertions();

            mockPrompt.mockReturnValue('1');
            vi.mocked(getProjects).mockReturnValue({ proj1: '1', proj2: '2' });

            await handleChangeProject(names);

            const {
                setCurrentProjectName,
                setProjectId,
                setManager,
            }: {
                setCurrentProjectName: (name: string) => void;
                setProjectId: (id: string) => void;
                setManager: (v: GitProvider | null) => void;
            } = await import('./session-state.js');

            expect(setCurrentProjectName).toHaveBeenCalledWith('proj1');
            expect(setProjectId).toHaveBeenCalledWith('1');
            expect(setManager).toHaveBeenCalledWith(expect.anything());
            expect(success).toHaveBeenCalledWith(expect.stringContaining('proj1'));
        });

        it('warns on invalid index', async () => {
            expect.hasAssertions();

            mockPrompt.mockReturnValue('99');

            await handleChangeProject(names);

            expect(mockWarn).toHaveBeenCalledWith(expect.stringContaining('inválida'));
        });

        it('warns on NaN', async () => {
            expect.hasAssertions();

            mockPrompt.mockReturnValue('abc');

            await handleChangeProject(names);

            expect(mockWarn).toHaveBeenCalledWith(expect.stringContaining('inválida'));
        });
    });

    describe('HandleFlakinessDashboard', () => {
        it('warns when no project selected', () => {
            void handleFlakinessDashboard();

            expect(mockWarn).toHaveBeenCalledWith(expect.stringContaining('Nenhum projeto'));
        });

        it('warns when less than 2 runs', () => {
            mockState.currentProjectName = 'proj1';
            mockGetDataHub.mockReturnValue({
                loadMetricsStore: vi.fn().mockReturnValue({
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
                }),
                saveMetricsStore: vi.fn(),
            } as never);

            void handleFlakinessDashboard();

            expect(mockWarn).toHaveBeenCalledWith(expect.stringContaining('Menos de 2'));
        });

        it('informs when no flaky tests', () => {
            mockState.currentProjectName = 'proj1';
            mockGetDataHub.mockReturnValue({
                loadMetricsStore: vi.fn().mockReturnValue({
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
                }),
                saveMetricsStore: vi.fn(),
            } as never);
            mockCalcFlakinessEntries.mockReturnValue([]);

            void handleFlakinessDashboard();

            expect(mockInfo).toHaveBeenCalledWith(expect.stringContaining('Nenhum teste flaky'));
        });

        it('generates dashboard HTML and opens browser', async () => {
            expect.hasAssertions();

            mockState.currentProjectName = 'proj1';
            mockGetDataHub.mockReturnValue({
                loadMetricsStore: vi.fn().mockReturnValue({
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
                }),
                saveMetricsStore: vi.fn(),
            } as never);
            mockCalcFlakinessEntries.mockReturnValue([
                { title: 't1', project: 'test', rate: 0.5, passCount: 1, failCount: 0, skipCount: 0, totalRuns: 1 },
            ]);

            await handleFlakinessDashboard();

            expect(mockGenerateHtml).toHaveBeenCalledWith(expect.any(Array), expect.any(String));

            const { openWithFallback } = (await import('../shared/open.js')) as {
                openWithFallback: (...args: unknown[]) => unknown;
            };

            expect(openWithFallback).toHaveBeenCalledWith(
                expect.stringContaining('flakiness'),
                'Dashboard de flaky',
                info,
            );
        });
    });

    describe('GenerateWeeklyQualityReport', () => {
        it('warns when no project selected', () => {
            mockState.currentProjectName = '';
            generateWeeklyQualityReport();

            expect(mockWarn).toHaveBeenCalledWith(expect.stringContaining('Nenhum projeto'));
        });

        it('warns when less than 2 runs and git fallback fails', () => {
            mockState.currentProjectName = 'proj1';
            mockGetDataHub.mockReturnValue({
                loadMetricsStore: vi.fn().mockReturnValue({
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
                }),
                saveMetricsStore: vi.fn(),
            } as never);
            generateWeeklyQualityReport();

            expect(mockWarn).toHaveBeenCalledWith(expect.stringContaining('Menos de 2'));
        });
    });
});
