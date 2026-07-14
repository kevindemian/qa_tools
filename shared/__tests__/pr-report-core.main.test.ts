import { describe, expect, it, vi, beforeEach, afterAll } from 'vitest';

const mockHealthScore = vi.hoisted(() => ({ calculateHealthScore: vi.fn() }));
const mockQualityGate = vi.hoisted(() => ({ runQualityGate: vi.fn() }));
const mockCheckRun = vi.hoisted(() => ({ createCheckRun: vi.fn() }));
const mockPRComment = vi.hoisted(() => ({ postPrComment: vi.fn() }));
const mockHtml = vi.hoisted(() => ({ generateHtmlReport: vi.fn() }));
const mockGetConfig = vi.hoisted(() => vi.fn());
const mockFeatureConfig = vi.hoisted(() => ({
    isAiSkipped: vi.fn(),
    isQualitySkipped: vi.fn(),
    isFlakySkipped: vi.fn(),
}));
const mockDataHub = vi.hoisted(() => ({
    getDataHub: vi.fn(),
    isDataHubInitialized: vi.fn(),
    setDataHub: vi.fn(),
}));

vi.mock('fs', () => ({
    default: { mkdirSync: vi.fn(), writeFileSync: vi.fn(), existsSync: vi.fn() },
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    existsSync: vi.fn(),
}));
vi.mock('../health-score.js', () => mockHealthScore);
vi.mock('../quality-gate.js', () => mockQualityGate);
vi.mock('../github-check-run.js', () => mockCheckRun);
vi.mock('../github-pr-comment.js', () => mockPRComment);
vi.mock('../report-html.js', () => mockHtml);
vi.mock('../feature-config.js', () => ({
    getPrReportConfig: mockGetConfig,
    isAiSkipped: mockFeatureConfig.isAiSkipped,
    isQualitySkipped: mockFeatureConfig.isQualitySkipped,
    isFlakySkipped: mockFeatureConfig.isFlakySkipped,
}));
vi.mock('../data-hub/global-hub.js', () => mockDataHub);

import fs from 'node:fs';
import { main } from '../pr-report-core.js';
import { makeDataHubMock } from '../test-utils/factories/data-hub-mock.js';

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

describe('Pr Report Core.Main', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        delete process.env['GITHUB_STEP_SUMMARY'];
        mockHealthScore.calculateHealthScore.mockReturnValue(defaultHealthScore);
        mockQualityGate.runQualityGate.mockReturnValue(null);
        mockCheckRun.createCheckRun.mockResolvedValue(undefined);
        mockPRComment.postPrComment.mockResolvedValue(undefined);
        mockHtml.generateHtmlReport.mockReturnValue('<html>mock</html>');
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
        vi.mocked(fs.existsSync).mockReturnValue(true);

        // Mock DataHub with test data
        mockDataHub.getDataHub.mockReturnValue(
            makeDataHubMock({
                raw: {
                    runs: [],
                    jobs: new Map(),
                    artifacts: new Map(),
                    failureReasons: new Map(),
                },
                computed: {
                    metricsRuns: [
                        {
                            timestamp: new Date().toISOString(),
                            project: 'test/repo',
                            tests: [{ title: 'test-1', state: 'passed', duration: 100 }],
                            total: 1,
                            passed: 1,
                            failed: 0,
                            skipped: 0,
                            duration: 100,
                        },
                    ],
                    testCounts: { passed: 1, failed: 0, skipped: 0, total: 1 },
                },
                provider: 'github',
                repo: 'test/repo',
            }),
        );
        mockDataHub.isDataHubInitialized.mockReturnValue(true);
        mockDataHub.setDataHub.mockReturnValue(undefined);
    });

    afterAll(() => {
        delete process.env['GITHUB_STEP_SUMMARY'];
    });

    describe('Main', () => {
        it('throws explicit error when DataHub has no test data (non-interactive)', async () => {
            expect.hasAssertions();

            mockDataHub.getDataHub.mockReturnValue({
                saveParseResult: vi.fn(),
                raw: { runs: [], coverage: undefined },
                computed: {
                    metricsRuns: [],
                    testCounts: { passed: 0, failed: 0, skipped: 0, total: 0 },
                },
                timestamp: new Date(),
                provider: 'github',
                repo: 'test/repo',
            });

            await expect(main()).rejects.toThrow(/sem dados do versionador/);
            expect(mockPRComment.postPrComment).not.toHaveBeenCalled();
        });

        it('throws explicit error when DataHub is not initialized (non-interactive)', async () => {
            expect.hasAssertions();

            mockDataHub.isDataHubInitialized.mockReturnValue(false);
            mockDataHub.getDataHub.mockReturnValue(undefined);

            await expect(main()).rejects.toThrow(/sem dados do versionador/);
            expect(mockPRComment.postPrComment).not.toHaveBeenCalled();
        });

        it('returns early when feature is disabled in config', async () => {
            expect.hasAssertions();

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
            expect.hasAssertions();

            mockQualityGate.runQualityGate.mockReturnValue({
                overall: 'pass' as const,
                score: 100,
                checks: [{ name: 'Pass Rate', status: 'pass' as const, score: 100, threshold: 80 }],
            });
            mockPRComment.postPrComment.mockResolvedValue({
                html_url: 'https://github.com/owner/repo/pull/1#issuecomment-1',
            });
            await main();

            expect(mockPRComment.postPrComment).toHaveBeenCalledWith(expect.any(String));
        });

        it('handles no comment URL gracefully', async () => {
            expect.hasAssertions();

            mockQualityGate.runQualityGate.mockReturnValue({
                overall: 'pass' as const,
                score: 100,
                checks: [{ name: 'Pass Rate', status: 'pass' as const, score: 100, threshold: 80 }],
            });
            mockPRComment.postPrComment.mockResolvedValue({});
            await main();

            expect(mockPRComment.postPrComment).toHaveBeenCalledWith(expect.any(String));
        });
    });
});
