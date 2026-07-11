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
const mockFactory = vi.hoisted(() => ({
    createDataHub: vi.fn(),
    createDataHubFromParseResult: vi.fn(),
}));
const mockTestSource = vi.hoisted(() => ({
    askTestSource: vi.fn(),
    DATAHUB_ERRORS: {
        USER_SKIPPED: 'USER_SKIPPED',
        USER_CANCELLED: 'USER_CANCELLED',
        NO_TTY: 'NO_TTY',
        NO_DATA_SOURCE: 'NO_DATA_SOURCE',
    },
}));
const mockGlobalHub = vi.hoisted(() => ({
    getDataHub: vi.fn(),
    isDataHubInitialized: vi.fn().mockReturnValue(false),
    setDataHub: vi.fn(),
}));
const mockFlakiness = vi.hoisted(() => ({
    calcFlakinessEntries: vi.fn().mockReturnValue([]),
}));
const mockTrends = vi.hoisted(() => ({
    calcMetricsTrends: vi.fn().mockReturnValue([]),
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
vi.mock('../data-hub/factory.js', () => mockFactory);
vi.mock('../data-hub/test-source-fallback.js', () => mockTestSource);
vi.mock('../data-hub/global-hub.js', () => mockGlobalHub);
vi.mock('../data-hub/compute/flakiness-entries.js', () => mockFlakiness);
vi.mock('../data-hub/compute/metrics-trends.js', () => mockTrends);

import fs from 'node:fs';
import { main } from '../pr-report-core.js';

describe('TryCreateDataHub wiring — property-based', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGlobalHub.isDataHubInitialized.mockReturnValue(false);
        delete process.env['CI'];
        delete process.env['GITHUB_ACTIONS'];
        delete process.env['GITHUB_TOKEN'];

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
        mockFactory.createDataHub.mockResolvedValue({ hub: {}, status: 'ok' });
        mockFactory.createDataHubFromParseResult.mockResolvedValue({});
        mockTestSource.askTestSource.mockResolvedValue({ data: undefined, error: undefined });
        vi.mocked(fs.existsSync).mockReturnValue(true);
    });

    it('factory is always called with a ciEnv object (never Promise)', async () => {
        expect.hasAssertions();

        process.env['CI'] = 'true';
        process.env['GITHUB_ACTIONS'] = 'true';
        process.env['GITHUB_TOKEN'] = 'gh-token';

        const factoryCalls: unknown[] = [];
        const factory = vi.fn().mockImplementation((...args: [GitProvider]) => {
            factoryCalls.push(args[0]);
            return makeMockProvider();
        });

        await expect(main(factory)).rejects.toThrow(/sem dados do versionador/);

        for (const arg of factoryCalls) {
            expect(arg).not.toBeInstanceOf(Promise);
            expect(typeof arg).toBe('object');
        }
    });

    it('createDataHub (factory) receives a GitProvider, not a Promise', async () => {
        expect.hasAssertions();

        process.env['CI'] = 'true';
        process.env['GITHUB_ACTIONS'] = 'true';
        process.env['GITHUB_TOKEN'] = 'gh-token';

        const mockProvider = makeMockProvider();
        const factory = vi.fn().mockReturnValue(mockProvider);
        mockFactory.createDataHub.mockRejectedValue(new Error('network error'));

        await expect(main(factory)).rejects.toThrow(/sem dados do versionador/);

        const calls = mockFactory.createDataHub.mock.calls as [GitProvider, string][];

        for (const call of calls) {
            const firstArg = call[0];

            expect(firstArg).not.toBeInstanceOf(Promise);
            expect(firstArg).toHaveProperty('provider');
        }
    });

    it('main throws explicit error when no usable test data is available (no silent skip)', async () => {
        expect.hasAssertions();

        process.env['CI'] = 'true';
        process.env['GITHUB_ACTIONS'] = 'true';
        process.env['GITHUB_TOKEN'] = 'gh-token';

        await fc.assert(
            fc.asyncProperty(fc.boolean(), async (factoryReturnsProvider) => {
                const factory = vi.fn().mockReturnValue(factoryReturnsProvider ? makeMockProvider() : undefined);
                mockFactory.createDataHub.mockRejectedValue(new Error('network error'));

                await expect(main(factory)).rejects.toThrow(/sem dados do versionador/);
            }),
            { numRuns: 50 },
        );
    });
});
