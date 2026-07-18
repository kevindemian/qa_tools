import { expect } from 'vitest';

vi.mock('../../../shared/ui/prompt.js');
vi.mock('../../../shared/logger');

vi.mock('../../../shared/data-hub/global-hub.js', () => ({
    getDataHub: vi.fn(),
}));

vi.mock('../../../shared/data-hub/compute/flakiness-entries.js', () => ({
    calcFlakinessEntries: vi.fn(),
}));

vi.mock('../../../shared/data-hub/compute/metrics-trends.js', () => ({
    calcMetricsTrends: vi.fn(),
}));

vi.mock('../../../shared/quality/health-score.js', () => ({
    calculateHealthScore: vi.fn(),
}));

vi.mock('../../../shared/quality/run-comparison.js', () => ({
    compareRuns: vi.fn(),
}));

vi.mock('../../coverage', () => ({
    analyzeCoverage: vi.fn(),
}));

vi.mock('../../../shared/logger', () => ({
    rootLogger: {
        error: vi.fn(),
        child: vi.fn().mockReturnValue({ info: vi.fn(), error: vi.fn(), warn: vi.fn() }),
    },
}));

import * as promptModule from '../../../shared/ui/prompt.js';
import * as globalHubModule from '../../../shared/data-hub/global-hub.js';
import * as flakinessModule from '../../../shared/data-hub/compute/flakiness-entries.js';
import * as trendsModule from '../../../shared/data-hub/compute/metrics-trends.js';
import * as healthScoreModule from '../../../shared/quality/health-score.js';
import * as coverageModule from '../../coverage.js';
import case19Module from '../case19.js';
import { createMockContext } from '../../../shared/test-utils/factories/context-factory.js';

const baseContext = createMockContext();

function createMockHub(overrides: Record<string, unknown> = {}) {
    return {
        saveRun: vi.fn(),
        saveCoverageSnapshot: vi.fn(),
        loadCoverageHistory: vi.fn().mockReturnValue([]),
        saveFailureClassification: vi.fn(),
        loadFailureClassifications: vi.fn().mockReturnValue([]),
        saveMetricsStore: vi.fn(),
        saveParseResult: vi.fn(),
        saveQualityMetrics: vi.fn(),
        loadQualityMetricsHistory: vi.fn().mockReturnValue([]),
        flush: vi.fn(),
        computed: { metricsRuns: [] },
        raw: { coverageHistory: [] },
        ...overrides,
    };
}

describe('Case19', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('Case19 — History & Coverage', () => {
        it('displays history when option a is selected', async () => {
            expect.hasAssertions();

            const prompt = vi.mocked(promptModule);
            const persistence = vi.mocked(globalHubModule);
            const flakiness = vi.mocked(flakinessModule);
            const trends = vi.mocked(trendsModule);

            prompt.showSelect.mockReset();
            prompt.showSelect.mockResolvedValueOnce('a').mockResolvedValueOnce('0');

            const mockStore = {
                runs: [
                    {
                        timestamp: '2024-01-15T10:00:00Z',
                        project: 'TEST',
                        total: 10,
                        passed: 8,
                        failed: 2,
                        skipped: 0,
                        duration: 5000,
                        tests: [
                            { title: 'Test A', state: 'passed', duration: 100 },
                            { title: 'Test B', state: 'failed', duration: 200 },
                        ],
                    },
                ],
                coverageHistory: [],
            };

            persistence.getDataHub.mockReturnValue(
                createMockHub({
                    computed: { metricsRuns: mockStore.runs },
                }) as never,
            );

            flakiness.calcFlakinessEntries.mockReturnValue([]);
            trends.calcMetricsTrends.mockReturnValue([]);

            const mod = case19Module;
            await mod.handler(baseContext);

            expect(prompt.tableView).toHaveBeenCalledWith(expect.any(Array), expect.any(Array));
            expect(prompt.title).toHaveBeenCalledWith('Histórico de execuções');
        });

        it('displays coverage when option b is selected', async () => {
            expect.hasAssertions();

            const prompt = vi.mocked(promptModule);
            const coverage = vi.mocked(coverageModule);
            const persistence = vi.mocked(globalHubModule);

            prompt.showSelect.mockReset();
            prompt.showSelect.mockResolvedValueOnce('b').mockResolvedValueOnce('0');

            coverage.analyzeCoverage.mockResolvedValueOnce({
                totalIssues: 10,
                totalSteps: 25,
                mappedIssues: 6,
                unmappedSteps: ['TEST-3', 'TEST-7'],
                gapsByEpic: { 'EPIC-1': ['TEST-3'] },
                coveragePct: 60,
            });

            persistence.getDataHub.mockReturnValue(createMockHub() as never);

            const mod = case19Module;
            await mod.handler(baseContext);

            expect(coverage.analyzeCoverage).toHaveBeenCalledWith(
                baseContext.jiraResource,
                baseContext.ctx.project_name,
            );
            expect(prompt.tableView).toHaveBeenCalledWith(expect.any(Array), expect.any(Array));
        });

        it('shows warning when no runs exist', async () => {
            expect.hasAssertions();

            const prompt = vi.mocked(promptModule);
            const persistence = vi.mocked(globalHubModule);

            prompt.showSelect.mockReset();
            prompt.showSelect.mockResolvedValueOnce('a').mockResolvedValueOnce('0');

            persistence.getDataHub.mockReturnValue(createMockHub() as never);

            const mod = case19Module;
            await mod.handler(baseContext);

            expect(prompt.warn).toHaveBeenCalledWith('Nenhuma execução registrada.');
        });
    });

    describe('Case19 — Health Score', () => {
        it('shows health score when 5+ runs exist', async () => {
            expect.hasAssertions();

            const prompt = vi.mocked(promptModule);
            const persistence = vi.mocked(globalHubModule);
            const healthScore = vi.mocked(healthScoreModule);

            prompt.showSelect.mockReset();
            prompt.showSelect.mockResolvedValueOnce('a').mockResolvedValueOnce('0');

            const mockStore = {
                runs: Array.from({ length: 6 }, (_, i) => ({
                    timestamp: `2024-01-${String(i + 1).padStart(2, '0')}T10:00:00Z`,
                    project: 'TEST',
                    total: 10,
                    passed: 8,
                    failed: 2,
                    skipped: 0,
                    duration: 5000,
                    tests: [],
                })),
                coverageHistory: [],
            };

            persistence.getDataHub.mockReturnValue(
                createMockHub({
                    computed: { metricsRuns: mockStore.runs },
                }) as never,
            );

            healthScore.calculateHealthScore.mockReturnValueOnce({
                overall: 85,
                grade: 'good',
                qualityGate: 'pass',
                runCount: 6,
                timestamp: '2024-01-06T10:00:00Z',
                dimensions: {
                    passRate: { score: 90, status: 'pass' },
                    flakyRate: { score: 80, status: 'pass' },
                    coverage: { score: 85, status: 'pass' },
                    suiteSpeed: { score: 85, status: 'pass' },
                },
            } as ReturnType<typeof healthScoreModule.calculateHealthScore>);

            const mod = case19Module;
            await mod.handler(baseContext);

            expect(prompt.title).toHaveBeenCalledWith(expect.stringContaining('Test Suite Health'));
        });
    });
});
