import os from 'os';
import path from 'path';
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { generatePrReport } from '../pr-report-core.js';
import type { FlatTest } from '../result_parser.js';
import type { PrReportCoreOptions, PrReportStats } from '../pr-report-core.js';
import type { DataHub } from '../types/data-hub.js';
import { createTestHub } from './test-hub.js';
import { makeDataHubMock } from '../test-utils/factories/data-hub-mock.js';
import { calcRunPassRate } from '../data-hub/compute/run-pass-rate.js';
import { containsEmoji } from '../test-utils/assertions.js';

const report = (
    opts: Omit<PrReportCoreOptions, 'dataHub' | 'tests' | 'stats'> & {
        tests?: FlatTest[];
        stats?: PrReportStats;
        dataHub?: DataHub;
    },
): ReturnType<typeof generatePrReport> => {
    const { tests, stats, dataHub, ...rest } = opts;
    const statsForHub: PrReportStats = stats ?? { passed: 0, failed: 0, skipped: 0, total: 0, duration: 0 };
    const hub = dataHub ?? createTestHub();
    hub.computed = {
        ...hub.computed,
        testCounts: {
            passed: statsForHub.passed,
            failed: statsForHub.failed,
            skipped: statsForHub.skipped,
            total: statsForHub.total,
        },
        runPassRate: calcRunPassRate({ passed: statsForHub.passed, failed: statsForHub.failed }),
        metricsRuns:
            tests == null
                ? (hub.computed.metricsRuns ?? [])
                : [
                      {
                          timestamp: new Date().toISOString(),
                          project: '',
                          passed: statsForHub.passed,
                          failed: statsForHub.failed,
                          skipped: statsForHub.skipped,
                          total: statsForHub.total,
                          duration: statsForHub.duration,
                          tests,
                      },
                  ],
    };
    return generatePrReport({ ...rest, dataHub: hub });
};

vi.mock('fs', async (importOriginal) => {
    const actual = await importOriginal<typeof import('node:fs')>();
    const mockWriteFileSync = vi.fn((filePath: string, data: string, options?: import('node:fs').WriteFileOptions) => {
        const p = String(filePath);
        if (p === 'reports/pr-report.html' || p.endsWith('/pr-report.html')) {
            return undefined;
        }
        if (process.env['GITHUB_STEP_SUMMARY'] && p === process.env['GITHUB_STEP_SUMMARY']) {
            return undefined;
        }
        return actual.writeFileSync(filePath, data, options);
    });
    return {
        ...actual,
        default: { ...actual, mkdirSync: vi.fn(), writeFileSync: mockWriteFileSync },
        mkdirSync: vi.fn(),
        writeFileSync: mockWriteFileSync,
    };
});

const mockCheckRun = vi.hoisted(() => ({
    createCheckRun: vi.fn(),
}));

const mockPRComment = vi.hoisted(() => ({
    postPrComment: vi.fn(),
}));

vi.mock('../ci/github-check-run.js', () => mockCheckRun);
vi.mock('../ci/github-pr-comment.js', () => mockPRComment);
vi.mock('../data-hub/global-hub.js', () => ({
    getDataHub: vi.fn().mockReturnValue({
        saveParseResult: vi.fn(),
        saveRun: vi.fn(),
        loadRun: vi.fn().mockReturnValue(null),
        saveCoverageSnapshot: vi.fn(),
        loadCoverageHistory: vi.fn().mockReturnValue([]),
        saveFailureClassification: vi.fn(),
        loadFailureClassifications: vi.fn().mockReturnValue([]),
        saveQualityMetrics: vi.fn(),
        loadQualityMetricsHistory: vi.fn().mockReturnValue([]),
        flush: vi.fn(),
        raw: { runs: [], jobs: new Map(), artifacts: new Map(), failureReasons: new Map() },
        computed: {
            passRate: 80,
            avgDuration: 1000,
            suiteSpeedP95: 500,
            flakyRate: [],
            coverage: 85,
            pipelineCost: { totalMinutes: 0, estimatedCost: 0 },
            defectTrends: [],
            branchBreakdown: {},
            topFailingJobs: [],
            topFailureReasons: [],
            releaseScore: { score: 0, dimensions: {} as never, grade: 'critical' },
            quarantineStatus: { flakyCount: 0, quarantinedCount: 0 },
            testPassRate: 80,
            testCounts: { passed: 8, failed: 1, skipped: 1, total: 10 },
            framework: 'vitest',
            executionRate: 90,
            flakyPercentage: 1,
        },
        timestamp: new Date(),
        provider: 'github',
        repo: 'test/repo',
    }),
    isDataHubInitialized: vi.fn().mockReturnValue(true),
    setDataHub: vi.fn(),
}));

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

// Generate tests array that matches defaultStats (8 passed, 1 failed, 1 skipped)
const defaultTests: FlatTest[] = [
    ...Array.from({ length: 8 }, (_, i) => ({ ...sampleTest, title: `test ${i + 1}` })),
    failedTest,
    skippedTest,
];

const defaultStats = {
    passed: 8,
    failed: 1,
    skipped: 1,
    total: 10,
    duration: 5000,
};

describe('Pr Report Core', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        delete process.env['GITHUB_STEP_SUMMARY'];
        mockCheckRun.createCheckRun.mockResolvedValue(undefined);
        mockPRComment.postPrComment.mockResolvedValue(undefined);
    });

    afterAll(() => {
        delete process.env['GITHUB_STEP_SUMMARY'];
    });

    describe('GeneratePrReport', () => {
        it('returns healthScore and passRate for basic test data', async () => {
            expect.hasAssertions();

            const result = await report({
                tests: defaultTests,
                stats: defaultStats,
            });

            expect(result.healthScore).toBeDefined();
            expect(result.healthScore.overall).toBeGreaterThanOrEqual(0);
            expect(result.healthScore.overall).toBeLessThanOrEqual(100);
            expect(result.healthScore.grade).toBeDefined();
            expect(result.passRate).toBeCloseTo(88.9, 1);
        });

        it('generates HTML report at default path when no htmlOutputPath given', async () => {
            expect.hasAssertions();

            const result = await report({
                tests: [sampleTest],
                stats: { passed: 1, failed: 0, skipped: 0, total: 1, duration: 100 },
            });

            expect(result.htmlPath).toBeDefined();
            expect(result.htmlPath).toContain('reports/pr-report.html');
        });

        it('uses custom htmlOutputPath when provided', async () => {
            expect.hasAssertions();

            const result = await report({
                tests: [sampleTest],
                stats: { passed: 1, failed: 0, skipped: 0, total: 1, duration: 100 },
                htmlOutputPath: path.join(os.tmpdir(), 'qa-custom-report.html'),
            });

            expect(result.htmlPath).toBe(path.join(os.tmpdir(), 'qa-custom-report.html'));
        });

        it('includes coverage source in HTML options when coverage is resolved', async () => {
            expect.hasAssertions();

            // Mock DataHub with coverage data
            const mockDataHubWithCoverage = makeDataHubMock({
                raw: {
                    runs: [],
                    jobs: new Map(),
                    artifacts: new Map(),
                    failureReasons: new Map(),
                    coverage: { percentage: 85, covered: 85, total: 100 },
                },
                computed: {
                    testCounts: { passed: 1, failed: 0, skipped: 0, total: 1 },
                },
            });

            const result = await report({
                tests: [sampleTest],
                stats: { passed: 1, failed: 0, skipped: 0, total: 1, duration: 100 },
                dataHub: mockDataHubWithCoverage,
            });

            expect(result.htmlPath).toBeDefined();
            expect(result.healthScore).toBeDefined();
            expect(result.healthScore.overall).toBeGreaterThanOrEqual(0);
        });

        it('passes diffComparison to HTML options when provided', async () => {
            expect.hasAssertions();

            const diff = {
                newFailures: [failedTest],
                newPasses: [],
                flaky: [],
            };

            const result = await report({
                tests: defaultTests,
                stats: defaultStats,
                diffComparison: diff,
            });

            expect(result.htmlPath).toBeDefined();
            expect(result.healthScore).toBeDefined();
        });

        it('runs quality gate when not skipped', async () => {
            expect.hasAssertions();

            await report({
                tests: [sampleTest],
                stats: { passed: 1, failed: 0, skipped: 0, total: 1, duration: 100 },
                skipQuality: false,
            });

            expect(mockCheckRun.createCheckRun).toHaveBeenCalledWith(
                expect.objectContaining({
                    name: 'Quality Gate',
                }),
            );
        });

        it('skips quality gate when skipQuality is true', async () => {
            expect.hasAssertions();

            await report({
                tests: [sampleTest],
                stats: { passed: 1, failed: 0, skipped: 0, total: 1, duration: 100 },
                skipQuality: true,
            });

            expect(mockCheckRun.createCheckRun).not.toHaveBeenCalled();
        });

        it('skips AI section when skipAi is true', async () => {
            expect.hasAssertions();

            const result = await report({
                tests: defaultTests,
                stats: defaultStats,
                skipAi: true,
            });

            expect(result.healthScore).toBeDefined();
            expect(result.healthScore.overall).toBeGreaterThanOrEqual(0);
            expect(mockPRComment.postPrComment).toHaveBeenCalledWith(expect.any(String));
        });

        it('skips flaky section when skipFlaky is true', async () => {
            expect.hasAssertions();

            await report({
                tests: [sampleTest],
                stats: { passed: 1, failed: 0, skipped: 0, total: 1, duration: 100 },
                skipFlaky: true,
            });

            expect(mockPRComment.postPrComment).toHaveBeenCalledWith(expect.any(String));
        });

        it('survives empty test list', async () => {
            expect.hasAssertions();

            const result = await report({
                tests: [],
                stats: { passed: 0, failed: 0, skipped: 0, total: 0, duration: 0 },
            });

            expect(result.healthScore).toBeDefined();
            expect(result.healthScore.overall).toBeGreaterThanOrEqual(0);
            expect(result.passRate).toBe(0);
        });

        it('handles health score with coverage override', async () => {
            expect.hasAssertions();

            // Mock DataHub with coverage data
            const mockDataHubWithCoverage = makeDataHubMock({
                raw: {
                    runs: [],
                    jobs: new Map(),
                    artifacts: new Map(),
                    failureReasons: new Map(),
                    coverage: { percentage: 92, covered: 92, total: 100 },
                },
                computed: {
                    testCounts: { passed: 1, failed: 0, skipped: 0, total: 1 },
                },
            });

            const result = await report({
                tests: [sampleTest],
                stats: { passed: 1, failed: 0, skipped: 0, total: 1, duration: 100 },
                dataHub: mockDataHubWithCoverage,
            });

            expect(result.healthScore).toBeDefined();
            expect(result.healthScore.overall).toBeGreaterThanOrEqual(0);
        });

        it('includes provenance metadata in PR comment footer when health score has provenance', async () => {
            expect.hasAssertions();

            await report({
                tests: [sampleTest],
                stats: { passed: 1, failed: 0, skipped: 0, total: 1, duration: 100 },
                project: 'test-proj',
            });

            const calledWith = String(mockPRComment.postPrComment.mock.calls[0]?.[0]);

            expect(typeof calledWith).toBe('string');
            expect(calledWith).toContain('Methodology & References');
        });

        it('includes CI Context section when ciEnv.isCI is true', async () => {
            expect.hasAssertions();

            await report({
                tests: defaultTests,
                stats: defaultStats,
                ciEnv: {
                    isCI: true,
                    repo: 'owner/repo',
                    runId: '123',
                    refName: 'feature/test',
                    serverUrl: 'https://github.com',
                },
            });

            const commentBody = String(mockPRComment.postPrComment.mock.calls[0]?.[0]);

            expect(commentBody).toContain('CI Context');
            expect(commentBody).toContain('Run #123');
            expect(commentBody).toContain('feature/test');
            expect(commentBody).toContain('owner/repo');
            expect(commentBody).toContain('test execution results');
        });

        it('does not include CI Context section when ciEnv.isCI is false', async () => {
            expect.hasAssertions();

            await report({
                tests: defaultTests,
                stats: defaultStats,
                ciEnv: {
                    isCI: false,
                    repo: 'unknown',
                    runId: '0',
                    refName: '',
                    serverUrl: 'https://github.com',
                },
            });

            const commentBody = String(mockPRComment.postPrComment.mock.calls[0]?.[0]);

            expect(commentBody).not.toContain('CI Context');
        });

        it('writes to GITHUB_STEP_SUMMARY when env var is set (VITEST guard bypassed)', async () => {
            expect.hasAssertions();

            const summaryPath = path.join(os.tmpdir(), 'qa-test-step-summary.md');
            const fs = await import('node:fs');
            const prevVitest = process.env['VITEST'];
            delete process.env['VITEST'];
            process.env['GITHUB_STEP_SUMMARY'] = summaryPath;

            try {
                await report({
                    tests: defaultTests,
                    stats: defaultStats,
                    ciEnv: {
                        isCI: true,
                        repo: 'owner/repo',
                        runId: '456',
                        refName: 'main',
                        serverUrl: 'https://github.com',
                    },
                });

                const writeCalls = vi.mocked(fs.writeFileSync).mock.calls;
                const summaryCall = writeCalls.find((call) => String(call[0]) === summaryPath);
                if (!summaryCall) throw new Error('Expected summaryCall to be defined');
                const content = typeof summaryCall[1] === 'string' ? summaryCall[1] : '';

                expect(content).toContain('QA Tools — PR Report');
                expect(content).toContain(
                    '| [PASS] Passed | [FAIL] Failed | [SKIP] Skipped | [TOTAL] Total | [TIME] Duration | [RATE] Pass Rate |',
                );
                expect(content).toContain('| 8 | 1 | 1 | 10 |');
                expect(content).not.toMatch(/:[a-z_]+:/);
                expect(containsEmoji(content)).toBeFalsy();
            } finally {
                delete process.env['GITHUB_STEP_SUMMARY'];
                if (prevVitest !== undefined) process.env['VITEST'] = prevVitest;
                else delete process.env['VITEST'];
            }
        });

        it('does not write to job summary when VITEST is set', async () => {
            expect.hasAssertions();

            process.env['VITEST'] = 'true';
            const summaryPath = path.join(os.tmpdir(), 'qa-test-step-summary-guard.md');
            const fs = await import('node:fs');
            fs.writeFileSync(summaryPath, '', 'utf8');
            process.env['GITHUB_STEP_SUMMARY'] = summaryPath;

            try {
                await report({
                    tests: defaultTests,
                    stats: defaultStats,
                    ciEnv: {
                        isCI: true,
                        repo: 'owner/repo',
                        runId: '456',
                        refName: 'main',
                        serverUrl: 'https://github.com',
                    },
                });

                const summaryContent = fs.readFileSync(summaryPath, 'utf8');

                expect(summaryContent).toBe('');
            } finally {
                delete process.env['GITHUB_STEP_SUMMARY'];
                delete process.env['VITEST'];
                fs.unlinkSync(summaryPath);
            }
        });

        it('does not write to job summary when GITHUB_STEP_SUMMARY is not set', async () => {
            expect.hasAssertions();

            const original = process.env['GITHUB_STEP_SUMMARY'];
            delete process.env['GITHUB_STEP_SUMMARY'];

            try {
                const result = await report({
                    tests: defaultTests,
                    stats: defaultStats,
                });

                expect(result.healthScore).toBeDefined();
            } finally {
                if (original) process.env['GITHUB_STEP_SUMMARY'] = original;
            }
        });
    });

    describe('GeneratePrReport — SSOT (B4/B22)', () => {
        it('derives summary and job-summary exclusively from computed.testCounts/runPassRate', async () => {
            expect.hasAssertions();

            const passedTest: FlatTest = { title: 'passing-test', state: 'passed', duration: 100 };
            const failedTest: FlatTest = {
                title: 'failing-test',
                state: 'failed',
                duration: 200,
                error: 'AssertionError: boom',
            };

            // SSOT deliberately disagrees with the latest run's totals: the summary
            // MUST reflect computed.testCounts/runPassRate, and the failure table the
            // latest run's tests (computed.metricsRuns[0].tests).
            const hub = createTestHub({
                testCounts: { passed: 8, failed: 2, skipped: 0, total: 10 },
                runPassRate: calcRunPassRate({ passed: 8, failed: 2 }),
                metricsRuns: [
                    {
                        timestamp: new Date().toISOString(),
                        project: 'p',
                        passed: 1,
                        failed: 1,
                        skipped: 0,
                        total: 2,
                        duration: 5000,
                        tests: [passedTest, failedTest],
                    },
                ],
            });

            const summaryPath = path.join(os.tmpdir(), 'qa-ssot-step-summary.md');
            const fs = await import('node:fs');
            const prevVitest = process.env['VITEST'];
            delete process.env['VITEST'];
            process.env['GITHUB_STEP_SUMMARY'] = summaryPath;

            try {
                const result = await generatePrReport({ dataHub: hub, project: 'p' });

                expect(result.passRate).toBe(80);

                const commentBody = String(mockPRComment.postPrComment.mock.calls[0]?.[0]);

                expect(commentBody).toContain('80% pass rate');
                expect(commentBody).toContain('(8/10)');
                expect(commentBody).toContain('| 8 | 2 | 0 | 5.0s |');
                expect(commentBody).toContain('failing-test');
                expect(commentBody).not.toContain('(1/2)');

                const writeCalls = vi.mocked(fs.writeFileSync).mock.calls;
                const summaryCall = writeCalls.find((call) => String(call[0]) === summaryPath);
                if (!summaryCall) throw new Error('Expected job summary to be written');
                const content = typeof summaryCall[1] === 'string' ? summaryCall[1] : '';

                expect(content).toContain('| 8 | 2 | 0 | 10 | 5.0s | 80.0% |');
            } finally {
                delete process.env['GITHUB_STEP_SUMMARY'];
                if (prevVitest !== undefined) process.env['VITEST'] = prevVitest;
                else delete process.env['VITEST'];
            }
        });

        it('fails explicitly when computed.runPassRate is missing (incomplete SSOT)', async () => {
            expect.hasAssertions();

            const hub = createTestHub({
                testCounts: { passed: 1, failed: 0, skipped: 0, total: 1 },
                metricsRuns: [
                    {
                        timestamp: new Date().toISOString(),
                        project: 'p',
                        passed: 1,
                        failed: 0,
                        skipped: 0,
                        total: 1,
                        duration: 100,
                        tests: [{ title: 't', state: 'passed', duration: 100 }],
                    },
                ],
            });

            await expect(generatePrReport({ dataHub: hub })).rejects.toThrow(/runPassRate/);
            expect(mockPRComment.postPrComment).not.toHaveBeenCalled();
        });
    });
});
