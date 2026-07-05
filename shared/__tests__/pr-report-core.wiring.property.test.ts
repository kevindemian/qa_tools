import { describe, expect, it, vi, beforeEach } from 'vitest';
import fc from 'fast-check';
import type { GitProvider } from '../types/ci-cd.js';

function makeMockProvider(overrides?: Partial<GitProvider>): GitProvider {
    return {
        provider: 'github',
        repo: 'owner/repo',
        fetchPipelineRuns: vi.fn(),
        fetchPipelineJobs: vi.fn(),
        fetchJobLogs: vi.fn(),
        fetchOpenPRs: vi.fn(),
        fetchOpenIssues: vi.fn(),
        fetchBranchInformation: vi.fn(),
        downloadArtifact: vi.fn(),
        ...overrides,
    } as GitProvider;
}

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
const mockCiData = vi.hoisted(() => ({
    getOrFetchDataHub: vi.fn(),
    persistCurrentRun: vi.fn(),
    ensureDataHubSync: vi.fn(),
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
vi.mock('../ci-data.js', () => mockCiData);

import fs from 'node:fs';
import { main } from '../pr-report-core.js';
import type { FlatTest } from '../result_parser.js';

describe('TryCreateDataHub wiring — property-based', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        delete process.env['CI'];
        delete process.env['GITHUB_ACTIONS'];
        delete process.env['GITHUB_TOKEN'];

        mockMetrics.loadMetrics.mockReturnValue({ runs: [] });
        mockMetrics.calculateFlakiness.mockReturnValue([]);
        mockMetrics.getTrends.mockReturnValue({ direction: 'stable' as const, change: 0 });
        mockHealthScore.calculateHealthScore.mockReturnValue({
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
        });
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
            tests: [] satisfies FlatTest[],
            stats: { passed: 0, failed: 0, skipped: 0, total: 0, duration: 0 },
            error: undefined,
        });
        mockCiData.getOrFetchDataHub.mockResolvedValue(null);
        mockCiData.persistCurrentRun.mockResolvedValue(undefined);
        mockCiData.ensureDataHubSync.mockResolvedValue(undefined);
        vi.mocked(fs.existsSync).mockReturnValue(true);
    });

    it('factory is always called with a GitProvider-like object (never Promise)', async () => {
        expect.hasAssertions();

        process.env['CI'] = 'true';
        process.env['GITHUB_ACTIONS'] = 'true';
        process.env['GITHUB_TOKEN'] = 'gh-token';

        const factoryCalls: GitProvider[] = [];
        const factory = vi.fn().mockImplementation((...args: [GitProvider]) => {
            factoryCalls.push(args[0]);
            return makeMockProvider();
        });

        await main(factory);

        for (const arg of factoryCalls) {
            expect(arg).not.toBeInstanceOf(Promise);
            expect(typeof arg).toBe('object');
        }
    });

    it('main() always returns void (never throws)', async () => {
        expect.hasAssertions();

        process.env['CI'] = 'true';
        process.env['GITHUB_ACTIONS'] = 'true';
        process.env['GITHUB_TOKEN'] = 'gh-token';

        await fc.assert(
            fc.asyncProperty(fc.boolean(), async (factoryReturnsProvider) => {
                const factory = vi.fn().mockReturnValue(factoryReturnsProvider ? makeMockProvider() : undefined);

                const result = await main(factory);

                expect(result).toBeUndefined();
            }),
            { numRuns: 50 },
        );
    });

    it('getOrFetchDataHub receives a GitProvider, not a Promise', async () => {
        expect.hasAssertions();

        process.env['CI'] = 'true';
        process.env['GITHUB_ACTIONS'] = 'true';
        process.env['GITHUB_TOKEN'] = 'gh-token';

        const mockProvider = makeMockProvider();
        const factory = vi.fn().mockReturnValue(mockProvider);
        mockCiData.getOrFetchDataHub.mockResolvedValue(null);

        await main(factory);

        const calls = mockCiData.getOrFetchDataHub.mock.calls as GitProvider[][];

        for (const call of calls) {
            const firstArg = call[0];

            expect(firstArg).not.toBeInstanceOf(Promise);
            expect(firstArg).toHaveProperty('provider');
        }
    });
});
