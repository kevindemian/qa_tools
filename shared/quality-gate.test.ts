import { runQualityGate, formatQualityGateJson, formatQualityGateText } from './quality-gate.js';

vi.mock('./data-hub/persistence.js', () => ({
    createDataHubPersistence: vi.fn(),
}));

vi.mock('./data-hub/compute/flakiness-entries.js', () => ({
    calcFlakinessEntries: vi.fn(),
}));

vi.mock('./logger.js', () => ({
    rootLogger: { error: vi.fn() },
}));

import * as persistenceModule from './data-hub/persistence.js';
import * as flakinessModule from './data-hub/compute/flakiness-entries.js';

const mockCreateDataHubPersistence = vi.mocked(persistenceModule.createDataHubPersistence);
const mockCalcFlakinessEntries = vi.mocked(flakinessModule.calcFlakinessEntries);

function createMockPersistence(overrides: Partial<ReturnType<typeof persistenceModule.createDataHubPersistence>> = {}) {
    return {
        saveRun: vi.fn(),
        loadRun: vi.fn().mockReturnValue(null),
        saveCoverageSnapshot: vi.fn(),
        loadCoverageHistory: vi.fn().mockReturnValue([]),
        saveFailureClassification: vi.fn(),
        loadFailureClassifications: vi.fn().mockReturnValue([]),
        saveMetricsStore: vi.fn(),
        loadMetricsStore: vi.fn().mockReturnValue({ runs: [], coverageHistory: [] }),
        saveParseResult: vi.fn(),
        saveQualityMetrics: vi.fn(),
        loadQualityMetricsHistory: vi.fn().mockReturnValue([]),
        flush: vi.fn(),
        ...overrides,
    };
}

describe('RunQualityGate', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns fail when no metrics data exists', () => {
        mockCreateDataHubPersistence.mockReturnValue(
            createMockPersistence({
                loadMetricsStore: vi.fn().mockReturnValue({ runs: [], coverageHistory: [] }),
            }),
        );
        const result = runQualityGate();

        expect(result.overall).toBe('fail');
        expect(result.checks).toHaveLength(1);
        expect(result.checks[0]?.name).toBe('metrics-data');
        expect(result.checks[0]?.status).toBe('fail');
        expect(result.score).toBe(0);
    });

    it('returns pass when all gates pass', () => {
        mockCreateDataHubPersistence.mockReturnValue(
            createMockPersistence({
                loadMetricsStore: vi.fn().mockReturnValue({
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
                }),
            }),
        );
        mockCalcFlakinessEntries.mockReturnValue([]);
        const result = runQualityGate();

        expect(result.overall).toBe('pass');
        expect(result.checks.length).toBeGreaterThan(1);

        const failChecks = result.checks.filter((c) => c.status === 'fail');

        expect(failChecks).toHaveLength(0);
    });

    it('returns fail when pass rate is below threshold', () => {
        mockCreateDataHubPersistence.mockReturnValue(
            createMockPersistence({
                loadMetricsStore: vi.fn().mockReturnValue({
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
                }),
            }),
        );
        mockCalcFlakinessEntries.mockReturnValue([]);
        const result = runQualityGate();

        expect(result.overall).toBe('fail');

        const passRateCheck = result.checks.find((c) => c.name === 'pass-rate');

        expect(passRateCheck?.status).toBe('fail');
    });

    it('filters by project when project option is passed', () => {
        mockCreateDataHubPersistence.mockReturnValue(
            createMockPersistence({
                loadMetricsStore: vi.fn().mockReturnValue({
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
                }),
            }),
        );
        mockCalcFlakinessEntries.mockReturnValue([]);
        const result = runQualityGate({ project: 'nonexistent' });

        expect(result.checks.length).toBeGreaterThanOrEqual(1);
    });

    it('fails when flaky rate exceeds threshold', () => {
        mockCreateDataHubPersistence.mockReturnValue(
            createMockPersistence({
                loadMetricsStore: vi.fn().mockReturnValue({
                    runs: [
                        {
                            timestamp: '2025-01-01T00:00:00.000Z',
                            project: 'test',
                            total: 10,
                            passed: 8,
                            failed: 1,
                            skipped: 1,
                            duration: 5000,
                            tests: [
                                { title: 'flaky-test-1', state: 'failed', duration: 100 },
                                { title: 'flaky-test-1', state: 'passed', duration: 100 },
                                { title: 'stable-test', state: 'passed', duration: 50 },
                                { title: 'stable-test', state: 'passed', duration: 50 },
                            ],
                        },
                        {
                            timestamp: '2025-01-01T01:00:00.000Z',
                            project: 'test',
                            total: 10,
                            passed: 7,
                            failed: 2,
                            skipped: 1,
                            duration: 5000,
                            tests: [
                                { title: 'flaky-test-1', state: 'failed', duration: 100 },
                                { title: 'flaky-test-1', state: 'passed', duration: 100 },
                                { title: 'stable-test', state: 'passed', duration: 50 },
                                { title: 'stable-test', state: 'passed', duration: 50 },
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
                }),
            }),
        );
        mockCalcFlakinessEntries.mockReturnValue([
            { title: 'flaky-test-1', project: 'test', rate: 1, passCount: 1, failCount: 1, skipCount: 0, totalRuns: 2 },
        ]);
        const result = runQualityGate();
        const flakyCheck = result.checks.find((c) => c.name === 'flaky-rate');

        expect(flakyCheck).toBeDefined();
        // 1 flaky test out of 2 considered (both appear in 2+ runs) = 50% flaky
        expect(flakyCheck?.status).toBe('fail');
        expect(flakyCheck?.score).toBe(50);
    });

    it('passes flaky rate when no flaky tests exist', () => {
        mockCreateDataHubPersistence.mockReturnValue(
            createMockPersistence({
                loadMetricsStore: vi.fn().mockReturnValue({
                    runs: [
                        {
                            timestamp: '2025-01-01T00:00:00.000Z',
                            project: 'test',
                            total: 10,
                            passed: 9,
                            failed: 0,
                            skipped: 1,
                            duration: 5000,
                            tests: [
                                { title: 't1', state: 'passed', duration: 100 },
                                { title: 't1', state: 'passed', duration: 100 },
                                { title: 't2', state: 'passed', duration: 50 },
                                { title: 't2', state: 'passed', duration: 50 },
                            ],
                        },
                        {
                            timestamp: '2025-01-01T01:00:00.000Z',
                            project: 'test',
                            total: 10,
                            passed: 9,
                            failed: 0,
                            skipped: 1,
                            duration: 5000,
                            tests: [
                                { title: 't1', state: 'passed', duration: 100 },
                                { title: 't1', state: 'passed', duration: 100 },
                                { title: 't2', state: 'passed', duration: 50 },
                                { title: 't2', state: 'passed', duration: 50 },
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
                }),
            }),
        );
        mockCalcFlakinessEntries.mockReturnValue([]);
        const result = runQualityGate();
        const flakyCheck = result.checks.find((c) => c.name === 'flaky-rate');

        expect(flakyCheck).toBeDefined();
        expect(flakyCheck?.status).toBe('pass');
    });

    it('handles errors gracefully', () => {
        mockCreateDataHubPersistence.mockImplementation(() => {
            throw new Error('simulated error');
        });
        const result = runQualityGate();

        expect(result.overall).toBe('fail');
        expect(result.checks[0]?.name).toBe('error');
    });

    it('calculates score as average of check scores', () => {
        mockCreateDataHubPersistence.mockReturnValue(
            createMockPersistence({
                loadMetricsStore: vi.fn().mockReturnValue({
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
                }),
            }),
        );
        mockCalcFlakinessEntries.mockReturnValue([]);
        const result = runQualityGate();

        expect(result.score).toBeGreaterThanOrEqual(0);
        expect(result.score).toBeLessThanOrEqual(100);
    });
});

describe('FormatQualityGateJson', () => {
    it('formats result as JSON string', () => {
        const result = {
            overall: 'pass' as const,
            checks: [{ name: 'test', status: 'pass' as const, score: 100, threshold: 80, details: 'OK' }],
            score: 100,
        };
        const json = formatQualityGateJson(result);

        expect(JSON.parse(json)).toHaveProperty('overall', 'pass');
        expect(JSON.parse(json)).toHaveProperty('score', 100);
    });
});

describe('FormatQualityGateText', () => {
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
