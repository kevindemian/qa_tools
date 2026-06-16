import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../logger.js', () => ({
    rootLogger: { error: vi.fn(), info: vi.fn(), child: vi.fn().mockReturnThis() },
}));

vi.mock('../../config.js', () => ({
    default: { get: vi.fn(() => '') },
    get: vi.fn(() => ''),
}));

describe('Integration: Suite Optimization (FT-26)', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    describe('FT-26a: generateOptimizationHtml', () => {
        it('returns complete HTML document with data', async () => {
            const { analyzeSuiteOptimization, generateOptimizationHtml } = await import('../../suite-optimization.js');
            const tests = [
                { title: 'Slow Test', duration: 10, flakiness: 0.05 },
                { title: 'Fast Test', duration: 2, flakiness: 0 },
            ];
            const result = analyzeSuiteOptimization(tests);
            const html = generateOptimizationHtml(result, 'FT-26 Test');
            expect(html).toContain('<!DOCTYPE html>');
            expect(html).toContain('</html>');
            expect(html).toContain('FT-26 Test');
            expect(html).toContain('Total Tests');
            expect(html).toContain('Total Duration');
            expect(html).toContain('Potential Savings');
            expect(html).toContain('Slow Test');
        });

        it('shows clean state when no optimizations needed', async () => {
            const { analyzeSuiteOptimization, generateOptimizationHtml } = await import('../../suite-optimization.js');
            const tests = [{ title: 'Fast Test', duration: 2, flakiness: 0 }];
            const result = analyzeSuiteOptimization(tests);
            const html = generateOptimizationHtml(result);
            expect(html).toContain('no optimizations needed');
        });

        it('shows clean state for empty input', async () => {
            const { analyzeSuiteOptimization, generateOptimizationHtml } = await import('../../suite-optimization.js');
            const result = analyzeSuiteOptimization([]);
            const html = generateOptimizationHtml(result);
            expect(html).toContain('clean-state');
        });

        it('uses custom title', async () => {
            const { analyzeSuiteOptimization, generateOptimizationHtml } = await import('../../suite-optimization.js');
            const result = analyzeSuiteOptimization([]);
            const html = generateOptimizationHtml(result, 'My Custom Report');
            expect(html).toContain('My Custom Report');
            expect(html).not.toContain('Suite Optimization Report');
        });
    });
});
