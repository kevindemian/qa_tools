/**
 * Integration tests — Defect Trend (FT-20)
 *
 * Validates the Defect Trend HTML report end-to-end:
 * - generateDefectTrendHtml with data
 * - Empty trends
 * - Error fallback
 * - Dark mode
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DefectTrendResult } from '../../defect-trend.js';

vi.mock('../../logger.js', () => ({
    rootLogger: { error: vi.fn(), info: vi.fn(), child: vi.fn().mockReturnThis() },
}));

vi.mock('../../config-accessor.js', () => ({
    default: { get: vi.fn(() => '') },
    get: vi.fn(() => ''),
}));

vi.mock('../../html-factory.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../html-factory.js')>();
    return { ...actual, buildHtmlPage: vi.fn(actual.buildHtmlPage) };
});

function makeResult(overrides?: Partial<DefectTrendResult>): DefectTrendResult {
    return {
        trends: [
            { date: '2026-06-01', categories: { ASSERTION: 2, TIMEOUT: 1 }, total: 3 },
            { date: '2026-06-02', categories: { TIMEOUT: 1 }, total: 1 },
        ],
        topCategories: [
            { category: 'ASSERTION', count: 2 },
            { category: 'TIMEOUT', count: 2 },
        ],
        period: { from: '2026-06-01', to: '2026-06-02' },
        ...overrides,
    };
}

describe('Integration: Defect Trend (FT-20)', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    describe('FT-20a: generateDefectTrendHtml with data', () => {
        it('produces complete HTML with table and summary cards', async () => {
            expect.hasAssertions();

            const { generateDefectTrendHtml } = await import('../../defect-trend.js');
            const result = makeResult();
            const html = generateDefectTrendHtml(result, 'Defect Report');

            expect(html).toContain('Defect Report');
            expect(html).toContain('ASSERTION');
            expect(html).toContain('TIMEOUT');
            expect(html).toContain('2026-06-01');
            expect(html).toContain('2026-06-02');
            expect(html).toContain('data-component="metric-card"');
            expect(html).toContain('<table');
        });
    });

    describe('FT-20b: empty trends', () => {
        it('shows no-data message', async () => {
            expect.hasAssertions();

            const { generateDefectTrendHtml } = await import('../../defect-trend.js');
            const result = makeResult({ trends: [], topCategories: [], period: { from: '', to: '' } });
            const html = generateDefectTrendHtml(result);

            expect(html).toContain('No defect data available.');
        });
    });

    describe('FT-20c: error fallback', () => {
        it('returns buildErrorPage when buildHtmlPage throws', async () => {
            expect.hasAssertions();

            const { generateDefectTrendHtml } = await import('../../defect-trend.js');
            const { buildHtmlPage } = await import('../../html-factory.js');
            const { rootLogger } = await import('../../logger.js');

            vi.mocked(buildHtmlPage).mockImplementationOnce(() => {
                throw new Error('page assembly failed');
            });

            const html = generateDefectTrendHtml(
                {
                    trends: [{ date: '2026-06-01', categories: { A: 1 }, total: 1 }],
                    topCategories: [{ category: 'A', count: 1 }],
                    period: { from: '2026-06-01', to: '2026-06-01' },
                },
                'Error Test',
            );

            expect(html).toContain('Error generating dashboard');
            expect(vi.spyOn(rootLogger, 'error')).toHaveBeenCalledWith(
                expect.stringContaining('Failed to generate defect trend dashboard'),
            );
        });
    });

    describe('FT-20d: dark mode', () => {
        it('includes theme toggle and dark mode CSS', async () => {
            expect.hasAssertions();

            const { generateDefectTrendHtml } = await import('../../defect-trend.js');
            const html = generateDefectTrendHtml(makeResult());

            expect(html).toContain('qa-report-theme');
            expect(html).toContain('--color-surface-page');
            expect(html).toContain('html.dark');
        });
    });
});
