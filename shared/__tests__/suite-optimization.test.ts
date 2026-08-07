import { computeOptimizationActions } from '../data-hub/compute/optimization-actions.js';
import type { OptimizationResult } from '../types/data-hub-extensions.js';

const DEFAULT_SLOW = 5;
const DEFAULT_FLAKY = 0.3;

function analyze(
    tests: Array<{ title: string; duration: number; flakiness: number }>,
    slow = 5,
    flaky = 0.3,
): OptimizationResult {
    const durationMap = Object.create(null) as Record<string, number[]>;
    const flakinessMap = Object.create(null) as Record<string, number>;
    for (const t of tests) {
        durationMap[t.title] = [t.duration * 1000];
        flakinessMap[t.title] = t.flakiness;
    }
    return computeOptimizationActions(durationMap, flakinessMap, slow, flaky);
}

describe('AnalyzeSuiteOptimization', () => {
    it('returns empty result for empty input', () => {
        const result = analyze([]);

        expect(result.optimizations).toHaveLength(0);
        expect(result.totalTests).toBe(0);
        expect(result.totalDuration).toBe(0);
        expect(result.potentialSavings).toBe(0);
        expect(result.slowThreshold).toBe(DEFAULT_SLOW);
        expect(result.flakyThreshold).toBe(DEFAULT_FLAKY);
        expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('returns none action for normal test within thresholds', () => {
        const result = analyze([{ title: 'normal', duration: 3, flakiness: 0.05 }]);

        expect(result.optimizations[0]?.action).toBe('none');
        expect(result.optimizations[0]?.impact).toBe('low');
        expect(result.optimizations[0]?.reason).toBe('Within acceptable thresholds');
        expect(result.potentialSavings).toBe(0);
    });

    it('detects quarantine for flaky test', () => {
        const result = analyze([{ title: 'flaky_test', duration: 3, flakiness: 0.5 }]);

        expect(result.optimizations[0]?.action).toBe('quarantine');
        expect(result.optimizations[0]?.impact).toBe('high');
        expect(result.optimizations[0]?.reason).toContain('exceeds threshold');
    });

    it('detects split for very slow test (>3x threshold)', () => {
        const result = analyze([{ title: 'very_slow', duration: 16, flakiness: 0.05 }]);

        expect(result.optimizations[0]?.action).toBe('split');
        expect(result.optimizations[0]?.impact).toBe('high');
        expect(result.optimizations[0]?.reason).toContain('exceeds 3x threshold');
    });

    it('detects parallelize for moderately slow test (>2x threshold)', () => {
        const result = analyze([{ title: 'mod_slow', duration: 11, flakiness: 0.05 }]);

        expect(result.optimizations[0]?.action).toBe('parallelize');
        expect(result.optimizations[0]?.impact).toBe('medium');
        expect(result.optimizations[0]?.reason).toContain('exceeds 2x threshold');
    });

    it('detects remove_wait for duration >1.5x with low flakiness', () => {
        const result = analyze([{ title: 'waiting', duration: 8, flakiness: 0.05 }]);

        expect(result.optimizations[0]?.action).toBe('remove_wait');
        expect(result.optimizations[0]?.impact).toBe('medium');
        expect(result.optimizations[0]?.reason).toContain('exceeds 1.5x threshold');
    });

    it('detects speed_up for slightly slow test (>1x threshold)', () => {
        const result = analyze([{ title: 'slightly_slow', duration: 6, flakiness: 0.05 }]);

        expect(result.optimizations[0]?.action).toBe('speed_up');
        expect(result.optimizations[0]?.impact).toBe('low');
        expect(result.optimizations[0]?.reason).toContain('exceeds threshold');
    });

    it('quarantine takes priority over duration actions', () => {
        const result = analyze([{ title: 'flaky_and_slow', duration: 20, flakiness: 0.5 }]);

        expect(result.optimizations[0]?.action).toBe('quarantine');
        expect(result.optimizations[0]?.impact).toBe('high');
    });

    it('parallelize takes priority over remove_wait and speed_up', () => {
        const result = analyze([{ title: 'parallel_priority', duration: 11, flakiness: 0.01 }]);

        expect(result.optimizations[0]?.action).toBe('parallelize');
    });

    it('remove_wait takes priority over speed_up', () => {
        const result = analyze([{ title: 'remove_priority', duration: 8, flakiness: 0.05 }]);

        expect(result.optimizations[0]?.action).toBe('remove_wait');
    });

    it('handles NaN duration gracefully', () => {
        const result = analyze([{ title: 'nan_dur', duration: NaN, flakiness: 0 }]);

        expect(result.optimizations[0]?.duration).toBe(0);
        expect(result.optimizations[0]?.action).toBe('none');
    });

    it('handles NaN flakiness gracefully', () => {
        const result = analyze([{ title: 'nan_flaky', duration: 3, flakiness: NaN }]);

        expect(result.optimizations[0]?.flakiness).toBe(0);
        expect(result.optimizations[0]?.action).toBe('none');
    });

    it('handles negative duration gracefully', () => {
        const result = analyze([{ title: 'neg', duration: -1, flakiness: 0 }]);

        expect(result.optimizations[0]?.duration).toBe(0);
        expect(result.optimizations[0]?.action).toBe('none');
    });

    it('handles zero duration', () => {
        const result = analyze([{ title: 'zero', duration: 0, flakiness: 0 }]);

        expect(result.optimizations[0]?.action).toBe('none');
        expect(result.optimizations[0]?.duration).toBe(0);
    });

    it('sorts by impact (high first) then duration descending', () => {
        const result = analyze([
            { title: 'D_low', duration: 3, flakiness: 0 },
            { title: 'A_high', duration: 8, flakiness: 0.5 },
            { title: 'C_med', duration: 6, flakiness: 0 },
            { title: 'B_high_fast', duration: 6, flakiness: 0.5 },
        ]);
        const titles = result.optimizations.map((e) => e.testTitle);

        expect(titles).toStrictEqual(['A_high', 'B_high_fast', 'C_med', 'D_low']);
    });

    it('uses custom thresholds', () => {
        const result = analyze([{ title: 't', duration: 10, flakiness: 0.2 }], 8, 0.15);

        expect(result.slowThreshold).toBe(8);
        expect(result.flakyThreshold).toBe(0.15);
        expect(result.optimizations[0]?.action).toBe('quarantine');
    });

    it('fallback to defaults when thresholds are NaN', () => {
        const result = analyze([{ title: 't', duration: 6, flakiness: 0.31 }], NaN, NaN);

        expect(result.slowThreshold).toBe(DEFAULT_SLOW);
        expect(result.flakyThreshold).toBe(DEFAULT_FLAKY);
        expect(result.optimizations[0]?.action).toBe('quarantine');
    });

    it('fallback to defaults when thresholds are negative', () => {
        const result = analyze([{ title: 't', duration: 6, flakiness: 0.31 }], -1, -1);

        expect(result.slowThreshold).toBe(DEFAULT_SLOW);
        expect(result.flakyThreshold).toBe(DEFAULT_FLAKY);
    });

    it('computes potential savings correctly', () => {
        const result = analyze([
            { title: 'a', duration: 16, flakiness: 0 },
            { title: 'b', duration: 11, flakiness: 0 },
            { title: 'c', duration: 8, flakiness: 0.05 },
            { title: 'd', duration: 6, flakiness: 0 },
        ]);

        expect(result.potentialSavings).toBe(21);
    });

    it('returns zero potential savings when all tests are none', () => {
        const result = analyze([
            { title: 'a', duration: 3, flakiness: 0 },
            { title: 'b', duration: 1, flakiness: 0 },
        ]);

        expect(result.potentialSavings).toBe(0);
    });

    it('computes total duration correctly', () => {
        const result = analyze([
            { title: 'a', duration: 10, flakiness: 0 },
            { title: 'b', duration: 20, flakiness: 0 },
        ]);

        expect(result.totalDuration).toBe(30);
    });

    it('includes all tests in totalTests count', () => {
        const result = analyze([
            { title: 'a', duration: 1, flakiness: 0 },
            { title: 'b', duration: 2, flakiness: 0 },
            { title: 'c', duration: 3, flakiness: 0 },
        ]);

        expect(result.totalTests).toBe(3);
    });

    it('uses provided thresholds defaults when undefined', () => {
        const result = analyze([{ title: 't', duration: 6, flakiness: 0.31 }]);

        expect(result.slowThreshold).toBe(DEFAULT_SLOW);
        expect(result.flakyThreshold).toBe(DEFAULT_FLAKY);
    });
});
