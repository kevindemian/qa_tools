import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { GitProvider } from '../types/ci-cd.js';

const mockGlobalHub = vi.hoisted(() => ({
    setDataHub: vi.fn(),
    getDataHub: vi.fn(),
    isDataHubInitialized: vi.fn().mockReturnValue(false),
}));

vi.mock('../data-hub/global-hub.js', () => mockGlobalHub);

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
vi.mock('../ci-data.js', () => mockCiData);

import fs from 'node:fs';
import { main } from '../pr-report-core.js';

describe('TryCreateDataHub wiring', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGlobalHub.setDataHub.mockClear();
        mockGlobalHub.isDataHubInitialized.mockReturnValue(false);
        delete process.env['GITHUB_STEP_SUMMARY'];
        delete process.env['CI'];
        delete process.env['GITHUB_ACTIONS'];
        delete process.env['GITLAB_CI'];
        delete process.env['GITHUB_TOKEN'];
        delete process.env['CI_JOB_TOKEN'];
        delete process.env['CI_PROJECT_ID'];

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
        mockCiData.getOrFetchDataHub.mockResolvedValue(null);
        mockCiData.persistCurrentRun.mockResolvedValue(undefined);
        mockCiData.ensureDataHubSync.mockResolvedValue(undefined);
        vi.mocked(fs.existsSync).mockReturnValue(true);
    });

    describe('Main without providerFactory', () => {
        it('calls main without factory — no DataHub fetch', async () => {
            expect.hasAssertions();

            await main();

            expect(mockCiData.getOrFetchDataHub).not.toHaveBeenCalled();
        });
    });

    describe('Main with providerFactory', () => {
        it('calls factory with ciEnv when CI is detected', async () => {
            expect.hasAssertions();

            process.env['CI'] = 'true';
            process.env['GITHUB_ACTIONS'] = 'true';
            process.env['GITHUB_TOKEN'] = 'gh-token';

            const factory = vi.fn().mockReturnValue(makeMockProvider());

            await main(factory);

            expect(factory).toHaveBeenCalledTimes(1);

            const ciEnv = factory.mock.calls[0]?.[0] as { isCI: boolean } | undefined;

            expect(ciEnv).toBeDefined();
            expect(ciEnv?.isCI).toBeTruthy();
        });

        it('creates DataHub when factory returns GitProvider', async () => {
            expect.hasAssertions();

            process.env['CI'] = 'true';
            process.env['GITHUB_ACTIONS'] = 'true';
            process.env['GITHUB_TOKEN'] = 'gh-token';
            process.env['GITHUB_REPOSITORY'] = 'owner/repo';

            const mockProvider = makeMockProvider();
            const factory = vi.fn().mockReturnValue(mockProvider);
            const mockDataHub = {
                raw: { runs: [], pipelineRuns: [] },
                computed: { passRate: 85, coverage: 75, executionRate: 77, flakyPercentage: 12, suiteSpeedP95: 500 },
                saveParseResult: vi.fn().mockReturnValue({}),
                saveRun: vi.fn(),
                saveCoverageSnapshot: vi.fn(),
                saveFailureClassification: vi.fn(),
                flush: vi.fn(),
                loadCoverageHistory: vi.fn().mockReturnValue([]),
                loadFailureClassifications: vi.fn().mockReturnValue([]),
                saveQualityMetrics: vi.fn(),
                loadQualityMetricsHistory: vi.fn().mockReturnValue([]),
            };
            mockCiData.getOrFetchDataHub.mockResolvedValue(mockDataHub);

            await main(factory);

            expect(mockCiData.getOrFetchDataHub).toHaveBeenCalledWith(mockProvider, expect.any(String));
            expect(mockGlobalHub.setDataHub).toHaveBeenCalledWith(mockDataHub);
        });

        it('does not fetch DataHub when factory returns undefined', async () => {
            expect.hasAssertions();

            process.env['CI'] = 'true';
            process.env['GITHUB_ACTIONS'] = 'true';
            process.env['GITHUB_TOKEN'] = 'gh-token';

            const factory = vi.fn().mockReturnValue(undefined);

            await main(factory);

            expect(mockCiData.getOrFetchDataHub).not.toHaveBeenCalled();
        });

        it('returns early when getOrFetchDataHub throws', async () => {
            expect.hasAssertions();

            process.env['CI'] = 'true';
            process.env['GITHUB_ACTIONS'] = 'true';
            process.env['GITHUB_TOKEN'] = 'gh-token';

            const mockProvider = makeMockProvider();
            const factory = vi.fn().mockReturnValue(mockProvider);
            mockCiData.getOrFetchDataHub.mockRejectedValue(new Error('network error'));

            await main(factory);

            expect(mockPRComment.postPrComment).not.toHaveBeenCalled();
        });

        it('does not call factory when isCI=false', async () => {
            expect.hasAssertions();

            const factory = vi.fn().mockReturnValue(undefined);

            await main(factory);

            expect(factory).not.toHaveBeenCalled();
        });
    });
});
