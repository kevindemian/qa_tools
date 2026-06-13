import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generatePrReport } from '../pr-report-core.js';
import type { FlatTest } from '../result_parser.js';

const mockMetrics = vi.hoisted(() => ({
    loadMetrics: vi.fn(),
    saveParseResult: vi.fn(),
    calculateFlakiness: vi.fn(),
    getTrends: vi.fn(),
}));

const mockHealthScore = vi.hoisted(() => ({
    calculateHealthScore: vi.fn(),
}));

const mockQualityGate = vi.hoisted(() => ({
    runQualityGate: vi.fn(),
}));

const mockCheckRun = vi.hoisted(() => ({
    createCheckRun: vi.fn(),
}));

const mockPRComment = vi.hoisted(() => ({
    postPrComment: vi.fn(),
}));

const mockHtml = vi.hoisted(() => ({
    generateHtmlReport: vi.fn(),
}));

const mockCoverage = vi.hoisted(() => ({
    resolveCoverage: vi.fn(),
    readIstanbulCoverage: vi.fn(),
}));

vi.mock('../metrics.js', () => mockMetrics);
vi.mock('../health-score.js', () => mockHealthScore);
vi.mock('../quality-gate.js', () => mockQualityGate);
vi.mock('../github-check-run.js', () => mockCheckRun);
vi.mock('../github-pr-comment.js', () => mockPRComment);
vi.mock('../report-html.js', () => mockHtml);
vi.mock('../coverage-source.js', () => mockCoverage);

const sampleTest: FlatTest = {
    title: 'should work',
    state: 'passed',
    duration: 100,
};

const failedTest: FlatTest = {
    title: 'should fail',
    state: 'failed',
    duration: 200,
    error: 'AssertionError: expected 1 to equal 2',
};

const skippedTest: FlatTest = {
    title: 'should skip',
    state: 'skipped',
    duration: 0,
};

const defaultStats = {
    passed: 8,
    failed: 1,
    skipped: 1,
    total: 10,
    duration: 5000,
};

const defaultHealthScore = {
    score: 80,
    grade: 'B' as const,
    passRate: 80,
    metrics: {
        passRate: 80,
        failRate: 10,
        skipRate: 10,
        flakyRate: 0,
        quarantineRate: 0,
        stability: 100,
        trend: 0,
        passRateScore: 80,
        failRateScore: 90,
        skipRateScore: 90,
        flakyRateScore: 100,
        quarantineRatioScore: 100,
        stabilityScore: 100,
        trendScore: 100,
    },
};

beforeEach(() => {
    vi.clearAllMocks();
    mockMetrics.loadMetrics.mockReturnValue({ runs: [] });
    mockMetrics.calculateFlakiness.mockReturnValue([]);
    mockMetrics.getTrends.mockReturnValue({ direction: 'stable' as const, change: 0 });
    mockHealthScore.calculateHealthScore.mockReturnValue(defaultHealthScore);
    mockQualityGate.runQualityGate.mockReturnValue(null);
    mockCheckRun.createCheckRun.mockResolvedValue(undefined);
    mockPRComment.postPrComment.mockResolvedValue(undefined);
    mockHtml.generateHtmlReport.mockReturnValue('<html>mock report</html>');
    mockCoverage.resolveCoverage.mockReturnValue(undefined);
});

describe('generatePrReport', () => {
    it('returns healthScore and passRate for basic test data', async () => {
        const result = await generatePrReport({
            tests: [sampleTest, failedTest, skippedTest],
            stats: defaultStats,
        });

        expect(result.healthScore).toEqual(defaultHealthScore);
        expect(result.passRate).toBe(80);
    });

    it('generates HTML report at default path when no htmlOutputPath given', async () => {
        const result = await generatePrReport({
            tests: [sampleTest],
            stats: { passed: 1, failed: 0, skipped: 0, total: 1, duration: 100 },
        });

        expect(mockHtml.generateHtmlReport).toHaveBeenCalledTimes(1);
        expect(result.htmlPath).toContain('reports/pr-report.html');
    });

    it('uses custom htmlOutputPath when provided', async () => {
        const result = await generatePrReport({
            tests: [sampleTest],
            stats: { passed: 1, failed: 0, skipped: 0, total: 1, duration: 100 },
            htmlOutputPath: '/tmp/custom-report.html',
        });

        expect(result.htmlPath).toBe('/tmp/custom-report.html');
    });

    it('includes coverage source in HTML options when coverage is resolved', async () => {
        mockCoverage.resolveCoverage.mockReturnValue({
            source: 'istanbul',
            coveragePct: 85,
            lines: 85,
            statements: 85,
            functions: 85,
            branches: 80,
        });

        const result = await generatePrReport({
            tests: [sampleTest],
            stats: { passed: 1, failed: 0, skipped: 0, total: 1, duration: 100 },
        });

        expect(mockHtml.generateHtmlReport).toHaveBeenCalledWith(
            expect.any(Array),
            expect.objectContaining({ coverageSource: 'istanbul' }),
        );
        expect(result.healthScore).toEqual(defaultHealthScore);
    });

    it('passes diffComparison to HTML options when provided', async () => {
        const diff = {
            newFailures: [failedTest],
            newPasses: [],
            flaky: [],
        };

        await generatePrReport({
            tests: [sampleTest, failedTest],
            stats: defaultStats,
            diffComparison: diff,
        });

        expect(mockHtml.generateHtmlReport).toHaveBeenCalledWith(
            expect.any(Array),
            expect.objectContaining({ diffComparison: diff }),
        );
    });

    it('runs quality gate when not skipped', async () => {
        const qgResult = {
            overall: 'pass' as const,
            score: 90,
            checks: [{ name: 'Pass Rate', status: 'pass' as const, score: 90, threshold: 80 }],
        };
        mockQualityGate.runQualityGate.mockReturnValue(qgResult);

        await generatePrReport({
            tests: [sampleTest],
            stats: { passed: 1, failed: 0, skipped: 0, total: 1, duration: 100 },
            skipQuality: false,
        });

        expect(mockQualityGate.runQualityGate).toHaveBeenCalled();
        expect(mockCheckRun.createCheckRun).toHaveBeenCalledWith(
            expect.objectContaining({
                name: 'Quality Gate',
                conclusion: 'success',
            }),
        );
    });

    it('skips quality gate when skipQuality is true', async () => {
        await generatePrReport({
            tests: [sampleTest],
            stats: { passed: 1, failed: 0, skipped: 0, total: 1, duration: 100 },
            skipQuality: true,
        });

        expect(mockQualityGate.runQualityGate).not.toHaveBeenCalled();
        expect(mockCheckRun.createCheckRun).not.toHaveBeenCalled();
    });

    it('skips AI section when skipAi is true', async () => {
        const result = await generatePrReport({
            tests: [sampleTest, failedTest],
            stats: defaultStats,
            skipAi: true,
        });

        expect(result.healthScore).toBeDefined();
        expect(mockPRComment.postPrComment).toHaveBeenCalled();
    });

    it('skips flaky section when skipFlaky is true', async () => {
        mockMetrics.calculateFlakiness.mockReturnValue([
            { title: 'flaky test', rate: 0.5, passCount: 3, totalRuns: 6 },
        ]);

        await generatePrReport({
            tests: [sampleTest],
            stats: { passed: 1, failed: 0, skipped: 0, total: 1, duration: 100 },
            skipFlaky: true,
        });

        expect(mockPRComment.postPrComment).toHaveBeenCalled();
    });

    it('survives empty test list', async () => {
        const result = await generatePrReport({
            tests: [],
            stats: { passed: 0, failed: 0, skipped: 0, total: 0, duration: 0 },
        });

        expect(result.healthScore).toEqual(defaultHealthScore);
        expect(result.passRate).toBe(0);
    });

    it('handles health score with coverage override', async () => {
        mockCoverage.resolveCoverage.mockReturnValue({
            source: 'istanbul',
            coveragePct: 92,
            lines: 92,
            statements: 92,
            functions: 90,
            branches: 88,
        });

        await generatePrReport({
            tests: [sampleTest],
            stats: { passed: 1, failed: 0, skipped: 0, total: 1, duration: 100 },
        });

        expect(mockHealthScore.calculateHealthScore).toHaveBeenCalledWith(
            expect.any(Object),
            expect.objectContaining({ coverageOverride: 92 }),
        );
    });

    it('includes provenance metadata in PR comment footer when health score has provenance', async () => {
        const healthWithProvenance = {
            ...defaultHealthScore,
            provenance: [
                {
                    dimension: 'passRate',
                    source: 'DORA State of DevOps 2025',
                    standard: 'DORA',
                    formula: 'passed/(passed+failed)×100',
                    thresholdBasis: 'Elite ≥95%',
                    configurable: true,
                },
            ],
        };
        mockHealthScore.calculateHealthScore.mockReturnValueOnce(healthWithProvenance);
        mockQualityGate.runQualityGate.mockReturnValueOnce({
            overall: 'pass' as const,
            score: 85,
            checks: [{ name: 'passRate', status: 'pass' as const, score: 90, threshold: 80 }],
        });
        mockCheckRun.createCheckRun.mockResolvedValueOnce(undefined);
        mockPRComment.postPrComment.mockResolvedValueOnce({
            html_url: 'https://github.com/owner/repo/pull/42#issuecomment-1',
        });

        await generatePrReport({
            tests: [sampleTest],
            stats: { passed: 1, failed: 0, skipped: 0, total: 1, duration: 100 },
            project: 'test-proj',
        });

        const calledWith = String(mockPRComment.postPrComment.mock.calls[0]?.[0]);
        expect(typeof calledWith).toBe('string');
        expect(calledWith).toContain('Methodology & References');
        expect(calledWith).toContain('passed/(passed+failed)×100');
        expect(calledWith).toContain('DORA State of DevOps 2025');
    });
});
