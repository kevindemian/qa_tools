import { runQualityGate, formatQualityGateJson, formatQualityGateText } from './quality-gate';

jest.mock('./metrics', () => ({
    loadMetrics: jest.fn(),
    calculateFlakiness: jest.fn(),
}));

jest.mock('./logger', () => ({
    rootLogger: { error: jest.fn() },
}));

import { loadMetrics, calculateFlakiness } from './metrics';

const mockLoadMetrics = jest.mocked(loadMetrics);
const mockCalcFlakiness = jest.mocked(calculateFlakiness);

describe('runQualityGate', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        delete process.env.QA_GATE_MIN_PASS_RATE;
        delete process.env.QA_GATE_MAX_FLAKY_PCT;
        delete process.env.QA_GATE_MIN_COVERAGE;
        delete process.env.QA_GATE_MAX_SUITE_SPEED;
    });

    it('returns fail when no metrics data exists', () => {
        mockLoadMetrics.mockReturnValue({ runs: [] });
        const result = runQualityGate();
        expect(result.overall).toBe('fail');
        expect(result.checks).toHaveLength(1);
        expect(result.checks[0]?.name).toBe('metrics-data');
    });

    it('returns pass when all gates pass', () => {
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

    it('returns fail when pass rate is below threshold', () => {
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

    it('filters by project when project option is passed', () => {
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

    it('reads thresholds from environment variables', () => {
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

    it('handles errors gracefully', () => {
        mockLoadMetrics.mockImplementation(() => {
            throw new Error('simulated error');
        });
        const result = runQualityGate();
        expect(result.overall).toBe('fail');
        expect(result.checks[0]?.name).toBe('error');
    });

    it('calculates score as average of check scores', () => {
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
    it('formats result as JSON string', () => {
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
    it('formats result as human-readable text', () => {
        const result = {
            overall: 'pass' as const,
            checks: [{ name: 'test', status: 'pass' as const, score: 100, threshold: 80, details: 'All good' }],
            score: 100,
        };
        const text = formatQualityGateText(result);
        expect(text).toContain('PASS');
        expect(text).toContain('test');
    });

    it('shows fail icon for failing checks', () => {
        const result = {
            overall: 'fail' as const,
            checks: [{ name: 'broken', status: 'fail' as const, score: 30, threshold: 80, details: 'Too low' }],
            score: 30,
        };
        const text = formatQualityGateText(result);
        expect(text).toContain('FAIL');
        expect(text).toContain('broken');
    });

    it('handles empty checks array', () => {
        const result = { overall: 'pass' as const, checks: [], score: 0 };
        const text = formatQualityGateText(result);
        expect(text).toContain('PASS');
    });
});
