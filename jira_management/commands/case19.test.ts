jest.mock('../../shared/prompt', () => ({
    success: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    title: jest.fn(),
    divider: jest.fn(),
    ask: jest.fn().mockResolvedValue(''),
    askConfirm: jest.fn().mockResolvedValue(true),
    printError: jest.fn(),
    tableView: jest.fn(),
    showSelect: jest.fn().mockResolvedValue('0'),
    withSpinner: jest.fn((_label: string, fn: () => Promise<unknown>) => fn()),
}));

jest.mock('../../shared/metrics', () => ({
    loadMetrics: jest.fn(),
    calculateFlakiness: jest.fn(),
    getTrends: jest.fn(),
    saveCoverageSnapshot: jest.fn(),
}));

jest.mock('../../shared/run-comparison', () => ({
    compareRuns: jest.fn(),
}));

jest.mock('../coverage', () => ({
    analyzeCoverage: jest.fn(),
}));

jest.mock('../../shared/logger', () => ({
    rootLogger: {
        error: jest.fn(),
        child: jest.fn().mockReturnValue({ info: jest.fn(), error: jest.fn(), warn: jest.fn() }),
    },
}));

const mockSessionContext: Record<string, unknown> = {
    inMemoryTasksId: [],
    inMemoryTasksText: [],
    sessionCounters: [],
    project_name: 'TEST',
    isBusy: false,
    results: [],
    lastOperation: '',
    createPackageManager: jest.fn(),
};

const mockJiraResource = {
    searchJiraIssues: jest.fn(),
};

const baseContext = {
    jiraResource: mockJiraResource,
    jiraResourceXray: {},
    linkManager: {},
    linkManagerXray: {},
    csvResource: {},
    ctx: mockSessionContext,
    pushHistory: jest.fn(),
    printSessionSummary: jest.fn(),
    base_url: 'https://jira.test.com',
    sessionLog: { child: jest.fn().mockReturnValue({ info: jest.fn(), error: jest.fn() }) },
};

beforeEach(() => {
    jest.clearAllMocks();
});

describe('case19 — History & Coverage', () => {
    it('displays history when option a is selected', async () => {
        const prompt = require('../../shared/prompt');
        const metrics = require('../../shared/metrics');

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

        const mod = require('./case19').default;
        await mod.handler(baseContext);

        expect(prompt.tableView).toHaveBeenCalled();
        expect(prompt.title).toHaveBeenCalledWith('Histórico de execuções');
    });

    it('displays coverage when option b is selected', async () => {
        const prompt = require('../../shared/prompt');
        const coverage = require('../coverage');
        const metrics = require('../../shared/metrics');

        prompt.showSelect.mockResolvedValueOnce('b').mockResolvedValueOnce('0');

        coverage.analyzeCoverage.mockResolvedValueOnce({
            totalIssues: 10,
            totalSteps: 25,
            mappedIssues: 6,
            unmappedSteps: ['TEST-3', 'TEST-7'],
            gapsByEpic: { 'EPIC-1': ['TEST-3'] },
            coveragePct: 60,
        });

        const mod = require('./case19').default;
        await mod.handler(baseContext);

        expect(coverage.analyzeCoverage).toHaveBeenCalledWith(mockJiraResource, 'TEST');
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
        const prompt = require('../../shared/prompt');
        const metrics = require('../../shared/metrics');

        prompt.showSelect.mockResolvedValueOnce('a').mockResolvedValueOnce('0');

        metrics.loadMetrics.mockReturnValueOnce({ runs: [] });

        const mod = require('./case19').default;
        await mod.handler(baseContext);

        expect(prompt.warn).toHaveBeenCalledWith('Nenhuma execução registrada.');
    });

    it('returns when user selects voltar', async () => {
        const prompt = require('../../shared/prompt');
        prompt.showSelect.mockResolvedValueOnce('0');

        const mod = require('./case19').default;
        await mod.handler(baseContext);

        expect(prompt.tableView).not.toHaveBeenCalled();
    });

    it('displays history comparison, flaky tests and trends when multiple runs exist', async () => {
        const prompt = require('../../shared/prompt');
        const metrics = require('../../shared/metrics');
        const comparison = require('../../shared/run-comparison');

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
            { title: 'Flaky Test', passCount: 1, failCount: 1, rate: 0.5 },
        ]);
        metrics.getTrends.mockReturnValueOnce([{ label: '2024-01-15', total: 10, failed: 2, passRate: 80 }]);

        comparison.compareRuns.mockResolvedValueOnce('Second run improved by 10%');

        const mod = require('./case19').default;
        await mod.handler(baseContext);

        expect(comparison.compareRuns).toHaveBeenCalled();
        expect(prompt.title).toHaveBeenCalledWith('Testes com flakiness');
        expect(prompt.title).toHaveBeenCalledWith('Tendência');
    });

    it('handles coverage analysis error', async () => {
        const prompt = require('../../shared/prompt');
        const coverage = require('../coverage');

        prompt.showSelect.mockResolvedValueOnce('b').mockResolvedValueOnce('0');
        coverage.analyzeCoverage.mockRejectedValueOnce(new Error('Jira API error'));

        const mod = require('./case19').default;
        await mod.handler(baseContext);

        expect(prompt.printError).toHaveBeenCalledWith('Erro ao analisar cobertura', expect.any(Error));
    });

    it('handles compareRuns returning null (falsy analysis)', async () => {
        const prompt = require('../../shared/prompt');
        const metrics = require('../../shared/metrics');
        const comparison = require('../../shared/run-comparison');

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

        comparison.compareRuns.mockResolvedValueOnce(null);

        const mod = require('./case19').default;
        await mod.handler(baseContext);

        expect(comparison.compareRuns).toHaveBeenCalled();
        expect(prompt.info).not.toHaveBeenCalledWith(expect.stringContaining('Análise comparativa'));
    });

    it('shows coverage without unmapped steps or gaps', async () => {
        const prompt = require('../../shared/prompt');
        const coverage = require('../coverage');

        prompt.showSelect.mockResolvedValueOnce('b').mockResolvedValueOnce('0');

        coverage.analyzeCoverage.mockResolvedValueOnce({
            totalIssues: 5,
            totalSteps: 10,
            mappedIssues: 5,
            unmappedSteps: [],
            gapsByEpic: {},
            coveragePct: 100,
        });

        const mod = require('./case19').default;
        await mod.handler(baseContext);

        expect(prompt.warn).not.toHaveBeenCalled();
        expect(prompt.title).not.toHaveBeenCalledWith('Gaps por épico');
    });

    it('shows history without flaky or trends data', async () => {
        const prompt = require('../../shared/prompt');
        const metrics = require('../../shared/metrics');
        const comparison = require('../../shared/run-comparison');

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

        const mod = require('./case19').default;
        await mod.handler(baseContext);

        expect(prompt.tableView).toHaveBeenCalled();
    });
});
