/**
 * Tests for pr-report-core.ts — CLI entry point for PR report generation.
 *
 * Mocks all shared/ dependencies and verifies the entry point's integration
 * behavior: CTRF parsing, delegation to generatePrReport(), and CI context.
 */
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseTestResultsFile } from '../result_parser.js';

vi.mock('../github-pr-comment.js', () => ({
    postPrComment: vi.fn().mockResolvedValue({
        id: 1,
        html_url: 'https://github.com/owner/repo/pull/42#issuecomment-1',
    }),
}));

const mockCreateCheckRun = vi.fn().mockResolvedValue({ id: 1, html_url: 'https://example.com/check/1' });
vi.mock('../github-check-run.js', () => ({
    createCheckRun: mockCreateCheckRun,
}));

vi.mock('../quality-gate.js', () => ({
    runQualityGate: vi.fn(() => ({
        overall: 'pass',
        score: 85,
        checks: [
            { name: 'health-score', status: 'pass', score: 85, threshold: 70, details: 'ok' },
            { name: 'pass-rate', status: 'pass', score: 94, threshold: 80, details: 'ok' },
            { name: 'flaky-rate', status: 'pass', score: 12, threshold: 30, details: 'ok' },
            { name: 'coverage', status: 'pass', score: 73, threshold: 70, details: 'ok' },
            { name: 'suite-speed', status: 'pass', score: 3, threshold: 8, details: 'ok' },
        ],
    })),
    formatQualityGateJson: vi.fn(),
    formatQualityGateText: vi.fn(),
}));

vi.mock('../quarantine.js', () => ({
    isQuarantined: vi.fn(() => undefined),
}));

vi.mock('../health-score.js', () => ({
    calculateHealthScore: vi.fn(() => ({
        overall: 90,
        grade: 'good',
        qualityGate: 'pass',
        dimensions: {
            passRate: { score: 94, status: 'pass' },
            flakyRate: { score: 88, status: 'pass' },
            coverage: { score: 73, status: 'pass' },
            suiteSpeed: { score: 97, status: 'pass' },
        },
        runCount: 5,
        timestamp: '2026-06-13T12:00:00.000Z',
    })),
}));

const mockGenerateHtmlReport = vi.fn(
    (_tests: unknown, _options?: unknown) => '<html><body>Mock HTML Report</body></html>',
);
vi.mock('../report-html.js', () => ({
    generateHtmlReport: mockGenerateHtmlReport,
}));

vi.mock('../metrics.js', () => ({
    loadMetrics: vi.fn(() => ({ runs: [] })),
    saveParseResult: vi.fn(),
    calculateFlakiness: vi.fn(() => []),
    getTrends: vi.fn(() => []),
}));

vi.mock('../feature-config.js', () => ({
    getPrReportConfig: vi.fn(() => ({
        enabled: true,
        publishTarget: 'github-actions',
    })),
    isPrReportEnabled: vi.fn(() => true),
    getProjectFeatureConfig: vi.fn(),
    loadFeatureConfig: vi.fn(() => ({})),
}));

const { postPrComment } = await import('../github-pr-comment.js');

const TEST_CTRF_DIR = path.resolve('reports', 'shared-test');
const TEST_CTRF_PATH = path.join(TEST_CTRF_DIR, 'ctrf-report.json');
const TEST_HTML_PATH = path.join(TEST_CTRF_DIR, 'pr-report.html');

function createCtrfFixture(
    tests: Array<{
        name: string;
        status: string;
        duration?: number;
        message?: string;
        trace?: string;
        suite?: string;
    }>,
): void {
    const data = {
        results: {
            tool: { name: 'vitest' },
            summary: {
                tests: tests.length,
                passed: tests.filter((t) => t.status === 'passed').length,
                failed: tests.filter((t) => t.status === 'failed').length,
                skipped: tests.filter((t) => t.status === 'skipped').length,
                pending: 0,
                other: 0,
                start: Date.now() - 1000,
                stop: Date.now(),
            },
            tests: tests.map((t) => ({
                name: t.name,
                status: t.status,
                duration: t.duration ?? 100,
                ...(t.message ? { message: t.message } : {}),
                ...(t.trace ? { trace: t.trace } : {}),
                ...(t.suite ? { suite: t.suite } : {}),
                type: 'unit',
            })),
        },
    };
    fs.mkdirSync(TEST_CTRF_DIR, { recursive: true });
    fs.writeFileSync(TEST_CTRF_PATH, JSON.stringify(data, null, 2), 'utf8');
}

describe('Pr-report entry point — CTRF parsing', () => {
    const originalEnv = { ...process.env };
    const penv = process.env as Record<string, string | undefined>;

    beforeEach(() => {
        penv['GITHUB_TOKEN'] = 'test-token';
        penv['GITHUB_REPOSITORY'] = 'owner/repo';
        penv['GITHUB_PR_NUMBER'] = '42';
        penv['GITHUB_SERVER_URL'] = 'https://github.com';
        penv['GITHUB_RUN_ID'] = 'run-123';
        vi.clearAllMocks();
    });

    afterEach(() => {
        process.env = { ...originalEnv };
        fs.rmSync(TEST_CTRF_DIR, { recursive: true, force: true });
    });

    it('parses CTRF fixture correctly via parseTestResultsFile', () => {
        createCtrfFixture([
            { name: 'pass-1', status: 'passed', duration: 100 },
            { name: 'fail-1', status: 'failed', duration: 200, message: 'Expected 5 got 4' },
            { name: 'skip-1', status: 'skipped', duration: 0 },
        ]);

        const result = parseTestResultsFile(TEST_CTRF_PATH);

        expect(result.tests).toHaveLength(3);
        expect(result.stats.passed).toBe(1);
        expect(result.stats.failed).toBe(1);
        expect(result.stats.skipped).toBe(1);
    });

    it('handles empty fixture gracefully', () => {
        createCtrfFixture([]);

        const result = parseTestResultsFile(TEST_CTRF_PATH);

        expect(result.tests).toHaveLength(0);
        expect(result.stats.total).toBe(0);
    });

    it('parses fixture with all failed tests', () => {
        createCtrfFixture([
            { name: 'fail-1', status: 'failed' },
            { name: 'fail-2', status: 'failed' },
        ]);

        const result = parseTestResultsFile(TEST_CTRF_PATH);

        expect(result.stats.failed).toBe(2);
        expect(result.stats.passed).toBe(0);
    });

    it('correctly extracts error messages from failures', () => {
        createCtrfFixture([{ name: 'fail-1', status: 'failed', message: 'AssertionError: expected 1 to equal 2' }]);

        const result = parseTestResultsFile(TEST_CTRF_PATH);
        const test = result.tests[0] as import('../result_parser.js').FlatTest;

        expect(test.error).toBe('AssertionError: expected 1 to equal 2');
    });

    it('handles missing CTRF file gracefully', () => {
        expect(fs.existsSync(TEST_CTRF_PATH)).toBeFalsy();

        const result = parseTestResultsFile(TEST_CTRF_PATH);

        expect(result.error).toBeDefined();
        expect(result.tests).toStrictEqual([]);
    });

    it('builds correct suite hierarchy from test data', () => {
        createCtrfFixture([{ name: 'deep-test', status: 'passed', suite: 'Root > Level1 > Level2' }]);

        const result = parseTestResultsFile(TEST_CTRF_PATH);
        const test = result.tests[0] as (typeof result.tests)[number];

        expect(test.fullTitle).toBe('Root > Level1 > Level2 > deep-test');
    });

    it('correctly computes statistics for mixed results', () => {
        createCtrfFixture([
            { name: 't1', status: 'passed', duration: 100 },
            { name: 't2', status: 'passed', duration: 200 },
            { name: 't3', status: 'failed', duration: 50 },
            { name: 't4', status: 'skipped', duration: 0 },
            { name: 't5', status: 'passed', duration: 150 },
        ]);

        const result = parseTestResultsFile(TEST_CTRF_PATH);

        expect(result.stats.passed).toBe(3);
        expect(result.stats.failed).toBe(1);
        expect(result.stats.skipped).toBe(1);
        expect(result.stats.total).toBe(5);
        expect(result.stats.duration).toBeGreaterThan(0);
    });
});

describe('Pr-report entry point — quality gate check run', () => {
    const originalEnv = { ...process.env };
    const originalArgv = process.argv;
    let penv = process.env as Record<string, string | undefined>;

    beforeEach(() => {
        penv = process.env;
        penv['GITHUB_TOKEN'] = 'test-token';
        penv['GITHUB_REPOSITORY'] = 'owner/repo';
        penv['GITHUB_PR_NUMBER'] = '42';
        penv['GITHUB_SERVER_URL'] = 'https://github.com';
        penv['GITHUB_RUN_ID'] = 'run-123';
        process.argv = ['node', 'test', '--ctrf', TEST_CTRF_PATH, '--html-output', TEST_HTML_PATH];
        vi.clearAllMocks();
    });

    afterEach(() => {
        process.env = { ...originalEnv };
        process.argv = originalArgv;
        fs.rmSync(TEST_CTRF_DIR, { recursive: true, force: true });
    });

    it('calls createCheckRun with success conclusion when quality gate passes', async () => {expect.hasAssertions();

        createCtrfFixture([{ name: 'pass-1', status: 'passed', duration: 100 }]);

        const { main } = await import('../pr-report-core.js');
        const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

        await main();

        expect(mockCreateCheckRun).toHaveBeenCalledWith(
            expect.objectContaining({
                name: 'Quality Gate',
                status: 'completed',
                conclusion: 'success',
            }),
        );

        exitSpy.mockRestore();
    });

    it('calls createCheckRun with failure conclusion when quality gate fails', async () => {expect.hasAssertions();

        const qgMod = await import('../quality-gate.js');
        vi.mocked(qgMod.runQualityGate).mockReturnValueOnce({
            overall: 'fail',
            score: 55,
            checks: [
                { name: 'health-score', status: 'fail', score: 55, threshold: 70, details: 'too low' },
                { name: 'pass-rate', status: 'pass', score: 94, threshold: 80, details: 'ok' },
                { name: 'flaky-rate', status: 'pass', score: 12, threshold: 30, details: 'ok' },
                { name: 'coverage', status: 'fail', score: 45, threshold: 70, details: 'too low' },
                { name: 'suite-speed', status: 'pass', score: 3, threshold: 8, details: 'ok' },
            ],
        });

        createCtrfFixture([{ name: 'pass-1', status: 'passed', duration: 100 }]);

        const { main } = await import('../pr-report-core.js');
        const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

        await main();

        expect(mockCreateCheckRun).toHaveBeenCalledWith(
            expect.objectContaining({
                name: 'Quality Gate',
                status: 'completed',
                conclusion: 'failure',
            }),
        );

        exitSpy.mockRestore();
    });
});

describe('Pr-report entry point — flaky detection with quarantine', () => {
    const originalEnv = { ...process.env };
    const originalArgv = process.argv;
    let penv = process.env as Record<string, string | undefined>;

    beforeEach(() => {
        penv = process.env;
        penv['GITHUB_TOKEN'] = 'test-token';
        penv['GITHUB_REPOSITORY'] = 'owner/repo';
        penv['GITHUB_PR_NUMBER'] = '42';
        penv['GITHUB_SERVER_URL'] = 'https://github.com';
        penv['GITHUB_RUN_ID'] = 'run-123';
        process.argv = ['node', 'test', '--ctrf', TEST_CTRF_PATH, '--html-output', TEST_HTML_PATH];
        vi.clearAllMocks();
    });

    afterEach(() => {
        process.env = { ...originalEnv };
        process.argv = originalArgv;
        fs.rmSync(TEST_CTRF_DIR, { recursive: true, force: true });
    });

    it('adds quarantine column when flaky tests exist', async () => {expect.hasAssertions();

        const metricsMod = await import('../metrics.js');
        const mockEntries = [
            { title: 'flaky-test-1', rate: 0.5, passCount: 2, failCount: 2, skipCount: 1, totalRuns: 5 },
        ];
        vi.mocked(metricsMod.calculateFlakiness).mockImplementation(() => mockEntries);

        createCtrfFixture([{ name: 'pass-1', status: 'passed', duration: 100 }]);

        const { main } = await import('../pr-report-core.js');
        const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

        await main();

        expect(postPrComment).toHaveBeenCalledWith(expect.any(String));

        const firstCall = vi.mocked(postPrComment).mock.calls[0] as [string];
        const commentBody = firstCall[0];

        expect(commentBody).toContain('Quarantine');
        expect(commentBody).toContain('⚠️ New');
        expect(commentBody).toContain('flaky-test-1');
        expect(commentBody).toContain('50%');
        expect(commentBody).toContain('2/5');

        exitSpy.mockRestore();
    });

    it('shows quarantined status for quarantined flaky tests', async () => {expect.hasAssertions();

        const metricsMod = await import('../metrics.js');
        const mockEntries = [
            { title: 'flaky-test-2', rate: 0.8, passCount: 1, failCount: 4, skipCount: 1, totalRuns: 6 },
        ];
        vi.mocked(metricsMod.calculateFlakiness).mockImplementation(() => mockEntries);

        const quarantineMod = await import('../quarantine.js');
        vi.mocked(quarantineMod.isQuarantined).mockImplementation((title: string) =>
            title === 'flaky-test-2'
                ? {
                      testTitle: 'flaky-test-2',
                      reason: 'known',
                      quarantinedBy: 'system',
                      date: '',
                      expiresAt: '',
                      flakyRate: 0.8,
                      reviewRequired: false,
                      permanent: false,
                  }
                : undefined,
        );

        createCtrfFixture([{ name: 'pass-1', status: 'passed', duration: 100 }]);

        const { main } = await import('../pr-report-core.js');
        const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

        await main();

        expect(postPrComment).toHaveBeenCalledWith(expect.any(String));

        const firstCall2 = vi.mocked(postPrComment).mock.calls[0] as [string];
        const commentBody = firstCall2[0];

        expect(commentBody).toContain('🔒 Quarantined');
        expect(commentBody).not.toContain('⚠️ New');

        exitSpy.mockRestore();
    });

    it('only shows suggestion when there are new (non-quarantined) flaky tests', async () => {expect.hasAssertions();

        const metricsMod = await import('../metrics.js');
        const mockEntries: import('../metrics.js').FlakinessEntry[] = [
            { title: 'new-flaky-1', rate: 0.4, passCount: 3, failCount: 3, skipCount: 1, totalRuns: 7 },
            { title: 'new-flaky-2', rate: 0.35, passCount: 2, failCount: 3, skipCount: 1, totalRuns: 6 },
        ];
        vi.mocked(metricsMod.calculateFlakiness).mockImplementation(() => mockEntries);

        const quarantineMod = await import('../quarantine.js');
        vi.mocked(quarantineMod.isQuarantined).mockReturnValue(undefined);

        createCtrfFixture([{ name: 'pass-1', status: 'passed', duration: 100 }]);

        const { main } = await import('../pr-report-core.js');
        const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

        await main();

        expect(postPrComment).toHaveBeenCalledWith(expect.any(String));

        const firstCall3 = vi.mocked(postPrComment).mock.calls[0] as [string];
        const commentBody = firstCall3[0];

        expect(commentBody).toContain('2 flaky test(s) not yet quarantined');
        expect(commentBody).toContain('Consider adding them to quarantine');

        exitSpy.mockRestore();
    });

    it('skips suggestion when all flaky tests are quarantined', async () => {expect.hasAssertions();

        const metricsMod = await import('../metrics.js');
        const mockEntries: import('../metrics.js').FlakinessEntry[] = [
            { title: 'known-flaky', rate: 0.6, passCount: 2, failCount: 2, skipCount: 1, totalRuns: 5 },
        ];
        vi.mocked(metricsMod.calculateFlakiness).mockImplementation(() => mockEntries);

        const quarantineMod = await import('../quarantine.js');
        vi.mocked(quarantineMod.isQuarantined).mockReturnValue({
            testTitle: 'known-flaky',
            reason: 'known',
            quarantinedBy: 'system',
            date: '',
            expiresAt: '',
            flakyRate: 0.6,
            reviewRequired: false,
            permanent: false,
        });

        createCtrfFixture([{ name: 'pass-1', status: 'passed', duration: 100 }]);

        const { main } = await import('../pr-report-core.js');
        const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

        await main();

        expect(postPrComment).toHaveBeenCalledWith(expect.any(String));

        const firstCall4 = vi.mocked(postPrComment).mock.calls[0] as [string];
        const commentBody = firstCall4[0];

        expect(commentBody).not.toContain('not yet quarantined');

        exitSpy.mockRestore();
    });

    it('handles flaky section when calculateFlakiness returns empty', async () => {expect.hasAssertions();

        const metricsMod = await import('../metrics.js');
        vi.mocked(metricsMod.calculateFlakiness).mockImplementation(() => []);

        createCtrfFixture([{ name: 'pass-1', status: 'passed', duration: 100 }]);

        const { main } = await import('../pr-report-core.js');
        const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

        await main();

        expect(postPrComment).toHaveBeenCalledWith(expect.any(String));

        const firstCall5 = vi.mocked(postPrComment).mock.calls[0] as [string];
        const commentBody = firstCall5[0];

        expect(commentBody).not.toContain('⚠️ Flaky Tests');

        exitSpy.mockRestore();
    });
});

describe('Pr-report entry point — HTML report generation', () => {
    const originalEnv = { ...process.env };
    const originalArgv = process.argv;
    let penv = process.env as Record<string, string | undefined>;

    beforeEach(() => {
        penv = process.env;
        penv['GITHUB_TOKEN'] = 'test-token';
        penv['GITHUB_REPOSITORY'] = 'owner/repo';
        penv['GITHUB_PR_NUMBER'] = '42';
        penv['GITHUB_SERVER_URL'] = 'https://github.com';
        penv['GITHUB_RUN_ID'] = 'run-123';
        penv['GITHUB_REF_NAME'] = 'feature-branch';
        process.argv = ['node', 'test', '--ctrf', TEST_CTRF_PATH, '--html-output', TEST_HTML_PATH];
        vi.clearAllMocks();
    });

    afterEach(() => {
        process.env = { ...originalEnv };
        process.argv = originalArgv;
        fs.rmSync(TEST_CTRF_DIR, { recursive: true, force: true });
    });

    it('generates HTML report file when main succeeds', async () => {expect.hasAssertions();

        createCtrfFixture([
            { name: 'pass-1', status: 'passed', duration: 100 },
            { name: 'fail-1', status: 'failed', duration: 200, message: 'Expected 5 got 4' },
            { name: 'skip-1', status: 'skipped', duration: 0 },
        ]);

        const { main } = await import('../pr-report-core.js');
        const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

        await main();

        expect(fs.existsSync(TEST_HTML_PATH)).toBeTruthy();

        const content = fs.readFileSync(TEST_HTML_PATH, 'utf8');

        expect(content).toBe('<html><body>Mock HTML Report</body></html>');

        expect(mockGenerateHtmlReport).toHaveBeenCalledTimes(1);

        const genCall0 = mockGenerateHtmlReport.mock.calls[0];
        const opts0 = genCall0?.[1] as Record<string, unknown> | undefined;

        expect(opts0).toBeDefined();
        expect(opts0?.['title']).toContain('PR Report');
        expect(opts0?.['branch']).toBe('feature-branch');
        expect(opts0?.['trends']).toStrictEqual([]);
        expect(opts0?.['includeChart']).toBeTruthy();

        exitSpy.mockRestore();
    });

    it('includes healthScore in HTML report options', async () => {expect.hasAssertions();

        createCtrfFixture([
            { name: 'pass-1', status: 'passed', duration: 100 },
        ]);

        const { main } = await import('../pr-report-core.js');
        const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

        await main();

        const genCall0 = mockGenerateHtmlReport.mock.calls[0];
        const opts0 = genCall0?.[1] as Record<string, unknown> | undefined;

        expect(opts0?.['healthScore']).toBeDefined();

        exitSpy.mockRestore();
    });

    it('includes health score in HTML report options', async () => {expect.hasAssertions();

        createCtrfFixture([{ name: 'pass-1', status: 'passed', duration: 100 }]);

        const healthMod = await import('../health-score.js');
        vi.mocked(healthMod.calculateHealthScore).mockReturnValueOnce({
            overall: 75,
            grade: 'needs_attention',
            qualityGate: 'pass',
            dimensions: {
                passRate: { score: 80, status: 'pass' },
                flakyRate: { score: 70, status: 'pass' },
                coverage: { score: 65, status: 'fail' },
                suiteSpeed: { score: 85, status: 'pass' },
                executionRate: { score: 100, status: 'pass' },
            },
            runCount: 3,
            timestamp: '2026-06-13T12:00:00.000Z',
        });

        const { main } = await import('../pr-report-core.js');
        const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

        await main();

        expect(mockGenerateHtmlReport).toHaveBeenCalledTimes(1);

        const genCall2 = mockGenerateHtmlReport.mock.calls[0];
        const opts2 = genCall2?.[1] as Record<string, unknown> | undefined;
        const hs = opts2?.['healthScore'] as Record<string, unknown> | undefined;

        expect(hs?.['overall']).toBe(75);
        expect(hs?.['grade']).toBe('needs_attention');

        exitSpy.mockRestore();
    });

    it('computes diff comparison when store has a previous run', async () => {expect.hasAssertions();

        createCtrfFixture([
            { name: 'stable-test', status: 'passed', duration: 100 },
            { name: 'regression-test', status: 'failed', duration: 200, message: 'Expected 5 got 4' },
        ]);

        const metricsMod = await import('../metrics.js');
        vi.mocked(metricsMod.loadMetrics).mockReturnValueOnce({
            runs: [
                {
                    timestamp: '2026-06-12T12:00:00.000Z',
                    project: 'qa_tools',
                    total: 2,
                    passed: 2,
                    failed: 0,
                    skipped: 0,
                    duration: 300,
                    tests: [
                        { title: 'stable-test', state: 'passed', duration: 100 },
                        { title: 'regression-test', state: 'passed', duration: 200 },
                    ],
                },
            ],
        });

        const { main } = await import('../pr-report-core.js');
        const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

        await main();

        expect(mockGenerateHtmlReport).toHaveBeenCalledTimes(1);

        const genCall3 = mockGenerateHtmlReport.mock.calls[0];
        const opts3 = genCall3?.[1] as Record<string, unknown> | undefined;
        const diff = opts3?.['diffComparison'] as Record<string, unknown> | undefined;

        expect(diff).toBeDefined();
        expect(((diff?.['newFailures'] ?? []) as unknown[])).toHaveLength(1);
        expect((diff?.['newFailures'] as Array<{ title: string }> | undefined)?.[0]?.title).toBe('regression-test');

        exitSpy.mockRestore();
    });

    it('skips diff comparison when store is empty', async () => {expect.hasAssertions();

        createCtrfFixture([{ name: 'pass-1', status: 'passed', duration: 100 }]);

        const { main } = await import('../pr-report-core.js');
        const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

        await main();

        expect(mockGenerateHtmlReport).toHaveBeenCalledTimes(1);

        const genCall4 = mockGenerateHtmlReport.mock.calls[0];
        const opts4 = genCall4?.[1] as Record<string, unknown> | undefined;

        expect(opts4?.['diffComparison']).toBeUndefined();

        exitSpy.mockRestore();
    });

    it('includes trends in HTML report options', async () => {expect.hasAssertions();

        createCtrfFixture([{ name: 'pass-1', status: 'passed', duration: 100 }]);

        const metricsMod = await import('../metrics.js');
        vi.mocked(metricsMod.getTrends).mockReturnValue([
            { label: '2026-06-11', passRate: 92, total: 100, failed: 8 },
            { label: '2026-06-12', passRate: 95, total: 100, failed: 5 },
        ]);

        const { main } = await import('../pr-report-core.js');
        const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

        await main();

        expect(mockGenerateHtmlReport).toHaveBeenCalledTimes(1);

        const genFirstCall = mockGenerateHtmlReport.mock.calls[0];
        const options = genFirstCall?.[1] as Record<string, unknown> | undefined;
        const trends = options?.['trends'] as Array<{ label: string; passRate: number }> | undefined;

        expect(trends).toHaveLength(2);
        expect(trends?.[0]?.label).toBe('2026-06-11');
        expect(trends?.[1]?.passRate).toBe(95);

        exitSpy.mockRestore();
    });

    it('includes grade and artifact link in Check Run summary', async () => {expect.hasAssertions();

        createCtrfFixture([{ name: 'pass-1', status: 'passed', duration: 100 }]);

        const { main } = await import('../pr-report-core.js');
        const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

        await main();

        expect(mockCreateCheckRun).toHaveBeenCalledWith(
            expect.objectContaining({
                name: 'Quality Gate',
                status: 'completed',
                conclusion: 'success',
            }),
        );

        const crFirstArg = mockCreateCheckRun.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
        const crOutput = crFirstArg?.['output'] as Record<string, unknown> | undefined;

        expect(crOutput?.['title'] as string).toContain('Grade: GOOD');

        const summary = crOutput?.['summary'] as string | undefined;

        expect(summary).toContain('Download HTML report');
        expect(summary).toContain('https://github.com/owner/repo/actions/runs/run-123?pr=1#artifacts');
        expect(summary).not.toContain('](#artifacts)');

        exitSpy.mockRestore();
    });

    it('creates flakiness map from flaky entries for HTML report', async () => {expect.hasAssertions();

        createCtrfFixture([{ name: 'pass-1', status: 'passed', duration: 100 }]);

        const metricsMod = await import('../metrics.js');
        vi.mocked(metricsMod.calculateFlakiness).mockReturnValue([
            { title: 'flaky-1', rate: 0.5, passCount: 3, failCount: 3, skipCount: 1, totalRuns: 7 },
            { title: 'flaky-2', rate: 0.33, passCount: 4, failCount: 2, skipCount: 1, totalRuns: 7 },
        ]);

        const { main } = await import('../pr-report-core.js');
        const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

        await main();

        expect(mockGenerateHtmlReport).toHaveBeenCalledTimes(1);

        const genFirstCall = mockGenerateHtmlReport.mock.calls[0];
        const options = genFirstCall?.[1] as Record<string, unknown> | undefined;
        const flakinessMap = options?.['flakinessMap'] as Record<string, number> | undefined;

        expect(flakinessMap).toBeDefined();
        expect(flakinessMap?.['flaky-1']).toBe(0.5);
        expect(flakinessMap?.['flaky-2']).toBe(0.33);

        exitSpy.mockRestore();
    });

    it('includes coverageSource in HTML report options', async () => {expect.hasAssertions();

        createCtrfFixture([{ name: 'pass-1', status: 'passed', duration: 100 }]);

        const { main } = await import('../pr-report-core.js');
        const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

        await main();

        expect(mockGenerateHtmlReport).toHaveBeenCalledTimes(1);

        const genCall = mockGenerateHtmlReport.mock.calls[0];
        const opts = genCall?.[1] as Record<string, unknown> | undefined;

        expect(opts?.['coverageSource']).toBe('none');

        exitSpy.mockRestore();
    });

    it('handles missing env vars gracefully in HTML report', async () => {expect.hasAssertions();

        createCtrfFixture([{ name: 'pass-1', status: 'passed', duration: 100 }]);

        delete penv['GITHUB_REF_NAME'];
        delete penv['GITHUB_SERVER_URL'];

        const { main } = await import('../pr-report-core.js');
        const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

        await main();

        expect(mockGenerateHtmlReport).toHaveBeenCalledTimes(1);

        const genFirstCall = mockGenerateHtmlReport.mock.calls[0];
        const opts = genFirstCall?.[1] as Record<string, unknown> | undefined;

        expect((opts?.['title'] ?? '') as string).not.toContain('(');
        expect(opts?.['ciUrl']).toBeUndefined();
        expect(opts?.['branch']).toBeUndefined();

        exitSpy.mockRestore();
    });
});
