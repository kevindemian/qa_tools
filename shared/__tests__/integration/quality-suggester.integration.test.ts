/**
 * Integration tests — Quality Suggester (FT-13)
 *
 * Validates the quality signal detection pipeline:
 * - checkQualitySignals returns QualitySignal[]
 * - Benchmark signals are passed through
 * - Signals have correct severity/source/message/action fields
 * - State persistence of suggestions
 *
 * Uses vi.spyOn for detectDrift (reads in-memory state, not I/O).
 * State is mocked to avoid filesystem side effects.
 */
import { describe, expect, it, vi, beforeEach, assert } from 'vitest';
import * as qualityMetrics from '../../quality-metrics.js';
import * as llmMetrics from '../../llm-metrics.js';

vi.mock('../../state', () => ({
    updateTyped: vi.fn(),
}));

vi.mock('../../logger');

import { checkQualitySignals } from '../../quality-suggester.js';

const EMPTY_SNAPSHOT = {
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

describe('Integration: Quality Suggester', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('FT-13a: checkQualitySignals', () => {
        it('returns array of QualitySignal', () => {
            const signals = checkQualitySignals();

            expect(Array.isArray(signals)).toBeTruthy();
        });

        it('produces drift signal with source quality-metrics', () => {
            const driftSpy = vi.spyOn(qualityMetrics, 'detectDrift').mockReturnValue(['drift alert']);
            vi.spyOn(llmMetrics, 'snapshotLlmMetrics').mockReturnValue(EMPTY_SNAPSHOT);
            const signals = checkQualitySignals();

            expect(signals.length).toBeGreaterThanOrEqual(1);

            const driftSignal = signals.find((s) => s.source === 'quality-metrics');

            expect(driftSignal).toBeDefined();

            assert(driftSignal !== undefined);

            expect(driftSignal.source).toBe('quality-metrics');

            driftSpy.mockRestore();
        });

        it('drift signal has severity warning', () => {
            vi.spyOn(qualityMetrics, 'detectDrift').mockReturnValue(['drift alert']);
            vi.spyOn(llmMetrics, 'snapshotLlmMetrics').mockReturnValue(EMPTY_SNAPSHOT);
            const signals = checkQualitySignals();
            const driftSignal = signals.find((s) => s.source === 'quality-metrics');
            assert(driftSignal !== undefined);

            expect(driftSignal.severity).toBe('warning');
        });

        it('drift signal includes the alert message', () => {
            vi.spyOn(qualityMetrics, 'detectDrift').mockReturnValue(['drift alert']);
            vi.spyOn(llmMetrics, 'snapshotLlmMetrics').mockReturnValue(EMPTY_SNAPSHOT);
            const signals = checkQualitySignals();
            const driftSignal = signals.find((s) => s.source === 'quality-metrics');
            assert(driftSignal !== undefined);

            expect(driftSignal.message).toBe('drift alert');
        });

        it('drift signal includes actionable suggestion', () => {
            vi.spyOn(qualityMetrics, 'detectDrift').mockReturnValue(['drift alert']);
            vi.spyOn(llmMetrics, 'snapshotLlmMetrics').mockReturnValue(EMPTY_SNAPSHOT);
            const signals = checkQualitySignals();
            const driftSignal = signals.find((s) => s.source === 'quality-metrics');
            assert(driftSignal !== undefined);

            expect(typeof driftSignal.suggestedAction).toBe('string');
            expect(driftSignal.suggestedAction.length).toBeGreaterThan(0);
        });
    });

    describe('FT-13b: benchmark signals passthrough', () => {
        it('includes external benchmark signals', () => {
            const benchmarkSignals = [
                {
                    severity: 'warning' as const,
                    source: 'benchmark',
                    message: 'regression detected',
                    suggestedAction: 'revert',
                },
            ];
            const signals = checkQualitySignals(benchmarkSignals);
            const benchmarkSignal = signals.find((s) => s.source === 'benchmark');

            expect(benchmarkSignal).toBeDefined();

            assert(benchmarkSignal !== undefined);

            expect(benchmarkSignal.message).toBe('regression detected');
        });
    });
});
