/**
 * Tests for silent-regression — Silent Regression Detector.
 */

import { detectSilentRegressions } from '../data-hub/compute/regression-detection.js';
import { nonNull } from '../test-utils.js';

describe('DetectSilentRegression', () => {
    it('detects regressions above default threshold', () => {
        const histories: Record<string, number[]> = {
            'auth test': [1.0, 1.1, 0.9, 1.0, 3.5],
            'api test': [2.0, 2.1, 1.9, 2.0, 2.1],
        };

        const result = detectSilentRegressions(histories);

        expect(result.regressions).toHaveLength(1);

        const reg = nonNull(result.regressions[0]);

        expect(reg.title).toBe('auth test');
        expect(reg.zScore).toBeGreaterThan(2);
        expect(result.totalTests).toBe(2);
        expect(result.threshold).toBe(2);
    });

    it('returns empty regressions when all within range', () => {
        const histories: Record<string, number[]> = {
            'stable test': [1.0, 1.1, 0.9, 1.0, 1.05],
        };

        const result = detectSilentRegressions(histories);

        expect(result.regressions).toHaveLength(0);
        expect(result.totalTests).toBe(1);
    });

    it('returns empty result for empty input', () => {
        const result = detectSilentRegressions({});

        expect(result.regressions).toStrictEqual([]);
        expect(result.totalTests).toBe(0);
    });

    it('skips tests with fewer than 2 durations', () => {
        const histories: Record<string, number[]> = {
            'single duration': [1.5],
            'empty array': [],
        };

        const result = detectSilentRegressions(histories);

        expect(result.regressions).toStrictEqual([]);
        expect(result.totalTests).toBe(0);
    });

    it('handles identical historical durations (stdDev = 0)', () => {
        const histories: Record<string, number[]> = {
            identical: [1.0, 1.0, 1.0, 1.0, 10.0],
        };

        const result = detectSilentRegressions(histories);

        expect(result.regressions).toHaveLength(1);

        const reg = nonNull(result.regressions[0]);

        expect(reg.zScore).toBeGreaterThan(2);
        expect(reg.stdDev).toBe(0);
    });

    it('computes severity levels correctly', () => {
        // hist = [1, 2, 3, 4] → mean=2.5, stdDev≈1.118
        const histories: Record<string, number[]> = {
            'critical regression': [1.0, 2.0, 3.0, 4.0, 10.0],
            'high regression': [1.0, 2.0, 3.0, 4.0, 7.0],
            'medium regression': [1.0, 2.0, 3.0, 4.0, 5.5],
            'low regression': [1.0, 2.0, 3.0, 4.0, 4.0],
            'no regression': [1.0, 2.0, 3.0, 4.0, 3.0],
            'faster test': [1.0, 2.0, 3.0, 4.0, 1.0],
        };

        // Use threshold=1 so low regression is included
        const result = detectSilentRegressions(histories, 1);
        const byTitle = (title: string) => result.regressions.find((r) => r.title === title);

        const crit = nonNull(byTitle('critical regression'));

        expect(crit.severity).toBe('critical');
        expect(crit.zScore).toBeGreaterThan(5);

        const high = nonNull(byTitle('high regression'));

        expect(high.severity).toBe('high');
        expect(high.zScore).toBeGreaterThan(3);
        expect(high.zScore).toBeLessThanOrEqual(5);

        const med = nonNull(byTitle('medium regression'));

        expect(med.severity).toBe('medium');
        expect(med.zScore).toBeGreaterThan(2);
        expect(med.zScore).toBeLessThanOrEqual(3);
    });

    it('assigns low severity within range', () => {
        const histories: Record<string, number[]> = {
            'critical regression': [1.0, 2.0, 3.0, 4.0, 10.0],
            'high regression': [1.0, 2.0, 3.0, 4.0, 7.0],
            'medium regression': [1.0, 2.0, 3.0, 4.0, 5.5],
            'low regression': [1.0, 2.0, 3.0, 4.0, 4.0],
            'no regression': [1.0, 2.0, 3.0, 4.0, 3.0],
            'faster test': [1.0, 2.0, 3.0, 4.0, 1.0],
        };

        const result = detectSilentRegressions(histories, 1);
        const byTitle = (title: string) => result.regressions.find((r) => r.title === title);

        const low = nonNull(byTitle('low regression'));

        expect(low.severity).toBe('low');
        expect(low.zScore).toBeGreaterThan(1);
        expect(low.zScore).toBeLessThanOrEqual(2);
    });

    it('excludes entries that do not meet threshold', () => {
        const histories: Record<string, number[]> = {
            'critical regression': [1.0, 2.0, 3.0, 4.0, 10.0],
            'high regression': [1.0, 2.0, 3.0, 4.0, 7.0],
            'medium regression': [1.0, 2.0, 3.0, 4.0, 5.5],
            'low regression': [1.0, 2.0, 3.0, 4.0, 4.0],
            'no regression': [1.0, 2.0, 3.0, 4.0, 3.0],
            'faster test': [1.0, 2.0, 3.0, 4.0, 1.0],
        };

        const result = detectSilentRegressions(histories, 1);
        const byTitle = (title: string) => result.regressions.find((r) => r.title === title);

        expect(byTitle('no regression')).toBeUndefined();
        expect(byTitle('faster test')).toBeUndefined();
    });

    it('computes z-score correctly', () => {
        const hist = [1.0, 2.0, 3.0];
        const mean = (1.0 + 2.0 + 3.0) / 3;
        const variance = ((1 - mean) ** 2 + (2 - mean) ** 2 + (3 - mean) ** 2) / 3;
        const stdDev = Math.sqrt(variance);
        const current = 5.0;
        const expectedZ = (current - mean) / stdDev;

        const histories: Record<string, number[]> = {
            'calc test': [...hist, current],
        };

        const result = detectSilentRegressions(histories);
        const reg = nonNull(result.regressions[0]);

        expect(reg.zScore).toBeCloseTo(expectedZ, 10);
    });

    it('uses custom threshold', () => {
        // hist = [1, 2, 3] → mean=2, stdDev≈0.8165, z = (3.5-2)/0.8165 ≈ 1.837
        const histories: Record<string, number[]> = {
            'mild increase': [1.0, 2.0, 3.0, 3.5],
        };

        const defaultResult = detectSilentRegressions(histories);

        expect(defaultResult.regressions).toHaveLength(0);

        const customResult = detectSilentRegressions(histories, 1);

        expect(customResult.regressions).toHaveLength(1);
        expect(customResult.threshold).toBe(1);
    });

    it('includes previous durations in the entry', () => {
        const histories: Record<string, number[]> = {
            test: [1.0, 2.0, 3.0, 10.0],
        };

        const result = detectSilentRegressions(histories);
        const reg = nonNull(result.regressions[0]);

        expect(reg.previousDurations).toStrictEqual([1.0, 2.0, 3.0]);
    });

    it('sets timestamp to valid ISO string', () => {
        const result = detectSilentRegressions({});

        expect(() => new Date(result.timestamp)).not.toThrow();
        expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('handles Infinity durations without producing NaN z-score', () => {
        expect.hasAssertions();

        const result = detectSilentRegressions({ 'inf test': [Infinity, Infinity, Infinity, 100] });
        for (const reg of result.regressions) {
            expect(Number.isFinite(reg.zScore)).toBeTruthy();
        }
    });

    it('handles NaN durations without propagating NaN', () => {
        expect.hasAssertions();

        const result = detectSilentRegressions({ 'nan test': [NaN, NaN, NaN, 100] });
        for (const reg of result.regressions) {
            expect(Number.isFinite(reg.zScore)).toBeTruthy();
        }
    });

    it('handles negative durations without crashing', () => {
        const result = detectSilentRegressions({ 'neg test': [-5, -3, -1, 10] });

        expect(Number.isFinite(result.regressions[0]?.zScore ?? 0)).toBeTruthy();
    });
});
