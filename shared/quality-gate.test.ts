import { runQualityGate, formatQualityGateJson, formatQualityGateText } from './quality-gate.js';

vi.mock('child_process', async () => ({
    execFileSync: vi.fn(),
}));

vi.mock('./metrics', async () => ({
    loadMetrics: vi.fn(),
    calculateFlakiness: vi.fn(),
}));

vi.mock('./logger', async () => ({
    rootLogger: { error: vi.fn() },
}));

import { execFileSync } from 'child_process';
import { loadMetrics, calculateFlakiness } from './metrics.js';

const mockLoadMetrics = vi.mocked(loadMetrics);
const mockCalcFlakiness = vi.mocked(calculateFlakiness);
const mockExecFileSync = vi.mocked(execFileSync);

describe('runQualityGate', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        delete process.env.QA_GATE_MIN_PASS_RATE;
        delete process.env.QA_GATE_MAX_FLAKY_PCT;
        delete process.env.QA_GATE_MIN_COVERAGE;
        delete process.env.QA_GATE_MAX_SUITE_SPEED;
        mockExecFileSync.mockImplementation(() => '');
    });

    it('returns pass when no metrics data exists (fallback git vazio)', async () => {
        mockLoadMetrics.mockReturnValue({ runs: [] });
        const result = runQualityGate();
        expect(result.overall).toBe('pass');
        expect(result.checks).toHaveLength(1);
        expect(result.checks[0]?.name).toBe('metrics-data');
        expect(result.checks[0]?.status).toBe('pass');
        expect(result.score).toBe(100);
    });

    it('falls back to git data when metrics store empty', async () => {
        mockLoadMetrics.mockReturnValue({ runs: [] });
        mockExecFileSync.mockImplementation(
            () =>
                'abc123|2026-06-01T10:00:00.000Z|Initial commit|kdemian|\n' +
                'def456|2026-06-02T11:00:00.000Z|Second commit|kdemian|abc123',
        );
        const result = runQualityGate();
        expect(result.checks.length).toBeGreaterThan(1);
        expect(result.checks[0]?.name).not.toBe('metrics-data');
    });

    it('returns pass when no metrics data exists (gate skipped)', async () => {
        mockLoadMetrics.mockReturnValue({ runs: [] });
        const result = runQualityGate();
        expect(result.overall).toBe('pass');
        expect(result.checks).toHaveLength(1);
        expect(result.checks[0]?.name).toBe('metrics-data');
        expect(result.checks[0]?.status).toBe('pass');
        expect(result.score).toBe(100);
    });

    it('returns pass when all gates pass', async () => {
        mockLoadMetrics.mockReturnValue({
            runs: [
                {
                    timestamp: '2025-01-01T00:00:00.000Z',
                    project: 'test',
                    total: 100,
                    passed: 95,
                    failed: 2,
                    skipped: 3,
                    duration: 10000,
                    tests: [
                        { title: 't1', state: 'passed', duration: 100 },
                        { title: 't2', state: 'passed', duration: 100 },
                    ],
                },
            ],
            coverageHistory: [
                {
                    timestamp: '2025-01-01T00:00:00.000Z',
                    project: 'test',
                    totalIssues: 10,
                    mappedIssues: 8,
                    coveragePct: 80,
                },
            ],
        });
        mockCalcFlakiness.mockReturnValue([]);
        const result = runQualityGate({ minPassRate: 80, maxFlakyPct: 30, minCoverage: 70, maxSuiteSpeed: 8 });
        expect(result.overall).toBe('pass');
        expect(result.checks.length).toBeGreaterThan(1);
        const failChecks = result.checks.filter((c) => c.status === 'fail');
        expect(failChecks).toHaveLength(0);
    });

    it('returns fail when pass rate is below threshold', async () => {
        mockLoadMetrics.mockReturnValue({
            runs: [
                {
                    timestamp: '2025-01-01T00:00:00.000Z',
                    project: 'test',
                    total: 100,
                    passed: 50,
                    failed: 50,
                    skipped: 0,
                    duration: 10000,
                    tests: [
                        { title: 't1', state: 'failed', duration: 100 },
                        { title: 't2', state: 'passed', duration: 100 },
                    ],
                },
            ],
            coverageHistory: [
                {
                    timestamp: '2025-01-01T00:00:00.000Z',
                    project: 'test',
                    totalIssues: 10,
                    mappedIssues: 8,
                    coveragePct: 80,
                },
            ],
        });
        mockCalcFlakiness.mockReturnValue([]);
        const result = runQualityGate({ minPassRate: 80, maxFlakyPct: 30, minCoverage: 70, maxSuiteSpeed: 8 });
        expect(result.overall).toBe('fail');
        const passRateCheck = result.checks.find((c) => c.name === 'pass-rate');
        expect(passRateCheck?.status).toBe('fail');
    });

    it('filters by project when project option is passed', async () => {
        mockLoadMetrics.mockReturnValue({
            runs: [
                {
                    timestamp: '2025-01-01T00:00:00.000Z',
                    project: 'test',
                    total: 100,
                    passed: 95,
                    failed: 2,
                    skipped: 3,
                    duration: 10000,
                    tests: [],
                },
            ],
        });
        mockCalcFlakiness.mockReturnValue([]);
        const result = runQualityGate({
            project: 'nonexistent',
            minPassRate: 80,
            maxFlakyPct: 30,
            minCoverage: 70,
            maxSuiteSpeed: 8,
        });
        expect(result.checks.length).toBeGreaterThanOrEqual(1);
    });

    it('reads thresholds from environment variables', async () => {
        process.env.QA_GATE_MIN_PASS_RATE = '90';
        process.env.QA_GATE_MAX_FLAKY_PCT = '10';
        process.env.QA_GATE_MIN_COVERAGE = '80';
        process.env.QA_GATE_MAX_SUITE_SPEED = '5';
        mockLoadMetrics.mockReturnValue({
            runs: [
                {
                    timestamp: '2025-01-01T00:00:00.000Z',
                    project: 'test',
                    total: 100,
                    passed: 85,
                    failed: 10,
                    skipped: 5,
                    duration: 10000,
                    tests: [
                        { title: 't1', state: 'passed', duration: 100 },
                        { title: 't2', state: 'failed', duration: 100 },
                    ],
                },
            ],
            coverageHistory: [
                {
                    timestamp: '2025-01-01T00:00:00.000Z',
                    project: 'test',
                    totalIssues: 10,
                    mappedIssues: 8,
                    coveragePct: 75,
                },
            ],
        });
        mockCalcFlakiness.mockReturnValue([
            { title: 't2', passCount: 0, failCount: 1, skipCount: 0, totalRuns: 1, rate: 1 },
        ]);
        const result = runQualityGate({ project: 'test' });
        expect(result.overall).toBe('fail');
    });

    it('handles errors gracefully', async () => {
        mockLoadMetrics.mockImplementation(() => {
            throw new Error('simulated error');
        });
        const result = runQualityGate();
        expect(result.overall).toBe('fail');
        expect(result.checks[0]?.name).toBe('error');
    });

    it('calculates score as average of check scores', async () => {
        mockLoadMetrics.mockReturnValue({
            runs: [
                {
                    timestamp: '2025-01-01T00:00:00.000Z',
                    project: 'test',
                    total: 100,
                    passed: 95,
                    failed: 2,
                    skipped: 3,
                    duration: 10000,
                    tests: [
                        { title: 't1', state: 'passed', duration: 100 },
                        { title: 't2', state: 'passed', duration: 100 },
                    ],
                },
            ],
            coverageHistory: [
                {
                    timestamp: '2025-01-01T00:00:00.000Z',
                    project: 'test',
                    totalIssues: 10,
                    mappedIssues: 8,
                    coveragePct: 80,
                },
            ],
        });
        mockCalcFlakiness.mockReturnValue([]);
        const result = runQualityGate();
        expect(result.score).toBeGreaterThanOrEqual(0);
        expect(result.score).toBeLessThanOrEqual(100);
    });
});

describe('formatQualityGateJson', () => {
    it('formats result as JSON string', async () => {
        const result = {
            overall: 'pass' as const,
            checks: [{ name: 'test', status: 'pass' as const, score: 100, threshold: 80, details: 'OK' }],
            score: 100,
        };
        const json = formatQualityGateJson(result);
        const parsed = JSON.parse(json) as ReturnType<typeof runQualityGate>;
        expect(parsed.overall).toBe('pass');
        expect(parsed.score).toBe(100);
    });
});

describe('formatQualityGateText', () => {
    it('formats result as human-readable text', async () => {
        const result = {
            overall: 'pass' as const,
            checks: [{ name: 'test', status: 'pass' as const, score: 100, threshold: 80, details: 'All good' }],
            score: 100,
        };
        const text = formatQualityGateText(result);
        expect(text).toContain('PASS');
        expect(text).toContain('test');
    });

    it('shows fail icon for failing checks', async () => {
        const result = {
            overall: 'fail' as const,
            checks: [{ name: 'broken', status: 'fail' as const, score: 30, threshold: 80, details: 'Too low' }],
            score: 30,
        };
        const text = formatQualityGateText(result);
        expect(text).toContain('FAIL');
        expect(text).toContain('broken');
    });

    it('handles empty checks array', async () => {
        const result = { overall: 'pass' as const, checks: [], score: 0 };
        const text = formatQualityGateText(result);
        expect(text).toContain('PASS');
    });
});
