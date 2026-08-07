import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('Integration: Silent Regression (FT-22)', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    describe('FT-22a: detectSilentRegression with data', () => {
        it('detects regressions above threshold', async () => {
            expect.hasAssertions();

            const { detectSilentRegressions } = await import('../../data-hub/compute/regression-detection.js');
            const histories: Record<string, number[]> = {
                'auth test': [1.0, 1.1, 0.9, 1.0, 3.5],
                'api test': [2.0, 2.1, 1.9, 2.0, 2.1],
            };
            const result = detectSilentRegressions(histories);

            expect(result.regressions).toHaveLength(1);
            expect(result.totalTests).toBe(2);
            expect(result.regressions[0]?.title).toBe('auth test');
        });

        it('returns empty when all within range', async () => {
            expect.hasAssertions();

            const { detectSilentRegressions } = await import('../../data-hub/compute/regression-detection.js');
            const result = detectSilentRegressions({ 'stable test': [1.0, 1.1, 0.9, 1.0, 1.05] });

            expect(result.regressions).toHaveLength(0);
        });
    });

    describe('FT-22b: empty and edge input', () => {
        it('returns empty for empty object', async () => {
            expect.hasAssertions();

            const { detectSilentRegressions } = await import('../../data-hub/compute/regression-detection.js');
            const result = detectSilentRegressions({});

            expect(result.regressions).toStrictEqual([]);
            expect(result.totalTests).toBe(0);
        });

        it('skips entries with fewer than 2 durations', async () => {
            expect.hasAssertions();

            const { detectSilentRegressions } = await import('../../data-hub/compute/regression-detection.js');
            const result = detectSilentRegressions({ single: [1.0], empty: [] });

            expect(result.totalTests).toBe(0);
        });
    });
});
