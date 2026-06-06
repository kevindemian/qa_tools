import { expect } from 'vitest';

vi.mock('../../shared/prompt');
vi.mock('../../shared/logger');

vi.mock('../../shared/metrics', async () => ({
    loadMetrics: vi.fn(),
    calculateFlakiness: vi.fn(),
    getTrends: vi.fn(),
    saveCoverageSnapshot: vi.fn(),
}));

vi.mock('../../shared/health-score', async () => ({
    calculateHealthScore: vi.fn(),
}));

vi.mock('../../shared/flaky-auto-actions', async () => ({
    executeFlakyActions: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../shared/run-comparison', async () => ({
    compareRuns: vi.fn(),
}));

vi.mock('../coverage', async () => ({
    analyzeCoverage: vi.fn(),
}));

vi.mock('../../shared/logger', async () => ({
    rootLogger: {
        error: vi.fn(),
        child: vi.fn().mockReturnValue({ info: vi.fn(), error: vi.fn(), warn: vi.fn() }),
    },
}));

import * as promptModule from '../../shared/prompt.js';
import * as metricsModule from '../../shared/metrics.js';
import * as comparisonModule from '../../shared/run-comparison.js';
import * as flakyActionsModule from '../../shared/flaky-auto-actions.js';
import * as healthScoreModule from '../../shared/health-score.js';
import * as coverageModule from '../coverage.js';
import case19Module from './case19.js';
import { createMockContext } from '../../shared/test-utils/factories/context-factory.js';

const baseContext = createMockContext();

beforeEach(() => {
    vi.clearAllMocks();
});

describe('case19 — History & Coverage', () => {
    it('displays history when option a is selected', async () => {
        const prompt = vi.mocked(promptModule);
        const metrics = vi.mocked(metricsModule);

        prompt.showSelect.mockResolvedValueOnce('a').mockResolvedValueOnce('0');

        metrics.loadMetrics.mockReturnValueOnce({
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
        });

        metrics.calculateFlakiness.mockReturnValueOnce([]);
        metrics.getTrends.mockReturnValueOnce([]);

        const mod = case19Module;
        await mod.handler(baseContext);

        expect(prompt.tableView).toHaveBeenCalled();
        expect(prompt.title).toHaveBeenCalledWith('Histórico de execuções');
    });

    it('displays coverage when option b is selected', async () => {
        const prompt = vi.mocked(promptModule);
        const coverage = vi.mocked(coverageModule);
        const metrics = vi.mocked(metricsModule);

        prompt.showSelect.mockResolvedValueOnce('b').mockResolvedValueOnce('0');

        coverage.analyzeCoverage.mockResolvedValueOnce({
            totalIssues: 10,
            totalSteps: 25,
            mappedIssues: 6,
            unmappedSteps: ['TEST-3', 'TEST-7'],
            gapsByEpic: { 'EPIC-1': ['TEST-3'] },
            coveragePct: 60,
        });

        const mod = case19Module;
        await mod.handler(baseContext);

        expect(coverage.analyzeCoverage).toHaveBeenCalledWith(baseContext.jiraResource, 'TEST');
        expect(metrics.saveCoverageSnapshot).toHaveBeenCalledWith({
            timestamp: expect.any(String),
            project: 'TEST',
            totalIssues: 10,
            mappedIssues: 6,
            coveragePct: 60,
        });
        expect(prompt.tableView).toHaveBeenCalled();
        expect(baseContext.pushHistory).toHaveBeenCalledWith('coverage-analysis', '60% coverage', 'ok');
    });

    it('handles empty metrics gracefully', async () => {
        const prompt = vi.mocked(promptModule);
        const metrics = vi.mocked(metricsModule);

        prompt.showSelect.mockResolvedValueOnce('a').mockResolvedValueOnce('0');

        metrics.loadMetrics.mockReturnValueOnce({ runs: [] });

        const mod = case19Module;
        await mod.handler(baseContext);

        expect(prompt.warn).toHaveBeenCalledWith('Nenhuma execução registrada.');
    });

    it('returns when user selects voltar', async () => {
        const prompt = vi.mocked(promptModule);
        prompt.showSelect.mockResolvedValueOnce('0');

        const mod = case19Module;
        await mod.handler(baseContext);

        expect(prompt.tableView).not.toHaveBeenCalled();
    });

    it('displays history comparison, flaky tests and trends when multiple runs exist', async () => {
        const prompt = vi.mocked(promptModule);
        const metrics = vi.mocked(metricsModule);
        const comparison = vi.mocked(comparisonModule);

        prompt.showSelect.mockResolvedValueOnce('a').mockResolvedValueOnce('0');

        metrics.loadMetrics.mockReturnValueOnce({
            runs: [
                {
                    timestamp: '2024-01-15T10:00:00Z',
                    project: 'TEST',
                    total: 10,
                    passed: 8,
                    failed: 2,
                    skipped: 0,
                    duration: 5000,
                    tests: [],
                },
                {
                    timestamp: '2024-01-16T10:00:00Z',
                    project: 'TEST',
                    total: 10,
                    passed: 9,
                    failed: 1,
                    skipped: 0,
                    duration: 4500,
                    tests: [],
                },
            ],
        });

        metrics.calculateFlakiness.mockReturnValueOnce([
            { title: 'Flaky Test', passCount: 1, failCount: 1, skipCount: 0, totalRuns: 2, rate: 0.5 },
        ]);
        metrics.getTrends.mockReturnValueOnce([{ label: '2024-01-15', total: 10, failed: 2, passRate: 80 }]);

        comparison.compareRuns.mockResolvedValueOnce('Second run improved by 10%');

        const mod = case19Module;
        await mod.handler(baseContext);

        expect(comparison.compareRuns).toHaveBeenCalled();
        expect(prompt.title).toHaveBeenCalledWith('Testes com flakiness');
        expect(prompt.title).toHaveBeenCalledWith('Tendência');
    });

    it('handles coverage analysis error', async () => {
        const prompt = vi.mocked(promptModule);
        const coverage = vi.mocked(coverageModule);

        prompt.showSelect.mockResolvedValueOnce('b').mockResolvedValueOnce('0');
        coverage.analyzeCoverage.mockRejectedValueOnce(new Error('Jira API error'));

        const mod = case19Module;
        await mod.handler(baseContext);

        expect(prompt.printError).toHaveBeenCalledWith('Erro ao analisar cobertura', expect.any(Error));
    });

    it('handles compareRuns returning null (falsy analysis)', async () => {
        const prompt = vi.mocked(promptModule);
        const metrics = vi.mocked(metricsModule);
        const comparison = vi.mocked(comparisonModule);

        prompt.showSelect.mockResolvedValueOnce('a').mockResolvedValueOnce('0');

        metrics.loadMetrics.mockReturnValueOnce({
            runs: [
                {
                    timestamp: '2024-01-15T10:00:00Z',
                    project: 'TEST',
                    total: 10,
                    passed: 8,
                    failed: 2,
                    skipped: 0,
                    duration: 5000,
                    tests: [],
                },
                {
                    timestamp: '2024-01-16T10:00:00Z',
                    project: 'TEST',
                    total: 10,
                    passed: 9,
                    failed: 1,
                    skipped: 0,
                    duration: 4500,
                    tests: [],
                },
            ],
        });
        metrics.calculateFlakiness.mockReturnValueOnce([]);
        metrics.getTrends.mockReturnValueOnce([]);

        comparison.compareRuns.mockResolvedValueOnce('');

        const mod = case19Module;
        await mod.handler(baseContext);

        expect(comparison.compareRuns).toHaveBeenCalled();
        expect(prompt.info).not.toHaveBeenCalledWith(expect.stringContaining('Análise comparativa'));
    });

    it('shows coverage without unmapped steps or gaps', async () => {
        const prompt = vi.mocked(promptModule);
        const coverage = vi.mocked(coverageModule);

        prompt.showSelect.mockResolvedValueOnce('b').mockResolvedValueOnce('0');

        coverage.analyzeCoverage.mockResolvedValueOnce({
            totalIssues: 5,
            totalSteps: 10,
            mappedIssues: 5,
            unmappedSteps: [],
            gapsByEpic: {},
            coveragePct: 100,
        });

        const mod = case19Module;
        await mod.handler(baseContext);

        expect(prompt.warn).not.toHaveBeenCalled();
        expect(prompt.title).not.toHaveBeenCalledWith('Gaps por épico');
    });

    it('shows health score when enough runs exist', async () => {
        const prompt = vi.mocked(promptModule);
        const metrics = vi.mocked(metricsModule);
        const healthScore = vi.mocked(healthScoreModule);

        prompt.showSelect.mockResolvedValueOnce('a').mockResolvedValueOnce('0');

        metrics.loadMetrics.mockReturnValueOnce({
            runs: Array.from({ length: 10 }, (_, i) => ({
                timestamp: `2026-01-${String(i + 1).padStart(2, '0')}T10:00:00Z`,
                project: 'TEST',
                total: 10,
                passed: 9,
                failed: 1,
                skipped: 0,
                duration: 100,
                tests: [],
            })),
            coverageHistory: [
                { timestamp: '2026-01-01', project: 'TEST', totalIssues: 100, mappedIssues: 80, coveragePct: 80 },
            ],
        });
        metrics.calculateFlakiness.mockReturnValueOnce([]);
        metrics.getTrends.mockReturnValueOnce([]);
        healthScore.calculateHealthScore.mockReturnValueOnce({
            overall: 85,
            grade: 'good',
            qualityGate: 'pass',
            runCount: 10,
            timestamp: '2026-01-10',
            dimensions: {
                passRate: { score: 90, status: 'pass' },
                flakyRate: { score: 80, status: 'pass' },
                coverage: { score: 85, status: 'pass' },
                suiteSpeed: { score: 75, status: 'pass' },
            },
        });

        const mod = case19Module;
        await mod.handler(baseContext);

        expect(healthScore.calculateHealthScore).toHaveBeenCalled();
        expect(prompt.tableView).toHaveBeenCalledWith(
            expect.arrayContaining([expect.objectContaining({ Dimensão: 'Pass Rate', Score: 90 })]),
            expect.any(Array),
        );
    });

    it('executes flaky auto-actions when confirmed', async () => {
        const prompt = vi.mocked(promptModule);
        const metrics = vi.mocked(metricsModule);
        const flakyActions = vi.mocked(flakyActionsModule);
        const comparison = vi.mocked(comparisonModule);

        prompt.showSelect.mockResolvedValueOnce('a').mockResolvedValueOnce('0');
        prompt.askConfirm.mockResolvedValueOnce(true);

        const runData = {
            timestamp: '2026-01-01T10:00:00Z',
            project: 'TEST',
            total: 10,
            passed: 5,
            failed: 5,
            skipped: 0,
            duration: 100,
            tests: [{ title: 'FlakyTest', state: 'failed' as const, duration: 100 }],
        };
        metrics.loadMetrics.mockReturnValueOnce({ runs: [runData, runData] });
        metrics.calculateFlakiness.mockReturnValueOnce([
            { title: 'FlakyTest', passCount: 1, failCount: 1, skipCount: 0, totalRuns: 2, rate: 0.5 },
        ]);
        metrics.getTrends.mockReturnValueOnce([]);
        comparison.compareRuns.mockResolvedValueOnce('analysis');
        flakyActions.executeFlakyActions.mockResolvedValueOnce([
            {
                action: 'create_bug',
                testTitle: 'FlakyTest',
                flakyRate: 0.5,
                passCount: 1,
                failCount: 1,
                totalRuns: 2,
                lastErrorMessages: [],
                jiraBugKey: 'BUG-1',
                reason: 'flaky',
            },
        ]);

        const mod = case19Module;
        await mod.handler(baseContext);

        expect(flakyActions.executeFlakyActions).toHaveBeenCalled();
        expect(prompt.info).toHaveBeenCalledWith(expect.stringContaining('auto-action'));
    });

    it('shows history without flaky or trends data', async () => {
        const prompt = vi.mocked(promptModule);
        const metrics = vi.mocked(metricsModule);
        const comparison = vi.mocked(comparisonModule);

        prompt.showSelect.mockResolvedValueOnce('a').mockResolvedValueOnce('0');

        metrics.loadMetrics.mockReturnValueOnce({
            runs: [
                {
                    timestamp: '2024-01-15T10:00:00Z',
                    project: 'TEST',
                    total: 10,
                    passed: 8,
                    failed: 2,
                    skipped: 0,
                    duration: 5000,
                    tests: [],
                },
                {
                    timestamp: '2024-01-16T10:00:00Z',
                    project: 'TEST',
                    total: 10,
                    passed: 9,
                    failed: 1,
                    skipped: 0,
                    duration: 4500,
                    tests: [],
                },
            ],
        });
        metrics.calculateFlakiness.mockReturnValueOnce([]);
        metrics.getTrends.mockReturnValueOnce([]);
        comparison.compareRuns.mockResolvedValueOnce('analysis result');

        const mod = case19Module;
        await mod.handler(baseContext);

        expect(prompt.tableView).toHaveBeenCalled();
    });

    it('handles executeFlakyActions error', async () => {
        const prompt = vi.mocked(promptModule);
        const metrics = vi.mocked(metricsModule);
        const flakyActions = vi.mocked(flakyActionsModule);
        const comparison = vi.mocked(comparisonModule);

        prompt.showSelect.mockResolvedValueOnce('a').mockResolvedValueOnce('0');
        prompt.askConfirm.mockResolvedValueOnce(true);

        const runData = {
            timestamp: '2026-01-01T10:00:00Z',
            project: 'TEST',
            total: 10,
            passed: 5,
            failed: 5,
            skipped: 0,
            duration: 100,
            tests: [{ title: 'FlakyTest', state: 'failed' as const, duration: 100 }],
        };
        metrics.loadMetrics.mockReturnValueOnce({ runs: [runData, runData] });
        metrics.calculateFlakiness.mockReturnValueOnce([
            { title: 'FlakyTest', passCount: 1, failCount: 1, skipCount: 0, totalRuns: 2, rate: 0.5 },
        ]);
        metrics.getTrends.mockReturnValueOnce([]);
        comparison.compareRuns.mockResolvedValueOnce('analysis');
        flakyActions.executeFlakyActions.mockRejectedValueOnce(new Error('API error'));

        const mod = case19Module;
        await mod.handler(baseContext);

        expect(prompt.printError).toHaveBeenCalledWith('Erro ao executar auto-actions', expect.any(Error));
    });

    it('handles run with total=0 to cover Rate branch', async () => {
        const prompt = vi.mocked(promptModule);
        const metrics = vi.mocked(metricsModule);
        const comparison = vi.mocked(comparisonModule);

        prompt.showSelect.mockResolvedValueOnce('a').mockResolvedValueOnce('0');

        metrics.loadMetrics.mockReturnValueOnce({
            runs: [
                {
                    timestamp: '2024-01-15T10:00:00Z',
                    project: 'TEST',
                    total: 0,
                    passed: 0,
                    failed: 0,
                    skipped: 0,
                    duration: 0,
                    tests: [],
                },
            ],
        });
        metrics.calculateFlakiness.mockReturnValueOnce([]);
        metrics.getTrends.mockReturnValueOnce([]);
        comparison.compareRuns.mockResolvedValueOnce('');

        const mod = case19Module;
        await mod.handler(baseContext);

        expect(prompt.tableView).toHaveBeenCalled();
    });

    it('handles flaky actions with non-matching action types', async () => {
        const prompt = vi.mocked(promptModule);
        const metrics = vi.mocked(metricsModule);
        const flakyActions = vi.mocked(flakyActionsModule);
        const comparison = vi.mocked(comparisonModule);

        prompt.showSelect.mockResolvedValueOnce('a').mockResolvedValueOnce('0');
        prompt.askConfirm.mockResolvedValueOnce(true);

        const runData = {
            timestamp: '2026-01-01T10:00:00Z',
            project: 'TEST',
            total: 10,
            passed: 5,
            failed: 5,
            skipped: 0,
            duration: 100,
            tests: [{ title: 'FlakyTest', state: 'failed' as const, duration: 100 }],
        };
        metrics.loadMetrics.mockReturnValueOnce({ runs: [runData, runData] });
        metrics.calculateFlakiness.mockReturnValueOnce([
            { title: 'FlakyTest', passCount: 1, failCount: 1, skipCount: 0, totalRuns: 2, rate: 0.5 },
        ]);
        metrics.getTrends.mockReturnValueOnce([]);
        comparison.compareRuns.mockResolvedValueOnce('analysis');
        flakyActions.executeFlakyActions.mockResolvedValueOnce([
            {
                action: 'none' as const,
                testTitle: 'FlakyTest',
                flakyRate: 0.5,
                passCount: 1,
                failCount: 1,
                totalRuns: 2,
                lastErrorMessages: [],
                reason: 'no actionable flaky',
            },
        ]);

        const mod = case19Module;
        await mod.handler(baseContext);

        expect(prompt.info).toHaveBeenCalledWith('0 auto-action(s) executada(s) para testes flaky.');
    });

    it('shows health score section when 5+ runs exist', async () => {
        const prompt = vi.mocked(promptModule);
        const metrics = vi.mocked(metricsModule);
        const healthScore = vi.mocked(healthScoreModule);
        const comparison = vi.mocked(comparisonModule);

        prompt.showSelect.mockResolvedValueOnce('a').mockResolvedValueOnce('0');

        metrics.loadMetrics.mockReturnValueOnce({
            runs: Array.from({ length: 5 }, (_, i) => ({
                timestamp: `2024-01-${String(i + 1).padStart(2, '0')}T10:00:00Z`,
                project: 'TEST',
                total: 10,
                passed: 8,
                failed: 2,
                skipped: 0,
                duration: 100,
                tests: [],
            })),
        });
        metrics.calculateFlakiness.mockReturnValueOnce([]);
        metrics.getTrends.mockReturnValueOnce([]);
        comparison.compareRuns.mockResolvedValueOnce('analysis');
        healthScore.calculateHealthScore.mockReturnValueOnce({
            overall: 85,
            grade: 'good',
            qualityGate: 'pass',
            runCount: 5,
            timestamp: '2024-01-05',
            dimensions: {
                passRate: { score: 90, status: 'pass' as const },
                flakyRate: { score: 80, status: 'pass' as const },
                coverage: { score: 70, status: 'pass' as const },
                suiteSpeed: { score: 95, status: 'pass' as const },
            },
        });

        const mod = case19Module;
        await mod.handler(baseContext);

        expect(healthScore.calculateHealthScore).toHaveBeenCalled();
        expect(prompt.title).toHaveBeenCalledWith(expect.stringContaining('Test Suite Health'));
    });

    it('shows coverage with gapsByEpic data', async () => {
        const prompt = vi.mocked(promptModule);
        const coverage = vi.mocked(coverageModule);

        prompt.showSelect.mockResolvedValueOnce('b').mockResolvedValueOnce('0');

        coverage.analyzeCoverage.mockResolvedValueOnce({
            totalIssues: 5,
            totalSteps: 10,
            mappedIssues: 5,
            unmappedSteps: [],
            gapsByEpic: { 'Epic-1': ['PROJ-1', 'PROJ-2'] },
            coveragePct: 100,
        });

        const mod = case19Module;
        await mod.handler(baseContext);

        expect(prompt.info).toHaveBeenCalledWith(expect.stringContaining('Epic-1'));
    });
});
