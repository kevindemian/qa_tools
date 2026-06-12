import { describe, it, expect, vi, beforeEach, assert } from 'vitest';

const mockDetectDrift = vi.hoisted(() => vi.fn());
const mockSnapshot = vi.hoisted(() => vi.fn());
const mockUpdateTyped = vi.hoisted(() => vi.fn());

vi.mock('./quality-metrics', () => ({
    detectDrift: mockDetectDrift,
}));

vi.mock('./llm-metrics', () => ({
    snapshotLlmMetrics: mockSnapshot,
}));

vi.mock('./state', () => ({
    updateTyped: mockUpdateTyped,
}));

import { checkQualitySignals } from './quality-suggester.js';

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

describe('checkQualitySignals', () => {
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
        expect(signals.some((s) => s.source === 'llm-metrics' && s.message.includes('Latência'))).toBe(true);
    });

    it('returns failure signal when failure rate exceeds threshold', () => {
        mockSnapshot.mockReturnValue({
            ...defaultSnapshot,
            totalRequests: 100,
            avgLatencyMs: 500,
            failuresByTier: { main: 20 },
        });
        const signals = checkQualitySignals();
        expect(signals.some((s) => s.source === 'llm-metrics' && s.message.includes('Taxa de falha'))).toBe(true);
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

        const updateCalls = mockUpdateTyped.mock.calls;
        const updateFn = updateCalls[0]?.[0] as (s: Record<string, unknown>) => void;
        const mockState: Record<string, unknown> = {};
        updateFn(mockState);
        const suggestions = mockState['_llmConfigSuggestions'] as Record<string, unknown> | undefined;
        expect(suggestions).toBeDefined();
        expect(suggestions?.['pending']).toBe(true);
    });
});
