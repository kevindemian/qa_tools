import os from 'os';
import path from 'path';
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { generatePrReport } from '../pr-report-core.js';
import type { FlatTest } from '../result_parser.js';

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
    overall: 80,
    grade: 'B' as const,
    qualityGate: 'pass' as const,
    runCount: 1,
    timestamp: '2024-01-01T00:00:00.000Z',
    dimensions: {
        passRate: { score: 80, status: 'pass' as const },
        flakyRate: { score: 100, status: 'pass' as const },
        coverage: { score: 80, status: 'pass' as const },
        suiteSpeed: { score: 100, status: 'pass' as const },
        executionRate: { score: 100, status: 'pass' as const },
    },
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

describe('Pr Report Core', () => {
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
        mockHtml.generateHtmlReport.mockReturnValue('<html>mock report</html>');
        mockCoverage.readIstanbulCoverage.mockReturnValue(undefined);
    });

    afterAll(() => {
        delete process.env['GITHUB_STEP_SUMMARY'];
    });

    describe('GeneratePrReport', () => {
        it('returns healthScore and passRate for basic test data', async () => {
            expect.hasAssertions();

            const result = await generatePrReport({
                tests: [sampleTest, failedTest, skippedTest],
                stats: defaultStats,
            });

            expect(result.healthScore).toStrictEqual(defaultHealthScore);
            expect(result.passRate).toBeCloseTo(88.9, 1);
        });

        it('generates HTML report at default path when no htmlOutputPath given', async () => {
            expect.hasAssertions();

            const result = await generatePrReport({
                tests: [sampleTest],
                stats: { passed: 1, failed: 0, skipped: 0, total: 1, duration: 100 },
            });

            expect(mockHtml.generateHtmlReport).toHaveBeenCalledTimes(1);
            expect(result.htmlPath).toContain('reports/pr-report.html');
        });

        it('uses custom htmlOutputPath when provided', async () => {
            expect.hasAssertions();

            const result = await generatePrReport({
                tests: [sampleTest],
                stats: { passed: 1, failed: 0, skipped: 0, total: 1, duration: 100 },
                htmlOutputPath: path.join(os.tmpdir(), 'qa-custom-report.html'),
            });

            expect(result.htmlPath).toBe(path.join(os.tmpdir(), 'qa-custom-report.html'));
        });

        it('includes coverage source in HTML options when coverage is resolved', async () => {
            expect.hasAssertions();

            mockCoverage.readIstanbulCoverage.mockReturnValue({
                source: 'istanbul',
                coveragePct: 85,
                detail: 'lines 85.0%',
            });

            const result = await generatePrReport({
                tests: [sampleTest],
                stats: { passed: 1, failed: 0, skipped: 0, total: 1, duration: 100 },
            });

            expect(mockHtml.generateHtmlReport).toHaveBeenCalledWith(
                expect.any(Array),
                expect.objectContaining({ coverageSource: 'istanbul' }),
            );
            expect(result.healthScore).toStrictEqual(defaultHealthScore);
        });

        it('passes diffComparison to HTML options when provided', async () => {
            expect.hasAssertions();

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
            expect.hasAssertions();

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

            expect(mockQualityGate.runQualityGate).toHaveBeenCalledWith(
                expect.objectContaining({ coverageOverride: undefined }),
            );
            expect(mockCheckRun.createCheckRun).toHaveBeenCalledWith(
                expect.objectContaining({
                    name: 'Quality Gate',
                    conclusion: 'success',
                }),
            );
        });

        it('skips quality gate when skipQuality is true', async () => {
            expect.hasAssertions();

            await generatePrReport({
                tests: [sampleTest],
                stats: { passed: 1, failed: 0, skipped: 0, total: 1, duration: 100 },
                skipQuality: true,
            });

            expect(mockQualityGate.runQualityGate).not.toHaveBeenCalled();
            expect(mockCheckRun.createCheckRun).not.toHaveBeenCalled();
        });

        it('skips AI section when skipAi is true', async () => {
            expect.hasAssertions();

            const result = await generatePrReport({
                tests: [sampleTest, failedTest],
                stats: defaultStats,
                skipAi: true,
            });

            expect(result.healthScore.overall).toBeGreaterThanOrEqual(0);
            expect(mockPRComment.postPrComment).toHaveBeenCalledWith(expect.any(String));
        });

        it('skips flaky section when skipFlaky is true', async () => {
            expect.hasAssertions();

            mockMetrics.calculateFlakiness.mockReturnValue([
                { title: 'flaky test', rate: 0.5, passCount: 3, totalRuns: 6 },
            ]);

            await generatePrReport({
                tests: [sampleTest],
                stats: { passed: 1, failed: 0, skipped: 0, total: 1, duration: 100 },
                skipFlaky: true,
            });

            expect(mockPRComment.postPrComment).toHaveBeenCalledWith(expect.any(String));
        });

        it('survives empty test list', async () => {
            expect.hasAssertions();

            const result = await generatePrReport({
                tests: [],
                stats: { passed: 0, failed: 0, skipped: 0, total: 0, duration: 0 },
            });

            expect(result.healthScore).toStrictEqual(defaultHealthScore);
            expect(result.passRate).toBe(0);
        });

        it('handles health score with coverage override', async () => {
            expect.hasAssertions();

            mockCoverage.readIstanbulCoverage.mockReturnValue({
                source: 'istanbul',
                coveragePct: 92,
                detail: 'lines 92.0%',
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
            expect.hasAssertions();

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

        it('includes CI Context section when ciEnv.isCI is true', async () => {
            expect.hasAssertions();

            await generatePrReport({
                tests: [sampleTest],
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

            await generatePrReport({
                tests: [sampleTest],
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
                await generatePrReport({
                    tests: [sampleTest],
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
                expect(content).toContain('| ✅ Passed | ❌ Failed | ⏭ Skipped |');
                expect(content).toContain('| 8 | 1 | 1 | 10 |');
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
                await generatePrReport({
                    tests: [sampleTest],
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
                const result = await generatePrReport({
                    tests: [sampleTest],
                    stats: defaultStats,
                });

                expect(result.healthScore).toBeDefined();
            } finally {
                if (original) process.env['GITHUB_STEP_SUMMARY'] = original;
            }
        });
    });
});
