import { describe, it, expect, vi, beforeEach, assert } from 'vitest';

const mockDetectDrift = vi.hoisted(() => vi.fn());
const mockSnapshot = vi.hoisted(() => vi.fn());
const mockUpdateTyped = vi.hoisted(() => vi.fn<(fn: (s: Record<string, unknown>) => void) => void>());

vi.mock('../logger');

vi.mock('../quality/quality-metrics.js', () => ({
    detectDrift: mockDetectDrift,
}));

vi.mock('../llm/llm-metrics.js', () => ({
    snapshotLlmMetrics: mockSnapshot,
}));

vi.mock('../state', () => ({
    updateTyped: mockUpdateTyped,
}));

import { checkQualitySignals, failureRate, severityFromLatency } from '../quality/quality-suggester.js';

const defaultSnapshot = {
    totalRequests: 0,
    avgLatencyMs: 0,
    failuresByTier: {},
    timestamp: '',
    rejectedByValidator: 0,
    retryCount: 0,
    adversarialRetryCount: 0,
    avgConfidence: 0,
    rejectionReasons: {},
    artifactApproved: 0,
    artifactRejected: 0,
    cacheHits: 0,
    cacheMisses: 0,
    totalPromptTokens: 0,
    totalCompletionTokens: 0,
    totalCostUSD: 0,
    costPerTier: {},
    requestsByProvider: {},
    latencyByModel: {},
};

describe('CheckQualitySignals', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockDetectDrift.mockReturnValue([]);
        mockSnapshot.mockReturnValue({ ...defaultSnapshot });
    });

    it('returns empty signals when no issues detected', () => {
        const signals = checkQualitySignals();

        expect(signals).toHaveLength(0);
        expect(mockUpdateTyped).toHaveBeenCalledWith(expect.any(Function));
    });

    it('returns drift signals when detectDrift reports alerts', () => {
        mockDetectDrift.mockReturnValue(['DRIFT: invariant "T-01" fire rate 50% exceeds baseline']);
        const signals = checkQualitySignals();

        expect(signals).toHaveLength(1);

        const signal = signals[0];
        assert(signal !== undefined);

        expect(signal.source).toBe('quality-metrics');
        expect(signal.severity).toBe('warning');
    });

    it('returns latency signal when avgLatencyMs exceeds threshold', () => {
        mockSnapshot.mockReturnValue({
            ...defaultSnapshot,
            totalRequests: 10,
            avgLatencyMs: 5000,
        });
        const signals = checkQualitySignals();

        expect(signals.some((s) => s.source === 'llm-metrics' && s.message.includes('Latência'))).toBeTruthy();
    });

    it('returns failure signal when failure rate exceeds threshold', () => {
        mockSnapshot.mockReturnValue({
            ...defaultSnapshot,
            totalRequests: 100,
            avgLatencyMs: 500,
            failuresByTier: { main: 20 },
        });
        const signals = checkQualitySignals();

        expect(signals.some((s) => s.source === 'llm-metrics' && s.message.includes('Taxa de falha'))).toBeTruthy();
    });

    it('passes benchmark signals to state', () => {
        const benchmarkSignals = [
            {
                severity: 'critical' as const,
                source: 'benchmark',
                message: 'Benchmark pass rate 40% below expected',
                suggestedAction: 'Check model quality',
            },
        ];
        const signals = checkQualitySignals(benchmarkSignals);

        expect(signals).toHaveLength(1);

        const signal = signals[0];
        assert(signal !== undefined);

        expect(signal.source).toBe('benchmark');
    });

    it('merges benchmark signals with quality signals', () => {
        mockDetectDrift.mockReturnValue(['DRIFT: invariant "T-01" fire rate 50% exceeds baseline']);
        const benchmarkSignals = [
            {
                severity: 'warning' as const,
                source: 'benchmark',
                message: 'Benchmark pass rate 70% below ideal',
                suggestedAction: 'Monitor results',
            },
        ];
        const signals = checkQualitySignals(benchmarkSignals);

        expect(signals).toHaveLength(2);
    });

    it('persists pending flag to state', () => {
        mockDetectDrift.mockReturnValue(['DRIFT: invariant "T-01" fire rate 50% exceeds baseline']);
        checkQualitySignals();

        const updateFn = mockUpdateTyped.mock.calls[0]?.[0];
        assert(updateFn !== undefined);
        const mockState: Record<string, unknown> = {};
        updateFn(mockState);
        const suggestions: unknown = mockState['_llmConfigSuggestions'];

        expect(suggestions).toBeDefined();
        expect(suggestions).toStrictEqual(expect.objectContaining({ pending: true }));
    });

    // ── RED tests (Phase 5) ──

    it('handles detectDrift failure gracefully — G01', () => {
        mockDetectDrift.mockImplementation(() => {
            throw new Error('drift error');
        });
        const signals = checkQualitySignals();

        expect(Array.isArray(signals)).toBeTruthy();
    });

    it('returns signals even when updateTyped fails — G02', () => {
        mockDetectDrift.mockReturnValue(['DRIFT: invariant "T-01" fire rate 50% exceeds baseline']);
        mockUpdateTyped.mockImplementation(() => {
            throw new Error('persist error');
        });
        const signals = checkQualitySignals();

        expect(signals).toHaveLength(1);
    });

    // ── RED tests: internal functions (G03, G04) ──

    it('severityFromLatency returns info for sub-warning latency — G03', () => {
        expect(severityFromLatency(0)).toBe('info');
        expect(severityFromLatency(1000)).toBe('info');
        expect(severityFromLatency(2999)).toBe('info');
    });

    it('severityFromLatency returns warning for 3000-7999 — G03', () => {
        expect(severityFromLatency(3000)).toBe('warning');
        expect(severityFromLatency(5000)).toBe('warning');
        expect(severityFromLatency(7999)).toBe('warning');
    });

    it('severityFromLatency returns critical for >= 8000 — G03', () => {
        expect(severityFromLatency(8000)).toBe('critical');
        expect(severityFromLatency(10000)).toBe('critical');
    });

    it('failureRate returns 0 for total = 0 — G04', () => {
        expect(failureRate(0, 0)).toBe(0);
        expect(failureRate(100, 0)).toBe(0);
    });

    it('failureRate returns correct ratio for valid inputs — G04', () => {
        expect(failureRate(0, 100)).toBe(0);
        expect(failureRate(50, 100)).toBe(0.5);
        expect(failureRate(100, 100)).toBe(1);
    });

    // ── RED tests: edge case (G02, G05) — will FAIL until source is fixed ──

    it('failureRate normalizes NaN to 0 — G02', () => {
        expect(failureRate(NaN, 100)).toBe(0);
    });

    it('failureRate normalizes negative failures to 0 — G02', () => {
        expect(failureRate(-5, 100)).toBe(0);
    });

    it('failureRate normalizes Infinity to 0 — G02', () => {
        expect(failureRate(Infinity, 100)).toBe(0);
    });

    it('failureRate normalizes negative total to 0 — G02', () => {
        expect(failureRate(5, -100)).toBe(0);
    });

    it('handles failuresByTier undefined in snapshot — G05', () => {
        mockSnapshot.mockReturnValue({
            ...defaultSnapshot,
            totalRequests: 100,
            avgLatencyMs: 500,
            failuresByTier: undefined,
        });
        const signals = checkQualitySignals();

        expect(Array.isArray(signals)).toBeTruthy();
    });
});
