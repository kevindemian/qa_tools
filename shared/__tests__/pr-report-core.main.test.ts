import { describe, expect, it, vi, beforeEach, afterAll } from 'vitest';

const mockMetrics = vi.hoisted(() => ({
    loadMetrics: vi.fn(),
    saveParseResult: vi.fn(),
    calculateFlakiness: vi.fn(),
    getTrends: vi.fn(),
}));
const mockHealthScore = vi.hoisted(() => ({ calculateHealthScore: vi.fn() }));
const mockQualityGate = vi.hoisted(() => ({ runQualityGate: vi.fn() }));
const mockCheckRun = vi.hoisted(() => ({ createCheckRun: vi.fn() }));
const mockPRComment = vi.hoisted(() => ({ postPrComment: vi.fn() }));
const mockHtml = vi.hoisted(() => ({ generateHtmlReport: vi.fn() }));
const mockCoverage = vi.hoisted(() => ({ resolveCoverage: vi.fn(), readIstanbulCoverage: vi.fn() }));
const mockParseResult = vi.hoisted(() => vi.fn());
const mockGetConfig = vi.hoisted(() => vi.fn());
const mockFeatureConfig = vi.hoisted(() => ({
    isAiSkipped: vi.fn(),
    isQualitySkipped: vi.fn(),
    isFlakySkipped: vi.fn(),
}));

vi.mock('fs', () => ({
    default: { mkdirSync: vi.fn(), writeFileSync: vi.fn(), existsSync: vi.fn() },
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    existsSync: vi.fn(),
}));
vi.mock('../metrics.js', () => mockMetrics);
vi.mock('../health-score.js', () => mockHealthScore);
vi.mock('../quality-gate.js', () => mockQualityGate);
vi.mock('../github-check-run.js', () => mockCheckRun);
vi.mock('../github-pr-comment.js', () => mockPRComment);
vi.mock('../report-html.js', () => mockHtml);
vi.mock('../coverage-source.js', () => mockCoverage);
vi.mock('../result_parser.js', () => ({ parseTestResultsFile: mockParseResult }));
vi.mock('../feature-config.js', () => ({
    getPrReportConfig: mockGetConfig,
    isAiSkipped: mockFeatureConfig.isAiSkipped,
    isQualitySkipped: mockFeatureConfig.isQualitySkipped,
    isFlakySkipped: mockFeatureConfig.isFlakySkipped,
}));

import fs from 'node:fs';
import { main } from '../pr-report-core.js';
import type { FlatTest } from '../result_parser.js';

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

afterAll(() => {
    delete process.env['GITHUB_STEP_SUMMARY'];
});

beforeEach(() => {
    vi.clearAllMocks();
    delete process.env['GITHUB_STEP_SUMMARY'];
    mockMetrics.loadMetrics.mockReturnValue({ runs: [] });
    mockMetrics.calculateFlakiness.mockReturnValue([]);
    mockMetrics.getTrends.mockReturnValue({ direction: 'stable' as const, change: 0 });
    mockHealthScore.calculateHealthScore.mockReturnValue(defaultHealthScore);
    mockQualityGate.runQualityGate.mockReturnValue(null);
    mockCheckRun.createCheckRun.mockResolvedValue(undefined);
    mockPRComment.postPrComment.mockResolvedValue(undefined);
    mockHtml.generateHtmlReport.mockReturnValue('<html>mock</html>');
    mockCoverage.resolveCoverage.mockReturnValue(undefined);
    mockGetConfig.mockReturnValue({
        enabled: true,
        publishTarget: 'github-ci',
        skipAi: false,
        skipQuality: false,
        skipFlaky: false,
    });
    mockFeatureConfig.isAiSkipped.mockReturnValue(false);
    mockFeatureConfig.isQualitySkipped.mockReturnValue(false);
    mockFeatureConfig.isFlakySkipped.mockReturnValue(false);
    mockParseResult.mockReturnValue({
        tests: [] as FlatTest[],
        stats: { passed: 0, failed: 0, skipped: 0, total: 0, duration: 0 },
        error: undefined,
    });
    (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
});

describe('main', () => {
    it('returns early when CTRF file does not exist', async () => {
        (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(false);
        await main();
        expect(mockPRComment.postPrComment).not.toHaveBeenCalled();
    });

    it('returns early when CTRF parsing fails', async () => {
        mockParseResult.mockReturnValue({ error: 'Invalid JSON' });
        await main();
        expect(mockPRComment.postPrComment).not.toHaveBeenCalled();
    });

    it('returns early when feature is disabled in config', async () => {
        mockGetConfig.mockReturnValue({
            enabled: false,
            publishTarget: 'github-ci',
            skipAi: false,
            skipQuality: false,
            skipFlaky: false,
        });
        await main();
        expect(mockPRComment.postPrComment).not.toHaveBeenCalled();
    });

    it('calls generatePrReport and posts comment on success', async () => {
        mockParseResult.mockReturnValue({
            tests: [{ title: 'test-1', state: 'passed', duration: 100 }],
            stats: { passed: 1, failed: 0, skipped: 0, total: 1, duration: 100 },
            error: undefined,
        });
        mockQualityGate.runQualityGate.mockReturnValue({
            overall: 'pass' as const,
            score: 100,
            checks: [{ name: 'Pass Rate', status: 'pass' as const, score: 100, threshold: 80 }],
        });
        mockPRComment.postPrComment.mockResolvedValue({
            html_url: 'https://github.com/owner/repo/pull/1#issuecomment-1',
        });
        await main();
        expect(mockPRComment.postPrComment).toHaveBeenCalled();
    });

    it('handles no comment URL gracefully', async () => {
        mockParseResult.mockReturnValue({
            tests: [{ title: 'test-1', state: 'passed', duration: 100 }],
            stats: { passed: 1, failed: 0, skipped: 0, total: 1, duration: 100 },
            error: undefined,
        });
        mockQualityGate.runQualityGate.mockReturnValue({
            overall: 'pass' as const,
            score: 100,
            checks: [{ name: 'Pass Rate', status: 'pass' as const, score: 100, threshold: 80 }],
        });
        mockPRComment.postPrComment.mockResolvedValue({});
        await main();
        expect(mockPRComment.postPrComment).toHaveBeenCalled();
    });
});
