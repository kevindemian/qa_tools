import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../logger.js', () => ({
    rootLogger: { error: vi.fn(), info: vi.fn(), child: vi.fn().mockReturnThis() },
}));

vi.mock('../../config-accessor.js', () => ({
    default: { get: vi.fn(() => '') },
    get: vi.fn(() => ''),
}));

describe('Integration: Suite Optimization (FT-26)', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    describe('FT-26a: generateOptimizationHtml', () => {
        it('returns complete HTML document with data', async () => {
            expect.hasAssertions();

            const { analyzeSuiteOptimization, generateOptimizationHtml } =
                await import('../../quality/suite-optimization.js');
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
            expect.hasAssertions();

            const { analyzeSuiteOptimization, generateOptimizationHtml } =
                await import('../../quality/suite-optimization.js');
            const tests = [{ title: 'Fast Test', duration: 2, flakiness: 0 }];
            const result = analyzeSuiteOptimization(tests);
            const html = generateOptimizationHtml(result);

            expect(html).toContain('no optimizations needed');
        });

        it('shows clean state for empty input', async () => {
            expect.hasAssertions();

            const { analyzeSuiteOptimization, generateOptimizationHtml } =
                await import('../../quality/suite-optimization.js');
            const result = analyzeSuiteOptimization([]);
            const html = generateOptimizationHtml(result);

            expect(html).toContain('clean-state');
        });

        it('uses custom title', async () => {
            expect.hasAssertions();

            const { analyzeSuiteOptimization, generateOptimizationHtml } =
                await import('../../quality/suite-optimization.js');
            const result = analyzeSuiteOptimization([]);
            const html = generateOptimizationHtml(result, 'My Custom Report');

            expect(html).toContain('My Custom Report');
            expect(html).not.toContain('Suite Optimization Report');
        });
    });

    describe('FT-26b: error fallback', () => {
        it('returns error page when buildHtmlPage throws', async () => {
            expect.hasAssertions();

            const { analyzeSuiteOptimization, generateOptimizationHtml } =
                await import('../../quality/suite-optimization.js');
            const htmlFactory = await import('../../report/html-factory.js');
            const spy = vi.spyOn(htmlFactory, 'buildHtmlPage').mockImplementation(() => {
                throw new Error('mock crash');
            });
            const tests = [{ title: 't', duration: 10, flakiness: 0.05 }];
            const result = analyzeSuiteOptimization(tests);
            const html = generateOptimizationHtml(result);

            expect(html).toContain('Error generating');

            spy.mockRestore();
        });
    });
});
