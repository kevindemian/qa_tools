import { beforeEach, describe, expect, it, vi } from 'vitest';
import { computeOptimizationActions } from '../../data-hub/compute/optimization-actions.js';
import type { OptimizationResult } from '../../types/data-hub-extensions.js';

function analyze(tests: Array<{ title: string; duration: number; flakiness: number }>): OptimizationResult {
    const durationMap = Object.create(null) as Record<string, number[]>;
    const flakinessMap = Object.create(null) as Record<string, number>;
    for (const t of tests) {
        durationMap[t.title] = [t.duration * 1000];
        flakinessMap[t.title] = t.flakiness;
    }
    return computeOptimizationActions(durationMap, flakinessMap);
}

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

            const { generateOptimizationHtml } = await import('../../quality/suite-optimization.js');
            const tests = [
                { title: 'Slow Test', duration: 10, flakiness: 0.05 },
                { title: 'Fast Test', duration: 2, flakiness: 0 },
            ];
            const result = analyze(tests);
            const html = generateOptimizationHtml(result, 'FT-26 Test');

            expect(html).toContain('<!DOCTYPE html>');
            expect(html).toContain('</html>');
            expect(html).toContain('FT-26 Test');
            expect(html).toContain('Tests to Optimize');
            expect(html).toContain('Total Duration');
            expect(html).toContain('Potential Savings');
            expect(html).toContain('Slow Test');
        });

        it('shows clean state when no optimizations needed', async () => {
            expect.hasAssertions();

            const { generateOptimizationHtml } = await import('../../quality/suite-optimization.js');
            const tests = [{ title: 'Fast Test', duration: 2, flakiness: 0 }];
            const result = analyze(tests);
            const html = generateOptimizationHtml(result);

            expect(html).toContain('no optimizations needed');
        });

        it('shows clean state for empty input', async () => {
            expect.hasAssertions();

            const { generateOptimizationHtml } = await import('../../quality/suite-optimization.js');
            const result = analyze([]);
            const html = generateOptimizationHtml(result);

            expect(html).toContain('clean-state');
        });

        it('uses custom title', async () => {
            expect.hasAssertions();

            const { generateOptimizationHtml } = await import('../../quality/suite-optimization.js');
            const result = analyze([]);
            const html = generateOptimizationHtml(result, 'My Custom Report');

            expect(html).toContain('My Custom Report');
            expect(html).not.toContain('Suite Optimization Report');
        });
    });

    describe('FT-26b: error fallback', () => {
        it('returns error page when buildHtmlPage throws', async () => {
            expect.hasAssertions();

            const { generateOptimizationHtml } = await import('../../quality/suite-optimization.js');
            const htmlFactory = await import('../../report/html-factory.js');
            const spy = vi.spyOn(htmlFactory, 'buildHtmlPage').mockImplementation(() => {
                throw new Error('mock crash');
            });
            const tests = [{ title: 't', duration: 10, flakiness: 0.05 }];
            const result = analyze(tests);
            const html = generateOptimizationHtml(result);

            expect(html).toContain('Error generating');

            spy.mockRestore();
        });
    });

    describe('FT-26c: data attributes', () => {
        it('includes data-part="target" with threshold values', async () => {
            expect.hasAssertions();

            const { generateOptimizationHtml } = await import('../../quality/suite-optimization.js');
            const tests = [{ title: 'slow test', duration: 20, flakiness: 0.1 }];
            const result = analyze(tests);
            const html = generateOptimizationHtml(result);

            expect(html).toContain('data-part="target"');
            expect(html).toContain('target: <60s');
        });

        it('includes data-part="timestamp"', async () => {
            expect.hasAssertions();

            const { generateOptimizationHtml } = await import('../../quality/suite-optimization.js');
            const result = analyze([]);
            const html = generateOptimizationHtml(result);

            expect(html).toContain('data-part="timestamp"');
        });
    });
});
