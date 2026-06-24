import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as reportStyles from '../../report-styles.js';

vi.mock('../../logger.js', () => ({
    rootLogger: { error: vi.fn(), info: vi.fn(), child: vi.fn().mockReturnThis() },
}));

vi.mock('../../config.js', () => ({
    default: { get: vi.fn(() => '') },
    get: vi.fn(() => ''),
}));

describe('Integration: Silent Regression (FT-22)', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    describe('FT-22a: detectSilentRegression with data', () => {
        it('detects regressions above threshold', async () => {expect.hasAssertions();

            const { detectSilentRegression } = await import('../../silent-regression.js');
            const histories: Record<string, number[]> = {
                'auth test': [1.0, 1.1, 0.9, 1.0, 3.5],
                'api test': [2.0, 2.1, 1.9, 2.0, 2.1],
            };
            const result = detectSilentRegression(histories);

            expect(result.regressions).toHaveLength(1);
            expect(result.totalTests).toBe(2);
            expect(result.regressions[0]?.title).toBe('auth test');
        });

        it('returns empty when all within range', async () => {expect.hasAssertions();

            const { detectSilentRegression } = await import('../../silent-regression.js');
            const result = detectSilentRegression({ 'stable test': [1.0, 1.1, 0.9, 1.0, 1.05] });

            expect(result.regressions).toHaveLength(0);
        });
    });

    describe('FT-22b: empty and edge input', () => {
        it('returns empty for empty object', async () => {expect.hasAssertions();

            const { detectSilentRegression } = await import('../../silent-regression.js');
            const result = detectSilentRegression({});

            expect(result.regressions).toEqual([]);
            expect(result.totalTests).toBe(0);
        });

        it('skips entries with fewer than 2 durations', async () => {expect.hasAssertions();

            const { detectSilentRegression } = await import('../../silent-regression.js');
            const result = detectSilentRegression({ single: [1.0], empty: [] });

            expect(result.totalTests).toBe(0);
        });
    });

    describe('FT-22c: generateSilentRegressionHtml', () => {
        it('produces complete HTML with regression data', async () => {expect.hasAssertions();

            const { detectSilentRegression, generateSilentRegressionHtml } = await import('../../silent-regression.js');
            const result = detectSilentRegression({ 'auth test': [1.0, 1.1, 0.9, 1.0, 3.5] });
            const html = generateSilentRegressionHtml(result, 'Regression Report');

            expect(html).toContain('<!DOCTYPE html>');
            expect(html).toContain('Regression Report');
            expect(html).toContain('data-component="metric-card"');
            expect(html).toContain('data-component="table-wrapper"');
        });

        it('shows no-regressions message when empty', async () => {expect.hasAssertions();

            const { generateSilentRegressionHtml } = await import('../../silent-regression.js');
            const emptyResult = {
                regressions: [],
                totalTests: 5,
                threshold: 2,
                timestamp: '2026-06-01T00:00:00Z',
            };
            const html = generateSilentRegressionHtml(emptyResult);

            expect(html).toContain('No silent regressions detected');
        });
    });

    describe('FT-22d: null handling', () => {
        it('returns error page when result is null', async () => {expect.hasAssertions();

            const { generateSilentRegressionHtml } = await import('../../silent-regression.js');
            const html = generateSilentRegressionHtml(null);

            expect(html).toContain('Error generating silent regression report');
        });

        it('returns error page when result is undefined', async () => {expect.hasAssertions();

            const { generateSilentRegressionHtml } = await import('../../silent-regression.js');
            const html = generateSilentRegressionHtml(undefined);

            expect(html).toContain('Error generating silent regression report');
        });
    });

    describe('FT-22e: error fallback', () => {
        it('returns error page when buildCss throws', async () => {expect.hasAssertions();

            const spy = vi.spyOn(reportStyles, 'buildCss').mockImplementation(() => {
                throw new Error('CSS failure');
            });
            const { detectSilentRegression, generateSilentRegressionHtml } = await import('../../silent-regression.js');
            const result = detectSilentRegression({ test: [1.0, 2.0, 3.0, 10.0] });
            const html = generateSilentRegressionHtml(result);

            expect(html).toContain('Error generating silent regression report');

            spy.mockRestore();
        });
    });
});
