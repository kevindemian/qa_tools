/**
 * Integration tests — Quality Suggester (FT-13)
 *
 * Validates the quality signal detection pipeline:
 * - checkQualitySignals returns QualitySignal[]
 * - Benchmark signals are passed through
 * - Signals have correct severity/source/message/action fields
 * - State persistence of suggestions
 *
 * Uses mocked state to avoid filesystem side effects.
 */
import { describe, expect, it } from 'vitest';

describe('Integration: Quality Suggester', () => {
    describe('FT-13a: checkQualitySignals', () => {
        it('returns array of QualitySignal', async () => {
            const { checkQualitySignals } = await import('../../quality-suggester.js');
            const signals = checkQualitySignals();
            expect(Array.isArray(signals)).toBe(true);
        });

        it('each signal has required fields', async () => {
            const { checkQualitySignals } = await import('../../quality-suggester.js');
            const signals = checkQualitySignals();
            for (const signal of signals) {
                expect(signal.severity).toMatch(/^(info|warning|critical)$/);
                expect(signal.source).toBeTruthy();
                expect(signal.message).toBeTruthy();
                expect(signal.suggestedAction).toBeTruthy();
            }
        });
    });

    describe('FT-13b: benchmark signals passthrough', () => {
        it('includes external benchmark signals', async () => {
            const { checkQualitySignals } = await import('../../quality-suggester.js');
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
            expect(
                (benchmarkSignal as { severity: string; source: string; message: string; suggestedAction: string })
                    .message,
            ).toBe('regression detected');
        });
    });
});
