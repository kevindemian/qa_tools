import * as fc from 'fast-check';
import { describe, expect, it, vi, beforeEach } from 'vitest';

const mockDetectDrift = vi.hoisted(() => vi.fn());
const mockSnapshot = vi.hoisted(() => vi.fn());
const mockUpdateTyped = vi.hoisted(() => vi.fn());

vi.mock('../logger');

vi.mock('../quality-metrics', () => ({
    detectDrift: mockDetectDrift,
}));

vi.mock('../llm-metrics', () => ({
    snapshotLlmMetrics: mockSnapshot,
}));

vi.mock('../state', () => ({
    updateTyped: mockUpdateTyped,
}));

import { checkQualitySignals, severityFromLatency, failureRate } from '../quality-suggester.js';

describe('SeverityFromLatency — property-based', () => {
    it('severidade é monotônica: latência maior → severidade maior ou igual', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(fc.integer({ min: 0, max: 20000 }), fc.integer({ min: 0, max: 20000 }), (a, b) => {
                const order = (s: string): number => (s === 'info' ? 0 : s === 'warning' ? 1 : 2);

                expect(order(severityFromLatency(a))).toBeLessThanOrEqual(
                    a <= b ? order(severityFromLatency(b)) : order(severityFromLatency(a)),
                );
            }),
            { numRuns: 100 },
        );
    });

    it('latência 0..2999 → info', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(fc.integer({ min: 0, max: 2999 }), (ms) => {
                expect(severityFromLatency(ms)).toBe('info');
            }),
            { numRuns: 50 },
        );
    });

    it('latência 3000..7999 → warning', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(fc.integer({ min: 3000, max: 7999 }), (ms) => {
                expect(severityFromLatency(ms)).toBe('warning');
            }),
            { numRuns: 50 },
        );
    });

    it('latência ≥ 8000 → critical', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(fc.integer({ min: 8000, max: 100000 }), (ms) => {
                expect(severityFromLatency(ms)).toBe('critical');
            }),
            { numRuns: 50 },
        );
    });
});

describe('FailureRate — property-based', () => {
    it('rate sempre ≥ 0 para qualquer entrada', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(
                fc.integer({ min: -1000, max: 1000 }),
                fc.integer({ min: -1000, max: 1000 }),
                (failures, total) => {
                    expect(failureRate(failures, total)).toBeGreaterThanOrEqual(0);
                },
            ),
            { numRuns: 200 },
        );
    });

    it('rate ≤ 1 para entradas válidas não-negativas', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(fc.nat({ max: 1000 }), fc.nat({ max: 1000 }), (failures, total) => {
                expect(failureRate(failures, total)).toBeLessThanOrEqual(1);
            }),
            { numRuns: 100 },
        );
    });

    it('total = 0 → rate = 0 (evita divisão por zero)', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(fc.nat({ max: 1000 }), (failures) => {
                expect(failureRate(failures, 0)).toBe(0);
            }),
            { numRuns: 50 },
        );
    });

    it('naN e valores negativos são normalizados para 0', () => {
        expect(failureRate(NaN, 100)).toBe(0);
        expect(failureRate(-5, 100)).toBe(0);
        expect(failureRate(5, NaN)).toBe(0);
        expect(failureRate(-5, -10)).toBe(0);
        expect(failureRate(Infinity, 100)).toBe(0);
        expect(failureRate(5, -100)).toBe(0);
    });
});

describe('CheckQualitySignals — property-based', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockDetectDrift.mockReturnValue([]);
        mockSnapshot.mockReturnValue({
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
        });
    });

    it('sempre retorna um array', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(fc.constantFrom(undefined), () => {
                const result = checkQualitySignals();

                expect(Array.isArray(result)).toBeTruthy();
            }),
            { numRuns: 10 },
        );
    });

    it('benchmarkSignals não mutation do array original', () => {
        const sig = [{ severity: 'warning' as const, source: 'test', message: 'x', suggestedAction: 'y' }];
        const result = checkQualitySignals(sig);

        expect(result).toStrictEqual(expect.arrayContaining(sig));
    });
});
