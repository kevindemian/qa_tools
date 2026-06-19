/**
 * Tests for silent-regression — Silent Regression Detector.
 */

import { detectSilentRegression, generateSilentRegressionHtml } from './silent-regression.js';
import type { RegressionResult } from './silent-regression.js';
import { nonNull } from './test-utils.js';

describe('detectSilentRegression', () => {
    it('detects regressions above default threshold', () => {
        const histories: Record<string, number[]> = {
            'auth test': [1.0, 1.1, 0.9, 1.0, 3.5],
            'api test': [2.0, 2.1, 1.9, 2.0, 2.1],
        };

        const result = detectSilentRegression(histories);
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

        const result = detectSilentRegression(histories);
        expect(result.regressions).toHaveLength(0);
        expect(result.totalTests).toBe(1);
    });

    it('returns empty result for empty input', () => {
        const result = detectSilentRegression({});
        expect(result.regressions).toEqual([]);
        expect(result.totalTests).toBe(0);
    });

    it('skips tests with fewer than 2 durations', () => {
        const histories: Record<string, number[]> = {
            'single duration': [1.5],
            'empty array': [],
        };

        const result = detectSilentRegression(histories);
        expect(result.regressions).toEqual([]);
        expect(result.totalTests).toBe(0);
    });

    it('handles identical historical durations (stdDev = 0)', () => {
        const histories: Record<string, number[]> = {
            identical: [1.0, 1.0, 1.0, 1.0, 10.0],
        };

        const result = detectSilentRegression(histories);
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
        const result = detectSilentRegression(histories, 1);
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

        const low = nonNull(byTitle('low regression'));
        expect(low.severity).toBe('low');
        expect(low.zScore).toBeGreaterThan(1);
        expect(low.zScore).toBeLessThanOrEqual(2);

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

        const result = detectSilentRegression(histories);
        const reg = nonNull(result.regressions[0]);
        expect(reg.zScore).toBeCloseTo(expectedZ, 10);
    });

    it('uses custom threshold', () => {
        // hist = [1, 2, 3] → mean=2, stdDev≈0.8165, z = (3.5-2)/0.8165 ≈ 1.837
        const histories: Record<string, number[]> = {
            'mild increase': [1.0, 2.0, 3.0, 3.5],
        };

        const defaultResult = detectSilentRegression(histories);
        expect(defaultResult.regressions).toHaveLength(0);

        const customResult = detectSilentRegression(histories, 1);
        expect(customResult.regressions).toHaveLength(1);
        expect(customResult.threshold).toBe(1);
    });

    it('includes previous durations in the entry', () => {
        const histories: Record<string, number[]> = {
            test: [1.0, 2.0, 3.0, 10.0],
        };

        const result = detectSilentRegression(histories);
        const reg = nonNull(result.regressions[0]);
        expect(reg.previousDurations).toEqual([1.0, 2.0, 3.0]);
    });

    it('sets timestamp to valid ISO string', () => {
        const result = detectSilentRegression({});
        expect(() => new Date(result.timestamp)).not.toThrow();
        expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('handles Infinity durations without producing NaN z-score', () => {
        const result = detectSilentRegression({ 'inf test': [Infinity, Infinity, Infinity, 100] });
        for (const reg of result.regressions) {
            expect(Number.isFinite(reg.zScore)).toBe(true);
        }
    });

    it('handles NaN durations without propagating NaN', () => {
        const result = detectSilentRegression({ 'nan test': [NaN, NaN, NaN, 100] });
        for (const reg of result.regressions) {
            expect(Number.isFinite(reg.zScore)).toBe(true);
        }
    });

    it('handles negative durations without crashing', () => {
        const result = detectSilentRegression({ 'neg test': [-5, -3, -1, 10] });
        expect(Number.isFinite(result.regressions[0]?.zScore ?? 0)).toBe(true);
    });
});

describe('generateSilentRegressionHtml', () => {
    function makeResult(overrides?: Partial<RegressionResult>): RegressionResult {
        return {
            regressions: [
                {
                    title: 'auth test',
                    meanDuration: 1.0,
                    currentDuration: 3.5,
                    stdDev: 0.1,
                    zScore: 25.0,
                    severity: 'critical',
                    previousDurations: [0.9, 1.0, 1.1, 1.0],
                },
            ],
            totalTests: 10,
            threshold: 2,
            timestamp: '2026-06-03T12:00:00.000Z',
            ...overrides,
        };
    }

    it('generates valid HTML page', () => {
        const html = generateSilentRegressionHtml(makeResult());
        expect(html).toContain('<!DOCTYPE html>');
        expect(html).toContain('</html>');
    });

    it('shows summary cards with test counts', () => {
        const html = generateSilentRegressionHtml(makeResult());
        expect(html).toContain('Total Tests');
        expect(html).toContain('10');
        expect(html).toContain('Regressions Found');
        expect(html).toContain('1');
        expect(html).toContain('Threshold (z)');
        expect(html).toContain('>2');
    });

    it('includes regression entry in table cells', () => {
        const html = generateSilentRegressionHtml(makeResult());
        expect(html).toContain('auth test');
        expect(html).toContain('3.500');
        expect(html).toContain('1.000');
        expect(html).toContain('25.00');
    });

    it('shows severity badge in each row', () => {
        const html = generateSilentRegressionHtml(makeResult());
        expect(html).toContain('data-component="badge"');
        expect(html).toContain('critical');
    });

    it('shows no-regressions message when empty', () => {
        const result = makeResult({ regressions: [] });
        const html = generateSilentRegressionHtml(result);
        expect(html).toContain('No silent regressions detected');
        expect(html).toContain('Regressions Found');

        const cards = [
            { label: 'Total Tests', value: '10' },
            { label: 'Regressions Found', value: '0' },
            { label: 'Threshold (z)', value: '>2' },
        ];
        for (const c of cards) {
            expect(html).toContain(c.label);
        }
    });

    it('uses custom title', () => {
        const html = generateSilentRegressionHtml(makeResult({ regressions: [] }), 'My Report');
        expect(html).toContain('<title>My Report</title>');
        expect(html).toContain('<h1>My Report</h1>');
    });

    it('escapes HTML in test titles', () => {
        const result = makeResult({
            regressions: [
                {
                    title: '<script>alert(1)</script>',
                    meanDuration: 1.0,
                    currentDuration: 5.0,
                    stdDev: 0.5,
                    zScore: 8.0,
                    severity: 'critical',
                    previousDurations: [0.8, 1.0, 1.2],
                },
            ],
        });

        const html = generateSilentRegressionHtml(result);
        expect(html).toContain('&lt;script&gt;');
        expect(html).not.toContain('<script>alert');
    });

    it('includes theme and dark mode support', () => {
        const html = generateSilentRegressionHtml(makeResult({ regressions: [] }));
        expect(html).toContain('qa-report-theme');
        expect(html).toContain('prefers-color-scheme');
        expect(html).toContain('--color-surface-page');
        expect(html).toContain('html.dark');
    });

    it('includes footer', () => {
        const html = generateSilentRegressionHtml(makeResult({ regressions: [] }));
        expect(html).toContain('Silent Regression Detector');
    });

    it('shows data-component attributes from primitives', () => {
        const html = generateSilentRegressionHtml(makeResult());
        expect(html).toContain('data-component="metric-grid"');
        expect(html).toContain('data-component="metric-card"');
        expect(html).toContain('data-component="table-wrapper"');
    });

    it('handles regressions at all severity levels', () => {
        const result = makeResult({
            regressions: [
                {
                    title: 'critical test',
                    meanDuration: 1.0,
                    currentDuration: 10.0,
                    stdDev: 0.2,
                    zScore: 45.0,
                    severity: 'critical',
                    previousDurations: [1.0, 1.0, 1.0, 1.0],
                },
                {
                    title: 'high test',
                    meanDuration: 1.0,
                    currentDuration: 5.0,
                    stdDev: 0.2,
                    zScore: 20.0,
                    severity: 'high',
                    previousDurations: [1.0, 1.0, 1.0, 1.0],
                },
                {
                    title: 'medium test',
                    meanDuration: 1.0,
                    currentDuration: 3.0,
                    stdDev: 0.2,
                    zScore: 10.0,
                    severity: 'medium',
                    previousDurations: [1.0, 1.0, 1.0, 1.0],
                },
                {
                    title: 'low test',
                    meanDuration: 1.0,
                    currentDuration: 1.5,
                    stdDev: 0.2,
                    zScore: 2.5,
                    severity: 'low',
                    previousDurations: [1.0, 1.0, 1.0, 1.0],
                },
            ],
        });

        const html = generateSilentRegressionHtml(result);
        expect(html).toContain('critical');
        expect(html).toContain('high');
        expect(html).toContain('medium');
        expect(html).toContain('low');
    });

    it('handles multiple regression entries', () => {
        const result = makeResult({
            regressions: [
                {
                    title: 'test A',
                    meanDuration: 1.0,
                    currentDuration: 3.0,
                    stdDev: 0.2,
                    zScore: 10.0,
                    severity: 'high',
                    previousDurations: [0.9, 1.0, 1.1],
                },
                {
                    title: 'test B',
                    meanDuration: 2.0,
                    currentDuration: 5.0,
                    stdDev: 0.3,
                    zScore: 10.0,
                    severity: 'high',
                    previousDurations: [1.9, 2.0, 2.1],
                },
            ],
        });

        const html = generateSilentRegressionHtml(result);
        expect(html).toContain('test A');
        expect(html).toContain('test B');
    });

    it('uses error severity on MetricCard when regressions exist', () => {
        const html = generateSilentRegressionHtml(makeResult());
        expect(html).toContain('data-severity="error"');
    });

    it('uses success severity on MetricCard when no regressions', () => {
        const html = generateSilentRegressionHtml(makeResult({ regressions: [] }));
        expect(html).toContain('data-severity="success"');
    });

    it('renders severity badge for none severity (default variant)', () => {
        const result = makeResult({
            regressions: [
                {
                    title: 'default badge test',
                    meanDuration: 1.0,
                    currentDuration: 1.2,
                    stdDev: 0.5,
                    zScore: 2.1,
                    severity: 'none',
                    previousDurations: [1.0, 1.1, 0.9],
                },
            ],
        });

        const html = generateSilentRegressionHtml(result);
        expect(html).toContain('data-variant="default"');
        expect(html).toContain('none');
    });

    it('handles error during HTML generation gracefully', () => {
        const html = generateSilentRegressionHtml(null);
        expect(html).toContain('Error generating silent regression report');
    });
});
