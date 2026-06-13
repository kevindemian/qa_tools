/**
 * Tests for pr-report.ts script components.
 */

import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseTestResultsFile } from '../../shared/result_parser.js';

// Mock postPrComment
vi.mock('../../shared/github-pr-comment.js', () => ({
    postPrComment: vi.fn().mockResolvedValue({
        id: 1,
        html_url: 'https://github.com/owner/repo/pull/42#issuecomment-1',
    }),
}));

// Mock createCheckRun (always succeeds by default)
const mockCreateCheckRun = vi.fn().mockResolvedValue({ id: 1, html_url: 'https://example.com/check/1' });
vi.mock('../../shared/github-check-run.js', () => ({
    createCheckRun: mockCreateCheckRun,
}));

// Mock quality-gate
vi.mock('../../shared/quality-gate.js', () => ({
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

// Mock quarantine
vi.mock('../../shared/quarantine.js', () => ({
    isQuarantined: vi.fn(() => undefined),
}));

// Mock metrics
vi.mock('../../shared/metrics.js', () => ({
    loadMetrics: vi.fn(() => ({ runs: [] })),
    calculateFlakiness: vi.fn(() => []),
}));

// Import after mocks
const { postPrComment } = await import('../../shared/github-pr-comment.js');

const TEST_CTRF_DIR = path.resolve('reports-test-pr');
const TEST_CTRF_PATH = path.join(TEST_CTRF_DIR, 'ctrf-report.json');

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

describe('pr-report script', () => {
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
        const test = result.tests[0] as import('../../shared/result_parser.js').FlatTest;
        expect(test.error).toBe('AssertionError: expected 1 to equal 2');
    });

    it('handles missing CTRF file gracefully', () => {
        // Don't create the fixture — file won't exist
        expect(fs.existsSync(TEST_CTRF_PATH)).toBe(false);
        // parseTestResultsFile returns error object
        const result = parseTestResultsFile(TEST_CTRF_PATH);
        expect(result.error).toBeDefined();
        expect(result.tests).toEqual([]);
    });

    it('builds correct suite hierarchy from test data', () => {
        // Create a multi-level test parse
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
        // Duration uses summary.stop - summary.start when both are set
        expect(result.stats.duration).toBeGreaterThan(0);
    });
});

describe('pr-report quality gate check run', () => {
    const originalEnv = { ...process.env };
    let penv = process.env as Record<string, string | undefined>;

    beforeEach(() => {
        penv = process.env;
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

    it('calls createCheckRun with success conclusion when quality gate passes', async () => {
        createCtrfFixture([{ name: 'pass-1', status: 'passed', duration: 100 }]);

        const { main } = await import('../pr-report.js');
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

    it('calls createCheckRun with failure conclusion when quality gate fails', async () => {
        // Override quality-gate mock for this test only
        const qgMod = await import('../../shared/quality-gate.js');
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

        const { main } = await import('../pr-report.js');
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

describe('pr-report flaky detection with quarantine', () => {
    const originalEnv = { ...process.env };
    let penv = process.env as Record<string, string | undefined>;

    beforeEach(() => {
        penv = process.env;
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

    it('adds quarantine column when flaky tests exist', async () => {
        const metricsMod = await import('../../shared/metrics.js');
        const mockEntries = [
            { title: 'flaky-test-1', rate: 0.5, passCount: 2, failCount: 2, skipCount: 1, totalRuns: 5 },
        ];
        vi.mocked(metricsMod.calculateFlakiness).mockReturnValueOnce(mockEntries);

        createCtrfFixture([{ name: 'pass-1', status: 'passed', duration: 100 }]);

        const { main } = await import('../pr-report.js');
        const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

        await main();

        expect(postPrComment).toHaveBeenCalled();
        const firstCall = vi.mocked(postPrComment).mock.calls[0] as [string];
        const commentBody = firstCall[0];
        expect(commentBody).toContain('Quarantine');
        expect(commentBody).toContain('⚠️ New');
        expect(commentBody).toContain('flaky-test-1');
        expect(commentBody).toContain('50%');
        expect(commentBody).toContain('2/5');

        exitSpy.mockRestore();
    });

    it('shows quarantined status for quarantined flaky tests', async () => {
        const metricsMod = await import('../../shared/metrics.js');
        const mockEntries = [
            { title: 'flaky-test-2', rate: 0.8, passCount: 1, failCount: 4, skipCount: 1, totalRuns: 6 },
        ];
        vi.mocked(metricsMod.calculateFlakiness).mockReturnValueOnce(mockEntries);

        const quarantineMod = await import('../../shared/quarantine.js');
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

        const { main } = await import('../pr-report.js');
        const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

        await main();

        expect(postPrComment).toHaveBeenCalled();
        const firstCall2 = vi.mocked(postPrComment).mock.calls[0] as [string];
        const commentBody = firstCall2[0];
        expect(commentBody).toContain('🔒 Quarantined');
        expect(commentBody).not.toContain('⚠️ New');

        exitSpy.mockRestore();
    });

    it('only shows suggestion when there are new (non-quarantined) flaky tests', async () => {
        const metricsMod = await import('../../shared/metrics.js');
        const mockEntries: import('../../shared/metrics.js').FlakinessEntry[] = [
            { title: 'new-flaky-1', rate: 0.4, passCount: 3, failCount: 3, skipCount: 1, totalRuns: 7 },
            { title: 'new-flaky-2', rate: 0.35, passCount: 2, failCount: 3, skipCount: 1, totalRuns: 6 },
        ];
        vi.mocked(metricsMod.calculateFlakiness).mockReturnValueOnce(mockEntries);

        const quarantineMod = await import('../../shared/quarantine.js');
        vi.mocked(quarantineMod.isQuarantined).mockReturnValue(undefined);

        createCtrfFixture([{ name: 'pass-1', status: 'passed', duration: 100 }]);

        const { main } = await import('../pr-report.js');
        const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

        await main();

        expect(postPrComment).toHaveBeenCalled();
        const firstCall3 = vi.mocked(postPrComment).mock.calls[0] as [string];
        const commentBody = firstCall3[0];
        expect(commentBody).toContain('2 flaky test(s) not yet quarantined');
        expect(commentBody).toContain('Consider adding them to quarantine');

        exitSpy.mockRestore();
    });

    it('skips suggestion when all flaky tests are quarantined', async () => {
        const metricsMod = await import('../../shared/metrics.js');
        const mockEntries: import('../../shared/metrics.js').FlakinessEntry[] = [
            { title: 'known-flaky', rate: 0.6, passCount: 2, failCount: 2, skipCount: 1, totalRuns: 5 },
        ];
        vi.mocked(metricsMod.calculateFlakiness).mockReturnValueOnce(mockEntries);

        const quarantineMod = await import('../../shared/quarantine.js');
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

        const { main } = await import('../pr-report.js');
        const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

        await main();

        expect(postPrComment).toHaveBeenCalled();
        const firstCall4 = vi.mocked(postPrComment).mock.calls[0] as [string];
        const commentBody = firstCall4[0];
        expect(commentBody).not.toContain('not yet quarantined');

        exitSpy.mockRestore();
    });

    it('handles flaky section when calculateFlakiness returns empty', async () => {
        const metricsMod = await import('../../shared/metrics.js');
        vi.mocked(metricsMod.calculateFlakiness).mockReturnValueOnce([]);

        createCtrfFixture([{ name: 'pass-1', status: 'passed', duration: 100 }]);

        const { main } = await import('../pr-report.js');
        const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

        await main();

        expect(postPrComment).toHaveBeenCalled();
        const firstCall5 = vi.mocked(postPrComment).mock.calls[0] as [string];
        const commentBody = firstCall5[0];
        // No flaky section → no quarantine header
        expect(commentBody).not.toContain('⚠️ Flaky Tests');

        exitSpy.mockRestore();
    });
});
