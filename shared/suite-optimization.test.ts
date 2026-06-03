import { analyzeSuiteOptimization, generateOptimizationHtml } from './suite-optimization';

const DEFAULT_SLOW = 5;
const DEFAULT_FLAKY = 0.3;

describe('analyzeSuiteOptimization', () => {
    it('returns empty result for empty input', () => {
        const result = analyzeSuiteOptimization([]);
        expect(result.optimizations).toHaveLength(0);
        expect(result.totalTests).toBe(0);
        expect(result.totalDuration).toBe(0);
        expect(result.potentialSavings).toBe(0);
        expect(result.slowThreshold).toBe(DEFAULT_SLOW);
        expect(result.flakyThreshold).toBe(DEFAULT_FLAKY);
        expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('returns none action for normal test within thresholds', () => {
        const result = analyzeSuiteOptimization([{ title: 'normal', duration: 3, flakiness: 0.05 }]);
        expect(result.optimizations[0]?.action).toBe('none');
        expect(result.optimizations[0]?.impact).toBe('low');
        expect(result.optimizations[0]?.reason).toBe('Within acceptable thresholds');
        expect(result.potentialSavings).toBe(0);
    });

    it('detects quarantine for flaky test', () => {
        const result = analyzeSuiteOptimization([{ title: 'flaky_test', duration: 3, flakiness: 0.5 }]);
        expect(result.optimizations[0]?.action).toBe('quarantine');
        expect(result.optimizations[0]?.impact).toBe('high');
        expect(result.optimizations[0]?.reason).toContain('exceeds threshold');
    });

    it('detects split for very slow test (>3x threshold)', () => {
        const result = analyzeSuiteOptimization([{ title: 'very_slow', duration: 16, flakiness: 0.05 }]);
        expect(result.optimizations[0]?.action).toBe('split');
        expect(result.optimizations[0]?.impact).toBe('high');
        expect(result.optimizations[0]?.reason).toContain('consider splitting');
    });

    it('detects parallelize for moderately slow test (>2x threshold)', () => {
        const result = analyzeSuiteOptimization([{ title: 'mod_slow', duration: 11, flakiness: 0.05 }]);
        expect(result.optimizations[0]?.action).toBe('parallelize');
        expect(result.optimizations[0]?.impact).toBe('medium');
        expect(result.optimizations[0]?.reason).toContain('parallel execution');
    });

    it('detects remove_wait for duration >1.5x with low flakiness', () => {
        const result = analyzeSuiteOptimization([{ title: 'waiting', duration: 8, flakiness: 0.05 }]);
        expect(result.optimizations[0]?.action).toBe('remove_wait');
        expect(result.optimizations[0]?.impact).toBe('medium');
        expect(result.optimizations[0]?.reason).toContain('unnecessary waits');
    });

    it('detects speed_up for slightly slow test (>1x threshold)', () => {
        const result = analyzeSuiteOptimization([{ title: 'slightly_slow', duration: 6, flakiness: 0.05 }]);
        expect(result.optimizations[0]?.action).toBe('speed_up');
        expect(result.optimizations[0]?.impact).toBe('medium');
        expect(result.optimizations[0]?.reason).toContain('needs optimization');
    });

    it('quarantine takes priority over duration actions', () => {
        const result = analyzeSuiteOptimization([{ title: 'flaky_and_slow', duration: 20, flakiness: 0.5 }]);
        expect(result.optimizations[0]?.action).toBe('quarantine');
        expect(result.optimizations[0]?.impact).toBe('high');
    });

    it('parallelize takes priority over remove_wait and speed_up', () => {
        const result = analyzeSuiteOptimization([{ title: 'parallel_priority', duration: 11, flakiness: 0.01 }]);
        expect(result.optimizations[0]?.action).toBe('parallelize');
    });

    it('remove_wait takes priority over speed_up', () => {
        const result = analyzeSuiteOptimization([{ title: 'remove_priority', duration: 8, flakiness: 0.05 }]);
        expect(result.optimizations[0]?.action).toBe('remove_wait');
    });

    it('handles NaN duration gracefully', () => {
        const result = analyzeSuiteOptimization([{ title: 'nan_dur', duration: NaN, flakiness: 0 }]);
        expect(result.optimizations[0]?.duration).toBe(0);
        expect(result.optimizations[0]?.action).toBe('none');
    });

    it('handles NaN flakiness gracefully', () => {
        const result = analyzeSuiteOptimization([{ title: 'nan_flaky', duration: 3, flakiness: NaN }]);
        expect(result.optimizations[0]?.flakiness).toBe(0);
        expect(result.optimizations[0]?.action).toBe('none');
    });

    it('handles negative duration gracefully', () => {
        const result = analyzeSuiteOptimization([{ title: 'neg', duration: -1, flakiness: 0 }]);
        expect(result.optimizations[0]?.duration).toBe(0);
        expect(result.optimizations[0]?.action).toBe('none');
    });

    it('handles zero duration', () => {
        const result = analyzeSuiteOptimization([{ title: 'zero', duration: 0, flakiness: 0 }]);
        expect(result.optimizations[0]?.action).toBe('none');
        expect(result.optimizations[0]?.duration).toBe(0);
    });

    it('sorts by impact (high first) then duration descending', () => {
        const result = analyzeSuiteOptimization([
            { title: 'D_low', duration: 3, flakiness: 0 },
            { title: 'A_high', duration: 8, flakiness: 0.5 },
            { title: 'C_med', duration: 6, flakiness: 0 },
            { title: 'B_high_fast', duration: 6, flakiness: 0.5 },
        ]);
        const titles = result.optimizations.map((e) => e.testTitle);
        expect(titles).toEqual(['A_high', 'B_high_fast', 'C_med', 'D_low']);
    });

    it('uses custom thresholds', () => {
        const result = analyzeSuiteOptimization([{ title: 't', duration: 10, flakiness: 0.2 }], 8, 0.15);
        expect(result.slowThreshold).toBe(8);
        expect(result.flakyThreshold).toBe(0.15);
        expect(result.optimizations[0]?.action).toBe('quarantine');
    });

    it('fallback to defaults when thresholds are NaN', () => {
        const result = analyzeSuiteOptimization([{ title: 't', duration: 6, flakiness: 0.31 }], NaN, NaN);
        expect(result.slowThreshold).toBe(DEFAULT_SLOW);
        expect(result.flakyThreshold).toBe(DEFAULT_FLAKY);
        expect(result.optimizations[0]?.action).toBe('quarantine');
    });

    it('fallback to defaults when thresholds are negative', () => {
        const result = analyzeSuiteOptimization([{ title: 't', duration: 6, flakiness: 0.31 }], -1, -1);
        expect(result.slowThreshold).toBe(DEFAULT_SLOW);
        expect(result.flakyThreshold).toBe(DEFAULT_FLAKY);
    });

    it('computes potential savings correctly', () => {
        const result = analyzeSuiteOptimization([
            { title: 'a', duration: 16, flakiness: 0 },
            { title: 'b', duration: 11, flakiness: 0 },
            { title: 'c', duration: 8, flakiness: 0.05 },
            { title: 'd', duration: 6, flakiness: 0 },
        ]);
        const expected = 16 - 5 + (11 - 5) + (8 - 5) + (6 - 5);
        expect(result.potentialSavings).toBe(expected);
    });

    it('returns zero potential savings when all tests are none', () => {
        const result = analyzeSuiteOptimization([
            { title: 'a', duration: 3, flakiness: 0 },
            { title: 'b', duration: 1, flakiness: 0 },
        ]);
        expect(result.potentialSavings).toBe(0);
    });

    it('computes total duration correctly', () => {
        const result = analyzeSuiteOptimization([
            { title: 'a', duration: 10, flakiness: 0 },
            { title: 'b', duration: 20, flakiness: 0 },
        ]);
        expect(result.totalDuration).toBe(30);
    });

    it('includes all tests in totalTests count', () => {
        const result = analyzeSuiteOptimization([
            { title: 'a', duration: 1, flakiness: 0 },
            { title: 'b', duration: 2, flakiness: 0 },
            { title: 'c', duration: 3, flakiness: 0 },
        ]);
        expect(result.totalTests).toBe(3);
    });

    it('uses provided thresholds defaults when undefined', () => {
        const result = analyzeSuiteOptimization([{ title: 't', duration: 6, flakiness: 0.31 }]);
        expect(result.slowThreshold).toBe(DEFAULT_SLOW);
        expect(result.flakyThreshold).toBe(DEFAULT_FLAKY);
    });
});

describe('generateOptimizationHtml', () => {
    it('returns complete HTML page structure', () => {
        const result = analyzeSuiteOptimization([{ title: 'slow', duration: 10, flakiness: 0.05 }]);
        const html = generateOptimizationHtml(result);
        expect(html).toContain('<!DOCTYPE html>');
        expect(html).toContain('<html');
        expect(html).toContain('</html>');
    });

    it('includes summary MetricGrid with MetricCards', () => {
        const result = analyzeSuiteOptimization([{ title: 'slow', duration: 10, flakiness: 0.05 }]);
        const html = generateOptimizationHtml(result);
        expect(html).toContain('data-component="metric-grid"');
        expect(html).toContain('data-component="metric-card"');
        expect(html).toContain('Total Tests');
        expect(html).toContain('Total Duration');
        expect(html).toContain('Potential Savings');
    });

    it('shows DataTable with optimization rows', () => {
        const result = analyzeSuiteOptimization([{ title: 'slow_test', duration: 10, flakiness: 0.2 }]);
        const html = generateOptimizationHtml(result);
        expect(html).toContain('data-component="data-table"');
        expect(html).toContain('slow_test');
        expect(html).toContain('speed up');
    });

    it('displays action badge with underscore replaced by space', () => {
        const result = analyzeSuiteOptimization([{ title: 'waiting', duration: 8, flakiness: 0.05 }]);
        const html = generateOptimizationHtml(result);
        expect(html).toContain('data-component="badge"');
        expect(html).toContain('remove wait');
        expect(html).not.toContain('remove_wait');
    });

    it('displays impact SeverityBadge', () => {
        const result = analyzeSuiteOptimization([{ title: 'slow', duration: 10, flakiness: 0.05 }]);
        const html = generateOptimizationHtml(result);
        expect(html).toContain('data-component="badge"');
    });

    it('shows clean state when no optimizations needed', () => {
        const result = analyzeSuiteOptimization([{ title: 'fast', duration: 2, flakiness: 0 }]);
        const html = generateOptimizationHtml(result);
        expect(html).toContain('clean-state');
        expect(html).toContain('no optimizations needed');
        expect(html).not.toContain('data-component="data-table"');
    });

    it('shows clean state for empty result', () => {
        const result = analyzeSuiteOptimization([]);
        const html = generateOptimizationHtml(result);
        expect(html).toContain('clean-state');
    });

    it('includes default title when none provided', () => {
        const result = analyzeSuiteOptimization([]);
        const html = generateOptimizationHtml(result);
        expect(html).toContain('Suite Optimization Report');
    });

    it('includes custom title', () => {
        const result = analyzeSuiteOptimization([]);
        const html = generateOptimizationHtml(result, 'My Custom Report');
        expect(html).toContain('My Custom Report');
    });

    it('sanitizes test titles in the table', () => {
        const result = analyzeSuiteOptimization([
            { title: '<script>alert(1)</script>', duration: 10, flakiness: 0.05 },
        ]);
        const html = generateOptimizationHtml(result);
        expect(html).not.toContain('<script>alert(1)</script>');
        expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    });

    it('includes impact CSS classes on rows', () => {
        const result = analyzeSuiteOptimization([
            { title: 'high_impact', duration: 20, flakiness: 0 },
            { title: 'med_impact', duration: 8, flakiness: 0.05 },
        ]);
        const html = generateOptimizationHtml(result);
        expect(html).toContain('class="impact-high"');
        expect(html).toContain('class="impact-medium"');
    });

    it('includes Container and Section wrappers', () => {
        const result = analyzeSuiteOptimization([{ title: 't', duration: 3, flakiness: 0 }]);
        const html = generateOptimizationHtml(result);
        expect(html).toContain('data-component="container"');
        expect(html).toContain('data-component="section"');
    });

    it('shows metric values from the result', () => {
        const result: import('./suite-optimization').OptimizationResult = {
            optimizations: [],
            totalTests: 42,
            totalDuration: 120.5,
            potentialSavings: 30.2,
            slowThreshold: 5,
            flakyThreshold: 0.3,
            timestamp: '2026-01-01T00:00:00.000Z',
        };
        const html = generateOptimizationHtml(result);
        expect(html).toContain('42');
        expect(html).toContain('120.5s');
        expect(html).toContain('30.2s');
    });

    it('uses success severity for positive savings', () => {
        const result: import('./suite-optimization').OptimizationResult = {
            optimizations: [],
            totalTests: 0,
            totalDuration: 0,
            potentialSavings: 10,
            slowThreshold: 5,
            flakyThreshold: 0.3,
            timestamp: '2026-01-01T00:00:00.000Z',
        };
        const html = generateOptimizationHtml(result, 'Test');
        expect(html).toContain('10.0s');
    });

    it('falls back to default action variant for unknown action', () => {
        const result: import('./suite-optimization').OptimizationResult = {
            optimizations: [
                {
                    testTitle: 'custom',
                    duration: 10,
                    flakiness: 0.05,
                    impact: 'medium',
                    action: 'nonsense',
                    reason: 'test',
                },
            ],
            totalTests: 1,
            totalDuration: 10,
            potentialSavings: 5,
            slowThreshold: 5,
            flakyThreshold: 0.3,
            timestamp: '2026-01-01T00:00:00.000Z',
        };
        const html = generateOptimizationHtml(result);
        expect(html).toContain('data-variant="default"');
    });

    it('handles unknown action variant gracefully', () => {
        const result: import('./suite-optimization').OptimizationResult = {
            optimizations: [
                {
                    testTitle: 'unknown_action',
                    duration: 10,
                    flakiness: 0.05,
                    impact: 'medium',
                    action: 'custom_action',
                    reason: 'some reason',
                },
            ],
            totalTests: 1,
            totalDuration: 10,
            potentialSavings: 5,
            slowThreshold: 5,
            flakyThreshold: 0.3,
            timestamp: '2026-01-01T00:00:00.000Z',
        };
        const html = generateOptimizationHtml(result);
        expect(html).toContain('data-component="badge"');
        expect(html).toContain('custom action');
    });
});
