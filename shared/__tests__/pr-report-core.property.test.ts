import * as fc from 'fast-check';
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

const mockGlobalHub = vi.hoisted(() => ({
    getDataHub: vi.fn().mockReturnValue({
        loadMetricsStore: vi.fn().mockReturnValue({ runs: [] }),
        saveParseResult: vi.fn(),
        saveRun: vi.fn(),
        loadRun: vi.fn().mockReturnValue(null),
        saveCoverageSnapshot: vi.fn(),
        loadCoverageHistory: vi.fn().mockReturnValue([]),
        saveFailureClassification: vi.fn(),
        loadFailureClassifications: vi.fn().mockReturnValue([]),
        saveMetricsStore: vi.fn(),
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
const mockFlakiness = vi.hoisted(() => ({
    calcFlakinessEntries: vi.fn().mockReturnValue([]),
}));
const mockTrends = vi.hoisted(() => ({
    calcMetricsTrends: vi.fn().mockReturnValue([]),
}));

vi.mock('fs', () => ({
    default: { mkdirSync: vi.fn(), writeFileSync: vi.fn() },
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
}));
vi.mock('../metrics.js', () => mockMetrics);
vi.mock('../health-score.js', () => mockHealthScore);
vi.mock('../quality-gate.js', () => mockQualityGate);
vi.mock('../github-check-run.js', () => mockCheckRun);
vi.mock('../github-pr-comment.js', () => mockPRComment);
vi.mock('../report-html.js', () => mockHtml);
vi.mock('../coverage-source.js', () => mockCoverage);
vi.mock('../data-hub/global-hub.js', () => mockGlobalHub);
vi.mock('../data-hub/compute/flakiness-entries.js', () => mockFlakiness);
vi.mock('../data-hub/compute/metrics-trends.js', () => mockTrends);

import { generatePrReport, computeDiffComparison } from '../pr-report-core.js';
import type { FlatTest } from '../result_parser.js';

const FlatTestArb: fc.Arbitrary<FlatTest> = fc.record({
    title: fc.string({ minLength: 1, maxLength: 20 }),
    state: fc.constantFrom('passed' as const, 'failed' as const, 'skipped' as const),
    duration: fc.nat({ max: 60000 }),
});

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

describe('Pr Report Core.Property', () => {
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
        mockCoverage.readIstanbulCoverage.mockReturnValue(undefined);
    });

    afterAll(() => {
        delete process.env['GITHUB_STEP_SUMMARY'];
    });

    describe('GeneratePrReport — passRate invariants (property-based)', () => {
        it('passRate is always in [0, 100]', async () => {
            expect.hasAssertions();

            await fc.assert(
                fc.asyncProperty(
                    fc.array(FlatTestArb, { minLength: 1, maxLength: 5 }),
                    fc.nat({ max: 100 }),
                    fc.nat({ max: 100 }),
                    fc.nat({ max: 100 }),
                    async (tests, passed, failed, skipped) => {
                        const total = passed + failed + skipped;
                        if (total === 0) return;
                        const result = await generatePrReport({
                            tests,
                            stats: { passed, failed, skipped, total, duration: 1000 },
                            skipAi: true,
                            skipQuality: true,
                            skipFlaky: true,
                        });

                        expect(result.passRate).toBeGreaterThanOrEqual(0);
                        expect(result.passRate).toBeLessThanOrEqual(100);
                    },
                ),
                { numRuns: 100 },
            );
        });

        it('passRate is 100 when failed is 0 and passed > 0', async () => {
            expect.hasAssertions();

            await fc.assert(
                fc.asyncProperty(
                    fc.array(FlatTestArb, { minLength: 1, maxLength: 5 }),
                    fc.integer({ min: 1, max: 100 }),
                    async (tests, passed) => {
                        const result = await generatePrReport({
                            tests,
                            stats: { passed, failed: 0, skipped: 0, total: passed, duration: 1000 },
                            skipAi: true,
                            skipQuality: true,
                            skipFlaky: true,
                        });

                        expect(result.passRate).toBe(100);
                    },
                ),
                { numRuns: 100 },
            );
        });

        it('passRate is 0 when passed is 0 and failed > 0', async () => {
            expect.hasAssertions();

            await fc.assert(
                fc.asyncProperty(
                    fc.array(FlatTestArb, { minLength: 1, maxLength: 5 }),
                    fc.integer({ min: 1, max: 100 }),
                    async (tests, failed) => {
                        const result = await generatePrReport({
                            tests,
                            stats: { passed: 0, failed, skipped: 0, total: failed, duration: 1000 },
                            skipAi: true,
                            skipQuality: true,
                            skipFlaky: true,
                        });

                        expect(result.passRate).toBe(0);
                    },
                ),
                { numRuns: 100 },
            );
        });

        it('passRate is 50 when passed === failed > 0', async () => {
            expect.hasAssertions();

            await fc.assert(
                fc.asyncProperty(
                    fc.array(FlatTestArb, { minLength: 1, maxLength: 5 }),
                    fc.integer({ min: 1, max: 50 }),
                    async (tests, n) => {
                        const result = await generatePrReport({
                            tests,
                            stats: { passed: n, failed: n, skipped: 0, total: n * 2, duration: 1000 },
                            skipAi: true,
                            skipQuality: true,
                            skipFlaky: true,
                        });

                        expect(result.passRate).toBe(50);
                    },
                ),
                { numRuns: 100 },
            );
        });
    });

    describe('ComputeDiffComparison — invariants (property-based)', () => {
        const FlatTestArbForDiff: fc.Arbitrary<FlatTest> = fc.record(
            {
                title: fc.string({ minLength: 1, maxLength: 20 }),
                state: fc.constantFrom('passed' as const, 'failed' as const, 'skipped' as const),
                duration: fc.nat({ max: 60000 }),
            },
            { requiredKeys: ['title', 'state', 'duration'] },
        );

        it('returns undefined when previous is empty', () => {
            expect.hasAssertions();

            fc.assert(
                fc.property(fc.array(FlatTestArbForDiff, { minLength: 1, maxLength: 10 }), (current) => {
                    const result = computeDiffComparison(current, []);

                    expect(result).toBeUndefined();
                }),
                { numRuns: 100 },
            );
        });

        it('returns undefined when current and previous are identical', () => {
            expect.hasAssertions();

            fc.assert(
                fc.property(fc.array(FlatTestArbForDiff, { minLength: 1, maxLength: 10 }), (tests) => {
                    const result = computeDiffComparison(tests, tests);

                    expect(result).toBeUndefined();
                }),
                { numRuns: 100 },
            );
        });

        it('newFailures only contains tests that failed in current but passed in previous', () => {
            expect.hasAssertions();

            fc.assert(
                fc.property(
                    fc.array(FlatTestArbForDiff, { minLength: 1, maxLength: 10 }),
                    fc.array(FlatTestArbForDiff, { minLength: 1, maxLength: 10 }),
                    (current, previous) => {
                        const result = computeDiffComparison(current, previous);

                        expect(
                            result === undefined ? computeDiffComparison(current, previous) : undefined,
                        ).toBeUndefined();

                        if (result === undefined) return;
                        for (const nf of result.newFailures) {
                            const prev = previous.find((p) => p.title === nf.title);
                            if (!prev) throw new Error('prev must exist in newFailures');

                            expect(nf.state).toBe('failed');
                            expect(prev.state).not.toBe('failed');
                        }
                    },
                ),
                { numRuns: 100 },
            );
        });

        it('newPasses only contains tests that passed in current but failed in previous', () => {
            expect.hasAssertions();

            fc.assert(
                fc.property(
                    fc.array(FlatTestArbForDiff, { minLength: 1, maxLength: 10 }),
                    fc.array(FlatTestArbForDiff, { minLength: 1, maxLength: 10 }),
                    (current, previous) => {
                        const result = computeDiffComparison(current, previous);

                        expect(
                            result === undefined ? computeDiffComparison(current, previous) : undefined,
                        ).toBeUndefined();

                        if (result === undefined) return;
                        for (const np of result.newPasses) {
                            const prev = previous.find((p) => p.title === np.title);
                            if (!prev) throw new Error('prev must exist in newPasses');

                            expect(np.state).not.toBe('failed');
                            expect(prev.state).toBe('failed');
                        }
                    },
                ),
                { numRuns: 100 },
            );
        });

        it('flaky contains tests whose state changed between runs', () => {
            expect.hasAssertions();

            fc.assert(
                fc.property(
                    fc.array(FlatTestArbForDiff, { minLength: 1, maxLength: 10 }),
                    fc.array(FlatTestArbForDiff, { minLength: 1, maxLength: 10 }),
                    (current, previous) => {
                        const result = computeDiffComparison(current, previous);

                        expect(
                            result === undefined ? computeDiffComparison(current, previous) : undefined,
                        ).toBeUndefined();

                        if (result === undefined) return;
                        for (const f of result.flaky) {
                            const prev = previous.find((p) => p.title === f.title);
                            const curr = current.find((c) => c.title === f.title);
                            if (!prev) throw new Error('prev must exist in flaky');
                            if (!curr) throw new Error('curr must exist in flaky');

                            expect(f.state).not.toBe(prev.state);
                        }
                    },
                ),
                { numRuns: 100 },
            );
        });

        it('newFailures and newPasses are disjoint', () => {
            expect.hasAssertions();

            fc.assert(
                fc.property(
                    fc.array(FlatTestArbForDiff, { minLength: 1, maxLength: 10 }),
                    fc.array(FlatTestArbForDiff, { minLength: 1, maxLength: 10 }),
                    (current, previous) => {
                        const result = computeDiffComparison(current, previous);

                        expect(
                            result === undefined ? computeDiffComparison(current, previous) : undefined,
                        ).toBeUndefined();

                        if (result === undefined) return;
                        const failureTitles = new Set(result.newFailures.map((f) => f.title));
                        const passTitles = new Set(result.newPasses.map((p) => p.title));
                        for (const title of failureTitles) {
                            expect(passTitles.has(title)).toBeFalsy();
                        }
                    },
                ),
                { numRuns: 100 },
            );
        });

        it('all returned tests exist in current run', () => {
            expect.hasAssertions();

            fc.assert(
                fc.property(
                    fc.array(FlatTestArbForDiff, { minLength: 1, maxLength: 10 }),
                    fc.array(FlatTestArbForDiff, { minLength: 1, maxLength: 10 }),
                    (current, previous) => {
                        const result = computeDiffComparison(current, previous);

                        expect(
                            result === undefined ? computeDiffComparison(current, previous) : undefined,
                        ).toBeUndefined();

                        if (result === undefined) return;
                        const currentTitles = new Set(current.map((t) => t.title));
                        for (const f of result.newFailures) {
                            expect(currentTitles.has(f.title)).toBeTruthy();
                        }
                        for (const p of result.newPasses) {
                            expect(currentTitles.has(p.title)).toBeTruthy();
                        }
                        for (const f of result.flaky) {
                            expect(currentTitles.has(f.title)).toBeTruthy();
                        }
                    },
                ),
                { numRuns: 100 },
            );
        });
    });
});
