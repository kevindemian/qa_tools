import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { GitProvider } from '../types/ci-cd.js';
import type { RawData, DataSource } from '../types/data-hub.js';
import { makeDataHubGetters, makeDataHubMock } from '../test-utils/factories/data-hub-mock.js';

const mockGlobalHub = vi.hoisted(() => ({
    setDataHub: vi.fn(),
    getDataHub: vi.fn(),
    isDataHubInitialized: vi.fn().mockReturnValue(false),
}));

vi.mock('../data-hub/global-hub.js', () => mockGlobalHub);

const mockFactory = vi.hoisted(() => ({
    createDataHub: vi.fn(),
    createDataHubFromParseResult: vi.fn(),
}));
vi.mock('../data-hub/factory.js', () => mockFactory);

const mockTestSource = vi.hoisted(() => ({
    askTestSource: vi.fn(),
    DATAHUB_ERRORS: {
        USER_SKIPPED: 'USER_SKIPPED',
        USER_CANCELLED: 'USER_CANCELLED',
        NO_TTY: 'NO_TTY',
        NO_DATA_SOURCE: 'NO_DATA_SOURCE',
    },
}));
vi.mock('../data-hub/test-source-fallback.js', () => mockTestSource);

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

vi.mock('fs', () => ({
    default: { mkdirSync: vi.fn(), writeFileSync: vi.fn(), existsSync: vi.fn() },
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    existsSync: vi.fn(),
}));
vi.mock('../quality/quality-gate.js', () => mockQualityGate);
vi.mock('../ci/github-check-run.js', () => mockCheckRun);
vi.mock('../ci/github-pr-comment.js', () => mockPRComment);
vi.mock('../report/report-html.js', () => mockHtml);
vi.mock('../feature-config.js', () => ({
    getPrReportConfig: mockGetConfig,
    isAiSkipped: mockFeatureConfig.isAiSkipped,
    isQualitySkipped: mockFeatureConfig.isQualitySkipped,
    isFlakySkipped: mockFeatureConfig.isFlakySkipped,
}));

import fs from 'node:fs';
import { main, generatePrReport } from '../pr-report-core.js';

function makeFetchedHub(): Record<string, unknown> {
    return {
        ...makeDataHubGetters(),
        raw: { runs: [], jobs: new Map(), artifacts: new Map(), failureReasons: new Map() },
        computed: {},
        timestamp: new Date(),
        provider: 'github',
        repo: 'owner/repo',
        saveParseResult: vi.fn(),
        saveRun: vi.fn(),
        flush: vi.fn(),
        loadCoverageHistory: vi.fn().mockReturnValue([]),
        loadFailureClassifications: vi.fn().mockReturnValue([]),
        saveQualityMetrics: vi.fn(),
        loadQualityMetricsHistory: vi.fn().mockReturnValue([]),
    };
}

describe('TryCreateDataHub wiring', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGlobalHub.setDataHub.mockClear();
        mockGlobalHub.isDataHubInitialized.mockReturnValue(false);
        mockFactory.createDataHub.mockReset();
        mockFactory.createDataHubFromParseResult.mockReset();
        mockTestSource.askTestSource.mockReset();
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
        mockFactory.createDataHub.mockResolvedValue({ hub: makeFetchedHub(), status: 'ok' });
        mockFactory.createDataHubFromParseResult.mockResolvedValue(makeFetchedHub());
        mockTestSource.askTestSource.mockResolvedValue({ data: undefined, error: undefined });
        vi.mocked(fs.existsSync).mockReturnValue(true);
    });

    describe('Main without providerFactory', () => {
        it('calls main without factory — no DataHub fetch', async () => {
            expect.hasAssertions();

            await expect(main()).rejects.toThrow(/sem dados do versionador/);

            expect(mockFactory.createDataHub).not.toHaveBeenCalled();
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
            expect(mockFactory.createDataHub).toHaveBeenCalledTimes(1);
        });

        it('creates DataHub when factory returns GitProvider', async () => {
            expect.hasAssertions();

            process.env['CI'] = 'true';
            process.env['GITHUB_ACTIONS'] = 'true';
            process.env['GITHUB_TOKEN'] = 'gh-token';
            process.env['GITHUB_REPOSITORY'] = 'owner/repo';

            const mockProvider = makeMockProvider();
            const factory = vi.fn().mockReturnValue(mockProvider);

            await main(factory);

            expect(mockFactory.createDataHub).toHaveBeenCalledWith(mockProvider, 'owner/repo');
            expect(mockGlobalHub.setDataHub).toHaveBeenCalledTimes(1);
        });

        it('does not fetch DataHub when factory returns undefined', async () => {
            expect.hasAssertions();

            process.env['CI'] = 'true';
            process.env['GITHUB_ACTIONS'] = 'true';
            process.env['GITHUB_TOKEN'] = 'gh-token';

            const factory = vi.fn().mockReturnValue(undefined);

            await expect(main(factory)).rejects.toThrow(/sem dados do versionador/);

            expect(mockFactory.createDataHub).not.toHaveBeenCalled();
        });

        it('throws explicit error when createDataHub fails (no fallback data)', async () => {
            expect.hasAssertions();

            process.env['CI'] = 'true';
            process.env['GITHUB_ACTIONS'] = 'true';
            process.env['GITHUB_TOKEN'] = 'gh-token';

            const mockProvider = makeMockProvider();
            const factory = vi.fn().mockReturnValue(mockProvider);
            mockFactory.createDataHub.mockRejectedValue(new Error('network error'));

            await expect(main(factory)).rejects.toThrow(/sem dados do versionador/);

            expect(mockPRComment.postPrComment).not.toHaveBeenCalled();
        });

        it('does not call factory when isCI=false', async () => {
            expect.hasAssertions();

            const factory = vi.fn().mockReturnValue(makeMockProvider());

            await expect(main(factory)).rejects.toThrow(/sem dados do versionador/);

            expect(factory).not.toHaveBeenCalled();
            expect(mockFactory.createDataHub).not.toHaveBeenCalled();
        });
    });

    describe('C-3e data-quality awareness', () => {
        it('surfaces the unified-model data-quality summary in the PR report', async () => {
            expect.hasAssertions();

            const raw: RawData = {
                runs: [],
                jobs: new Map(),
                artifacts: new Map(),
                failureReasons: new Map(),
                failureRecords: [{ name: 't1', status: 'failed', confidence: 0.9, source: 'junit' }],
                provenance: new Map<string, DataSource>([
                    ['failureRecords', { confidence: 0.9, source: 'github-api', timestamp: new Date().toISOString() }],
                ]),
            };
            const dataHub = makeDataHubMock({ raw });

            const result = await generatePrReport({
                tests: [],
                stats: { passed: 0, failed: 0, skipped: 0, total: 0, duration: 0 },
                dataHub,
                project: 'p',
            });

            expect(result.dataQuality).toBeDefined();
            expect(result.dataQuality?.status).toBe('ok');
            expect(result.dataQuality?.minConfidence).toBeCloseTo(0.9);

            expect(mockPRComment.postPrComment).toHaveBeenCalledTimes(1);

            const body = mockPRComment.postPrComment.mock.calls[0]?.[0] as string;

            expect(body).toContain('### ✅ Data Quality');
            expect(body).toContain('**Min. confidence:** 90%');
        });

        it('reports degraded data quality when a category has quality issues', async () => {
            expect.hasAssertions();

            const raw: RawData = {
                runs: [],
                jobs: new Map(),
                artifacts: new Map(),
                failureReasons: new Map(),
                failureRecords: [{ name: 't1', status: 'failed', confidence: 0.4, source: 'junit' }],
                provenance: new Map<string, DataSource>([
                    ['failureRecords', { confidence: 0.4, source: 'github-api', timestamp: new Date().toISOString() }],
                ]),
            };
            const dataHub = makeDataHubMock({ raw });
            dataHub.getQuality = vi.fn().mockReturnValue({
                valid: false,
                issues: ['low confidence'],
            });

            const result = await generatePrReport({
                tests: [],
                stats: { passed: 0, failed: 0, skipped: 0, total: 0, duration: 0 },
                dataHub,
                project: 'p',
            });

            expect(result.dataQuality?.status).toBe('degraded');

            const body = mockPRComment.postPrComment.mock.calls[0]?.[0] as string;

            expect(body).toContain('### ⚠️ Data Quality');
        });
    });
});
