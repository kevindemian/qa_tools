import os from 'os';
import { sanitizePath } from '../../shared/path-utils.js';
vi.mock('../../shared/ui/prompt.js', () => ({
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

const mockState = { currentProvider: 'gitlab' };

vi.mock('../../shared/project-context', () => ({
    getCurrentProject: vi.fn(() => ''),
    setCurrentProject: vi.fn(),
    clearCurrentProject: vi.fn(),
    getSelfHostEntry: vi.fn(() => undefined),
}));

vi.mock('../session-state', () => ({
    pushHistory: vi.fn(),
    displayProjects: vi.fn(),
    displayRecentPipelines: vi.fn(),
    createManagerForProject: vi.fn(() => mockManager),
    getProviderForProject: vi.fn(() => 'gitlab'),
    setProjectId: vi.fn(),
    setManager: vi.fn(),
    getProjects: vi.fn(() => ({})),
    getDataHub: vi.fn().mockReturnValue({
        computed: { metricsRuns: [] },
        raw: { failureClassifications: [] },
    }),
    get currentProvider() {
        return mockState.currentProvider;
    },
}));

vi.mock('../../shared/data-hub/global-hub.js', () => ({
    getDataHub: vi.fn().mockReturnValue({
        computed: { metricsRuns: [] },
        raw: { failureClassifications: [] },
    }),
}));

vi.mock('../../shared/data-hub/compute/flakiness-entries.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../shared/data-hub/compute/flakiness-entries.js')>();
    return { ...actual, calcFlakinessEntries: vi.fn().mockReturnValue([]) };
});

vi.mock('../../shared/quality/health-score.js', () => ({
    calculateHealthScore: vi.fn(() => ({
        overall: 50,
        grade: 'needs_attention',
        dimensions: { passRate: { score: 50 }, flakyRate: { score: 50 }, coverage: { score: 50 } },
        qualityGate: 'fail',
    })),
}));
vi.mock('../../shared/quality/defect-trend.js', () => ({
    aggregateDefectTrends: vi.fn(() => ({ trends: [] })),
    generateDefectTrendHtml: vi.fn(() => ''),
}));
vi.mock('../../shared/report/ai-effectiveness.js', () => ({
    computeAiEffectiveness: vi.fn(() => ({
        acceptanceRate: 0.75,
        totalRecords: 4,
        totalGenerated: 4,
        totalModified: 1,
        totalDeleted: 0,
        topPromptVersion: 'v2',
        byVersion: [{ version: 'v2', count: 4, acceptanceRate: 0.75 }],
        trend: [{ date: '2026-01-01', acceptanceRate: 0.75, generated: 4 }],
        timestamp: new Date().toISOString(),
    })),
    generateAiEffectivenessHtml: vi.fn(() => '<section>ai</section>'),
    convertGenerationRecordsToFeedback: vi.fn(() => ({ records: [] })),
}));
vi.mock('../../shared/report/traceability-matrix.js', () => ({
    buildTraceabilityMatrix: vi.fn(() => ({
        nodes: [
            { epic: 'EPIC-1', coverage: 100, requirement: 'R1', tests: ['t1'] },
            { epic: 'EPIC-2', coverage: 40, requirement: 'R2', tests: ['t2'] },
        ],
    })),
    generateTraceabilityHtml: vi.fn(() => '<section>trace</section>'),
}));
vi.mock('../../shared/report/backlog-health.js', () => ({
    analyzeBacklogHealth: vi.fn(() => ({
        unassignedIssues: [],
        staleIssues: [
            {
                key: 'K-1',
                summary: 's',
                assignee: null,
                updated: '',
                type: 'bug',
                priority: 'high',
                linkedTestCount: 0,
            },
        ],
        bugsWithoutTests: [],
        densityByEpic: [{ epic: 'EPIC-1', bugCount: 1, testCount: 2 }],
        score: 65,
        timestamp: new Date().toISOString(),
    })),
    generateBacklogHealthHtml: vi.fn(() => '<section>backlog</section>'),
    mapJiraIssuesToBacklogHealth: vi.fn((issues: unknown[]) => issues),
}));
vi.mock('../../shared/quality/defect-seasonality.js', () => ({
    aggregateDefectSeasonality: vi.fn(() => ({ peakDay: 'Monday', byDay: { Monday: 3 } })),
    generateSeasonalityHtml: vi.fn(() => '<section>seasonality</section>'),
}));
vi.mock('../../shared/quality/silent-regression.js', () => ({
    detectSilentRegression: vi.fn(() => ({ regressions: [{ test: 't1', from: 100, to: 90 }] })),
    generateSilentRegressionHtml: vi.fn(() => '<section>regression</section>'),
}));
vi.mock('../../shared/report/ai-comparison.js', () => ({
    compareAiVsManual: vi.fn(() => [{ dimension: 'speed', ai: 10, manual: 30, delta: -20 }]),
    generateAiComparisonHtml: vi.fn(() => '<section>aicomp</section>'),
}));
vi.mock('../../shared/quality/cross-squad-benchmark.js', () => ({
    computeCrossSquadBenchmark: vi.fn(() => ({
        benchmarks: [
            {
                project: 'proj1',
                healthScore: 70,
                grade: 'good',
                passRate: 80,
                flakyRate: 5,
                coveragePct: 70,
                runCount: 2,
                trend: 'up' as const,
            },
        ],
        topSquad: 'proj1',
        bottomSquad: 'proj1',
        averageScore: 70,
        stdDev: 0,
        timestamp: new Date().toISOString(),
    })),
    generateBenchmarkHtml: vi.fn(() => '<section>benchmark</section>'),
}));
vi.mock('../../shared/quality/developer-profile.js', () => ({
    buildDeveloperProfile: vi.fn(() => [{ developer: 'dev1', defectCount: 1, flakyCount: 0 }]),
    generateDeveloperProfileHtml: vi.fn(() => '<section>devprofile</section>'),
}));
vi.mock('../../shared/quality/suite-optimization.js', () => ({
    analyzeSuiteOptimization: vi.fn(() => ({
        optimizations: [
            {
                testTitle: 't1',
                duration: 10,
                flakiness: 0.4,
                impact: 'high' as const,
                action: 'quarantine',
                reason: 'flaky',
            },
        ],
        totalTests: 1,
        totalDuration: 10,
        potentialSavings: 5,
        slowThreshold: 5,
        flakyThreshold: 0.3,
        timestamp: new Date().toISOString(),
    })),
    generateOptimizationHtml: vi.fn(() => '<section>optimization</section>'),
}));
vi.mock('../../shared/report/incident-report.js', () => ({
    buildIncidentReport: vi.fn(() => ({
        events: [{ id: 'e1', severity: 'medium' as const, area: 'coverage', description: 'gap' }],
        eventCount: 1,
        highCount: 0,
        mediumCount: 1,
        lowCount: 0,
        summary: '1 incident',
        overallSeverity: 'medium' as const,
        timestamp: new Date().toISOString(),
    })),
    generateIncidentReportHtml: vi.fn(() => '<section>incident</section>'),
}));
vi.mock('../../shared/report/impact-alert.js', () => ({
    analyzePipelineImpact: vi.fn(() => ({
        alerts: [
            {
                severity: 'warning' as const,
                title: 'Coverage gap',
                message: 'low cov',
                affectedArea: 'EPIC-2',
                recommendation: 'add tests',
            },
        ],
        criticalCount: 0,
        warningCount: 1,
        infoCount: 0,
        timestamp: new Date().toISOString(),
    })),
    generateImpactAlertHtml: vi.fn(() => '<section>impact</section>'),
}));
vi.mock('../../shared/quality/pipeline-cost.js', () => ({
    generatePipelineCostHtml: vi.fn(() => '<section>pipelinecost</section>'),
}));
vi.mock('../../shared/quality/requirement-score.js', () => ({
    calculateRequirementScores: vi.fn(() => [{ requirement: 'R1', score: 90, coverage: 100 }]),
    generateRequirementScoreHtml: vi.fn(() => '<section>reqscore</section>'),
}));
vi.mock('../../shared/quality/quality-gate.js', () => ({
    runQualityGate: vi.fn(() => ({ overall: 'pass', checks: [], score: 85 })),
}));
vi.mock('../../shared/infra/temp-dir.js', () => ({
    writeReport: vi.fn((name: string, content: string) => {
        (globalThis as { __lastWriteReportContent?: string }).__lastWriteReportContent = content;
        return sanitizePath(os.tmpdir(), name);
    }),
}));
vi.mock('../../shared/jira/jira-client.js', () => ({ default: vi.fn() }));
vi.mock('../../shared/report/coverage-gap.js', () => ({
    analyzeCoverageGaps: vi.fn(() => ({
        totals: { totalIssues: 10, covered: 7, gap: 3, rawCoveragePct: 70, weightedCoveragePct: 70 },
        gateConfig: { failingEpics: ['EPIC-1'], passingEpics: ['EPIC-2'] },
        items: [],
        byEpic: {
            'EPIC-1': { total: 5, covered: 3, gatePass: false, items: [] },
            'EPIC-2': { total: 5, covered: 4, gatePass: true, items: [] },
        },
        hierarchy: [],
        trends: [],
        timestamp: new Date().toISOString(),
    })),
}));

vi.mock('../../shared/report/flakiness-dashboard.js', () => ({ generateFlakinessHtml: vi.fn(() => '<html>') }));

vi.mock('../../shared/open', () => ({ openWithFallback: vi.fn() }));

vi.mock('../../shared/state', () => ({ update: vi.fn() }));

vi.mock('fs', () => ({
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
    existsSync: vi.fn(),
    rmSync: vi.fn(),
}));

import { success, warn, info, print, prompt, printError } from '../../shared/ui/prompt.js';
import { getCurrentProject, setCurrentProject } from '../../shared/project-context.js';
import {
    pushHistory,
    getProjects,
    setProjectId,
    setManager,
    getDataHub as getSessionDataHub,
} from '../session-state.js';
import { calcFlakinessEntries } from '../../shared/data-hub/compute/flakiness-entries.js';
import { generateFlakinessHtml } from '../../shared/report/flakiness-dashboard.js';
import {
    handleListSchedules,
    handleRunSchedule,
    handleChangeProject,
    handleFlakinessDashboard,
    generateWeeklyQualityReport,
} from '../schedule-handler.js';
import { createMockGitProvider } from '../../shared/test-utils/factories/index.js';

import { writeReport } from '../../shared/infra/temp-dir.js';
import { generateBenchmarkHtml } from '../../shared/quality/cross-squad-benchmark.js';
import { analyzePipelineImpact } from '../../shared/report/impact-alert.js';
import { runQualityGate } from '../../shared/quality/quality-gate.js';
import { buildIncidentReport } from '../../shared/report/incident-report.js';
import { aggregateDefectTrends } from '../../shared/data-hub/compute/defect-aggregation.js';
import { DataHubImpl } from '../../shared/data-hub/hub.js';
import { makeDataHubPersistenceMock } from '../../shared/test-utils/factories/data-hub-mock.js';
import type { DataHub } from '../../shared/types/data-hub.js';
const mockGenerateHtml = vi.mocked(generateFlakinessHtml);

const mockManager = createMockGitProvider();

const mockPrompt = vi.mocked(prompt);
const mockPushHistory = vi.mocked(pushHistory);
const mockPrintError = vi.mocked(printError);
const mockWarn = vi.mocked(warn);
const mockInfo = vi.mocked(info);
const mockGetDataHub = vi.mocked(getSessionDataHub);
const mockCalcFlakinessEntries = vi.mocked(calcFlakinessEntries);
const mockWriteReport = vi.mocked(writeReport);
const mockGenerateBenchmarkHtml = vi.mocked(generateBenchmarkHtml);
const mockAnalyzePipelineImpact = vi.mocked(analyzePipelineImpact);
const mockRunQualityGate = vi.mocked(runQualityGate);
const mockBuildIncidentReport = vi.mocked(buildIncidentReport);

describe('Schedule Handler', () => {
    beforeAll(async () => {
        const openModule = (await import('../../shared/open.js')) as {
            openWithFallback: (...args: unknown[]) => unknown;
        };
        if (!vi.isMockFunction(openModule.openWithFallback)) {
            throw new Error('Guard FAILED: openWithFallback is NOT mocked. Browser would open!');
        }
    });

    beforeEach(() => {
        vi.clearAllMocks();
        mockState.currentProvider = 'gitlab';
        vi.mocked(getCurrentProject).mockReturnValue('');
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

            expect(setCurrentProject).toHaveBeenCalledWith('proj1');
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
            vi.mocked(getCurrentProject).mockReturnValue('proj1');
            mockGetDataHub.mockReturnValue({
                computed: {
                    metricsRuns: [
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
                },
                raw: { failureClassifications: [] },
            } as never);

            void handleFlakinessDashboard();

            expect(mockWarn).toHaveBeenCalledWith(expect.stringContaining('Menos de 2'));
        });

        it('informs when no flaky tests', () => {
            vi.mocked(getCurrentProject).mockReturnValue('proj1');
            mockGetDataHub.mockReturnValue({
                computed: {
                    metricsRuns: [
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
                },
                raw: { failureClassifications: [] },
            } as never);
            mockCalcFlakinessEntries.mockReturnValue([]);

            void handleFlakinessDashboard();

            expect(mockInfo).toHaveBeenCalledWith(expect.stringContaining('Nenhum teste flaky'));
        });

        it('generates dashboard HTML and opens browser', async () => {
            expect.hasAssertions();

            vi.mocked(getCurrentProject).mockReturnValue('proj1');
            mockGetDataHub.mockReturnValue({
                computed: {
                    metricsRuns: [
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
                },
                raw: { failureClassifications: [] },
            } as never);
            mockCalcFlakinessEntries.mockReturnValue([
                { title: 't1', project: 'test', rate: 0.5, passCount: 1, failCount: 0, skipCount: 0, totalRuns: 1 },
            ]);

            await handleFlakinessDashboard();

            expect(mockGenerateHtml).toHaveBeenCalledWith(
                expect.any(Array),
                expect.any(String),
                expect.objectContaining({ dataHub: mockGetDataHub() }),
            );

            const { openWithFallback } = (await import('../../shared/open.js')) as {
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
            expect.hasAssertions();

            vi.mocked(getCurrentProject).mockReturnValue('');

            generateWeeklyQualityReport();

            expect(mockWarn).toHaveBeenCalledWith(expect.stringContaining('Nenhum projeto'));
        });

        it('warns when less than 2 runs', () => {
            expect.hasAssertions();

            vi.mocked(getCurrentProject).mockReturnValue('proj1');

            mockGetDataHub.mockReturnValue({
                computed: {
                    metricsRuns: [
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
                },
                raw: { failureClassifications: [] },
            } as never);
            generateWeeklyQualityReport();

            expect(mockWarn).toHaveBeenCalledWith(expect.stringContaining('Menos de 2'));
        });

        function seedTwoRunsHub(): void {
            vi.mocked(getCurrentProject).mockReturnValue('proj1');
            mockGetDataHub.mockReturnValue({
                computed: {
                    metricsRuns: [
                        {
                            project: 'proj1',
                            timestamp: '2026-01-01',
                            total: 10,
                            passed: 8,
                            failed: 2,
                            skipped: 0,
                            duration: 100,
                            tests: [{ title: 't1', duration: 50, flakiness: 0 }],
                        },
                        {
                            project: 'proj1',
                            timestamp: '2026-01-02',
                            total: 10,
                            passed: 9,
                            failed: 1,
                            skipped: 0,
                            duration: 110,
                            tests: [{ title: 't2', duration: 55, flakiness: 0.4 }],
                        },
                    ],
                    coverage: 65,
                    // The release score is genuinely computed by the real chain
                    // (DataHub → calcReleaseScore) — never a hand-written fixture.
                    releaseScore: DataHubImpl.createFromParseResult(
                        {
                            tests: [
                                { title: 't1', state: 'passed' as const, duration: 50 },
                                { title: 't2', state: 'passed' as const, duration: 55 },
                            ],
                            stats: { passed: 2, failed: 0, skipped: 0, total: 2, duration: 105 },
                        },
                        'proj1',
                        makeDataHubPersistenceMock(),
                    ).computed.releaseScore,
                    // I-1 SSOT: the report consumes hub.computed, so the seed must
                    // carry the same computed fields the hub would populate.
                    defectAggregation: aggregateDefectTrends([]),
                    traceabilityTree: {
                        nodes: [
                            { epic: 'EPIC-1', coverage: 100, requirement: 'R1', tests: ['t1'] },
                            { epic: 'EPIC-2', coverage: 40, requirement: 'R2', tests: ['t2'] },
                        ],
                        totalEpics: 2,
                        totalTests: 2,
                        overallCoverage: 70,
                        timestamp: new Date().toISOString(),
                        awareness: { haveTest: 1, missingTest: 1 },
                    },
                    backlogHealth: {
                        unassignedIssues: [],
                        staleIssues: [],
                        bugsWithoutTests: [],
                        densityByEpic: [{ epic: 'EPIC-1', bugCount: 1, testCount: 2 }],
                        score: 65,
                        totalIssues: 0,
                        noData: false,
                        timestamp: new Date().toISOString(),
                    },
                    developerProfile: {
                        authors: [{ author: 'dev1', defectCount: 1, flakyCount: 0 }],
                        totalAuthors: 1,
                        totalFailures: 1,
                        topContributor: 'dev1',
                        topFailureAuthor: 'dev1',
                        timestamp: new Date().toISOString(),
                    },
                    aiComparison: {
                        aiTotal: 0,
                        aiPassRate: 0,
                        aiFlakinessAvg: 0,
                        aiAcceptanceRate: 0,
                        manualTotal: 0,
                        manualPassRate: 0,
                        manualFlakinessAvg: 0,
                        manualAcceptanceRate: 0,
                        aiAdvantage: 'none',
                        byVersion: [],
                        timestamp: new Date().toISOString(),
                    },
                    seasonalityAggregation: {
                        byDayOfWeek: [],
                        byHour: [],
                        peakDay: 'N/A',
                        peakHour: -1,
                        totalRecords: 0,
                        period: { from: '', to: '' },
                        timestamp: new Date().toISOString(),
                    },
                    regressionDetection: {
                        regressions: [],
                        totalTests: 0,
                        threshold: 2,
                        timestamp: new Date().toISOString(),
                    },
                    optimizationActions: {
                        optimizations: [],
                        totalTests: 0,
                        totalDuration: 0,
                        potentialSavings: 0,
                        slowThreshold: 5,
                        flakyThreshold: 0.3,
                        timestamp: new Date().toISOString(),
                    },
                    crossSquad: {
                        benchmarks: [
                            {
                                project: 'proj1',
                                healthScore: 70,
                                grade: 'good',
                                passRate: 80,
                                flakyRate: 5,
                                coveragePct: 70,
                                runCount: 2,
                                trend: 'up' as const,
                            },
                        ],
                        topSquad: 'proj1',
                        bottomSquad: 'proj1',
                        averageScore: 70,
                        stdDev: 0,
                        timestamp: new Date().toISOString(),
                    },
                    coverageGap: {
                        items: [],
                        totals: {
                            totalIssues: 0,
                            covered: 0,
                            gap: 0,
                            weightedCoveragePct: 65,
                            rawCoveragePct: 65,
                        },
                        byEpic: {},
                        gateConfig: { minCoveragePct: 80, failingEpics: [] },
                        hierarchy: [],
                        trends: [],
                        timestamp: new Date().toISOString(),
                    },
                    pipelineCostResult: {
                        totalCost: 0.5,
                        avgCostPerRun: 0.25,
                        totalDurationSec: 120,
                        costPerMinute: 0.01,
                        costByRun: [{ timestamp: '2026-01-01', durationSec: 60, cost: 0.01, status: 'passed' }],
                        runCount: 2,
                        period: { from: '2026-01-01', to: '2026-01-02' },
                        timestamp: new Date().toISOString(),
                    },
                },
                raw: {
                    failureClassifications: [{ testTitle: 't2', category: 'flaky', timestamp: '2026-01-02' }],
                    jiraIssues: [],
                    aiRecords: [],
                },
            } as never);
        }

        it('writes the genuinely computed release score into the report HTML', () => {
            expect.hasAssertions();

            seedTwoRunsHub();
            generateWeeklyQualityReport();

            const hub = vi.mocked(getSessionDataHub).mock.results[0]?.value as DataHub | undefined;
            const hubRuns = (hub?.computed.metricsRuns ?? []) as Array<{ project: string }>;

            expect(hubRuns, `hubRuns=${JSON.stringify(hubRuns)}`).toHaveLength(2);

            // The real release-score chain ran: the written HTML must contain the
            // genuinely computed score (SSOT via DataHub → calcReleaseScore → renderer).
            const writtenHtml = mockWriteReport.mock.calls[0]?.[1] as string;
            const hubReleaseScore = hub?.computed.releaseScore;

            expect(writtenHtml).toContain('<div data-section="release-score">');
            expect(writtenHtml).toContain('Release Score');
            expect(writtenHtml).toContain(String(hubReleaseScore?.score));
            expect(writtenHtml).toContain(String(hubReleaseScore?.grade));
        });

        it('renders the hub computed cross-squad benchmark into the report', () => {
            expect.hasAssertions();

            seedTwoRunsHub();
            generateWeeklyQualityReport();

            const benchmarkInput = mockGenerateBenchmarkHtml.mock.calls[0]?.[0] as
                { topSquad: string; benchmarks: Array<{ project: string; runCount: number }> } | undefined;

            expect(benchmarkInput, `benchmarkInput=${JSON.stringify(benchmarkInput)}`).toBeTruthy();
            expect(benchmarkInput?.topSquad).toBe('proj1');
            expect(benchmarkInput?.benchmarks.some((b) => b.project === 'proj1' && b.runCount === 2)).toBeTruthy();
        });

        it('invokes the score/dashboard analyzers with real run data', () => {
            expect.hasAssertions();

            seedTwoRunsHub();
            generateWeeklyQualityReport();

            expect(mockAnalyzePipelineImpact).toHaveBeenCalledWith(
                expect.any(Number),
                expect.any(Number),
                expect.any(Array),
                expect.any(Number),
                expect.any(Array),
                expect.anything(),
            );
            expect(mockRunQualityGate).toHaveBeenCalledWith(expect.objectContaining({ project: 'proj1' }));
            expect(mockBuildIncidentReport).toHaveBeenCalledWith(
                expect.any(Number),
                expect.any(Number),
                expect.any(String),
                expect.any(Array),
                expect.any(Number),
                expect.anything(),
            );
        });

        it('writes exactly one report file with the project-specific path', () => {
            expect.hasAssertions();

            seedTwoRunsHub();
            generateWeeklyQualityReport();

            expect(mockPrintError).not.toHaveBeenCalled();
            expect(mockWriteReport).toHaveBeenCalledTimes(1);

            const writtenPath = mockWriteReport.mock.calls[0]?.[0] as string;

            expect(writtenPath).toContain('weekly-quality-proj1.html');
        });

        it('renders every dashboard section in the generated HTML', () => {
            expect.hasAssertions();

            seedTwoRunsHub();
            generateWeeklyQualityReport();

            const calls = mockWriteReport.mock.calls;
            const writtenHtml = calls[calls.length - 1]?.[1] as string;

            expect(writtenHtml).toContain('<h1>Weekly Quality Report — proj1</h1>');
            expect(writtenHtml).toContain('<h2>Quality Gate</h2>');
            expect(writtenHtml).toContain('<h2>Cross-Squad Benchmark</h2>');
            expect(writtenHtml).toContain('<h2>Release Score</h2>');
            expect(writtenHtml).toContain('<h2>Silent Regression</h2>');
            expect(writtenHtml).toContain('<h2>Incident Investigation Report</h2>');
            expect(writtenHtml).toContain('<h2>Pipeline Cost Analytics</h2>');
            expect(writtenHtml).toContain('<h2>Requirement Quality Score</h2>');
        });
    });
});
