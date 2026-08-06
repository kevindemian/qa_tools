/**
 * Tests for report-html — HTML report generation using primitives.
 *
 * NOTE: local modules (logger, config-accessor) are NOT mocked — anti-mock-theater
 * (T3): the flow must run real and integrated (AGENTS §26.2). Config values that
 * the report reads are supplied via process.env, which the real Config accessor
 * reads. The real rootLogger is used (logs to stderr, harmless in tests).
 */

import { nonNull } from '../test-utils.js';
import { generateHtmlReport } from '../report/report-html.js';
import type { FlatTest } from '../result_parser.js';
import type { TestRunTab } from '../report/report-types.js';
import type { ComputedMetrics } from '../types/data-hub.js';

const MOCK_TESTS: FlatTest[] = [
    { title: 'Login Test', state: 'passed', duration: 1.2, fullTitle: 'Auth > Login Test' },
    { title: 'Logout Test', state: 'failed', duration: 0.5, fullTitle: 'Auth > Logout Test' },
];

function computedFor(tests: FlatTest[]): ComputedMetrics {
    const passed = tests.filter((t) => t.state === 'passed').length;
    const failed = tests.filter((t) => t.state === 'failed').length;
    const skipped = tests.filter((t) => t.state === 'skipped').length;
    return {
        passRate: passed + failed > 0 ? (passed / (passed + failed)) * 100 : 0,
        avgDuration: tests.length > 0 ? tests.reduce((s, t) => s + t.duration, 0) / tests.length : 0,
        suiteSpeedP95: 0,
        flakyRate: [],
        coverage: 0,
        pipelineCost: { totalRuns: 0, totalCostUsd: 0, billableMinutes: 0 },
        defectTrends: [],
        branchBreakdown: {},
        topFailingJobs: [],
        topFailureReasons: [],
        releaseScore: { overall: 0, grade: 'unknown' as const, metrics: {} },
        quarantineStatus: { blocked: 0, quarantined: 0, passed: 0 },
        testPassRate: passed + failed > 0 ? (passed / (passed + failed)) * 100 : 0,
        testCounts: { passed, failed, skipped, total: tests.length },
        framework: '',
        metricsRuns: [
            {
                timestamp: '2026-05-31T00:00:00Z',
                project: 'qa-tools',
                total: tests.length,
                passed,
                failed,
                skipped,
                duration: tests.reduce((s, t) => s + t.duration, 0),
                tests,
            },
        ],
    } as unknown as ComputedMetrics;
}

const HEALTH_SCORE: import('../types.js').HealthScoreResult = {
    overall: 85,
    grade: 'good' as const,
    qualityGate: 'pass',
    runCount: 10,
    timestamp: '2026-05-31T00:00:00Z',
    dimensions: {
        passRate: { score: 90, status: 'pass', available: true },
        flakyRate: { score: 85, status: 'pass', available: true },
        coverage: { score: 80, status: 'pass', available: true },
        suiteSpeed: { score: 75, status: 'fail', available: true },
        executionRate: { score: 100, status: 'pass', available: true },
    },
};

describe('GenerateHtmlReport', () => {
    beforeEach(() => {
        process.env['CI_COMMIT_BRANCH'] = 'main';
        process.env['CI_JOB_URL'] = 'https://ci.example.com/job/42';
    });

    afterEach(() => {
        delete process.env['CI_COMMIT_BRANCH'];
        delete process.env['CI_JOB_URL'];
    });

    it('returns valid HTML for basic test list', () => {
        const html = generateHtmlReport(MOCK_TESTS, { computed: computedFor(MOCK_TESTS) });

        expect(html).toContain('Login Test');
        expect(html).toContain('Logout Test');
    });

    it('includes quality gate when provided', () => {
        const html = generateHtmlReport(MOCK_TESTS, {
            computed: computedFor(MOCK_TESTS),
            title: 'Report',
            qualityGate: 80,
        });

        expect(html).toContain('Quality Gate');
    });

    it('handles empty test list', () => {
        const html = generateHtmlReport([], {
            computed: computedFor([]),
            title: 'Empty',
        });

        expect(html).toContain('Empty');
    });

    it('includes health score section when provided', () => {
        const html = generateHtmlReport(MOCK_TESTS, {
            computed: computedFor(MOCK_TESTS),
            title: 'Health',
            healthScore: HEALTH_SCORE,
        });

        expect(html).toContain('Test Suite Health');
        expect(html).toContain('Health Gate: Pass');
    });

    it('renders composite quality gate section with incomplete items when qualityGateResult provided', () => {
        const html = generateHtmlReport(MOCK_TESTS, {
            computed: computedFor(MOCK_TESTS),
            title: 'QG',
            qualityGateResult: {
                overall: 'pass',
                checks: [
                    {
                        name: 'health-score',
                        status: 'pass',
                        score: 85,
                        threshold: 70,
                        details: 'Health score: 85 (good)',
                    },
                ],
                score: 85,
                incompleteItems: ['failureRecords', 'deployments'],
            },
        });

        expect(html).toContain('data-component="quality-gate"');
        expect(html).toContain('health-score');
        expect(html).toContain('Dados ausentes (EIXO C)');
        expect(html).toContain('failureRecords');
        expect(html).toContain('deployments');
    });

    it('renders NO quality gate section when neither qualityGateResult nor qualityGate provided (D2/Q3)', () => {
        const html = generateHtmlReport(MOCK_TESTS, {
            computed: computedFor(MOCK_TESTS),
            title: 'NoGate',
        });

        expect(html).not.toContain('data-component="quality-gate"');
    });

    it('includes flakiness dashboard link when url and map provided', () => {
        const html = generateHtmlReport(MOCK_TESTS, {
            computed: computedFor(MOCK_TESTS),
            title: 'Flaky',
            flakinessDashboardUrl: 'https://dash.example.com',
            flakinessMap: { 'Test 1': 3 },
        });

        expect(html).toContain('Flakiness Dashboard');
    });

    it('includes CI branch link when ciUrl and branch provided', () => {
        const html = generateHtmlReport(MOCK_TESTS, {
            computed: computedFor(MOCK_TESTS),
            title: 'CI',
            branch: 'feature/test',
            ciUrl: 'https://ci.example.com/123',
        });

        expect(html).toContain('feature/test');
        expect(html).toContain('href');
    });

    it('includes branch text without link when no ciUrl', () => {
        const html = generateHtmlReport(MOCK_TESTS, {
            computed: computedFor(MOCK_TESTS),
            title: 'Branch',
            branch: 'feature/x',
        });

        expect(html).toContain('feature/x');
    });

    it('renders multi-run tabs when runs provided', () => {
        const runs: TestRunTab[] = [
            { name: 'Chrome', tests: MOCK_TESTS },
            { name: 'Firefox', tests: [nonNull(MOCK_TESTS[0])] },
        ];
        const html = generateHtmlReport(MOCK_TESTS, {
            computed: computedFor(MOCK_TESTS),
            title: 'Multi',
            runs,
        });

        expect(html).toContain('Chrome');
        expect(html).toContain('Firefox');
        expect(html).toContain('switchTab');
    });

    it('includes sidebar hierarchy when tests have fullTitle with >', () => {
        const testsWithHierarchy: FlatTest[] = [
            { title: 'T1', state: 'passed', duration: 10, fullTitle: 'Suite > T1' },
            { title: 'T2', state: 'failed', duration: 20, fullTitle: 'Other > T2' },
        ];
        const html = generateHtmlReport(testsWithHierarchy, {
            computed: computedFor(testsWithHierarchy),
            title: 'Hierarchy',
        });

        expect(html).toContain('Suite');
        expect(html).toContain('Other');
    });

    it('includes trend section when computed.metricsTrends provided', () => {
        const computed = computedFor(MOCK_TESTS);
        computed.metricsTrends = [
            { label: 'Mon', passRate: 90, total: 10, failed: 1 },
            { label: 'Tue', passRate: 85, total: 10, failed: 2 },
        ];
        const html = generateHtmlReport(MOCK_TESTS, {
            computed,
            title: 'Trends',
        });

        expect(html).toContain('Pass Rate Trend');
    });

    it('renders computed.passRate=0 even when metricsRuns implies 100% (B5 — no derive fallback)', () => {
        const computed = computedFor([]);
        computed.passRate = 0;
        computed.metricsRuns = [
            {
                timestamp: '2026-05-31T00:00:00Z',
                project: 'p',
                total: 2,
                passed: 2,
                failed: 0,
                skipped: 0,
                duration: 10,
                tests: [
                    { title: 'A', state: 'passed', duration: 5 },
                    { title: 'B', state: 'passed', duration: 5 },
                ],
            },
        ];

        const html = generateHtmlReport([], { computed, title: 'ZeroRate' });

        const passRateValue = /data-part="label">Pass Rate<\/div>\s*<div data-part="value">([^<]+)<\/div>/.exec(
            html,
        )?.[1];

        expect(passRateValue).toBe('0.0%');
    });

    it('fails explicitly when computed.passRate is non-finite (B5 — SSOT required)', () => {
        const computed = computedFor([]);
        computed.passRate = Number.NaN;

        const html = generateHtmlReport([], { computed, title: 'BadRate' });

        expect(html).toContain('Error generating report');
    });

    it('renders failure classifications exclusively from computed.failureClassifications (F0-T4 — no dual source)', () => {
        const computed = computedFor(MOCK_TESTS);
        computed.failureClassifications = { 'Logout Test': 'UI' };

        const html = generateHtmlReport(MOCK_TESTS, { computed, title: 'Cats' });

        expect(html).toContain('category-badge');
        expect(html).toContain('UI');
    });

    it('includes diff comparison when provided', () => {
        const diffComparison = {
            newFailures: [{ title: 'F1', state: 'failed' as const, duration: 100 }],
            newPasses: [{ title: 'P1', state: 'passed' as const, duration: 50 }],
            flaky: [] satisfies FlatTest[],
        };
        const html = generateHtmlReport(MOCK_TESTS, {
            computed: computedFor(MOCK_TESTS),
            title: 'Diff',
            diffComparison,
        });

        expect(html).toContain('Diff');
    });

    it('returns error page when computed is missing (SSOT required, no fallback)', () => {
        const html = generateHtmlReport(MOCK_TESTS, { title: 'Fail' });

        expect(html).toContain('Error generating report');
    });
});
