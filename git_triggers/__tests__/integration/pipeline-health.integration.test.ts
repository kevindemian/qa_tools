/**
 * Integration tests — Pipeline Health (pipeline-health)
 *
 * Validates the Pipeline Health HTML report end-to-end:
 * - renderPipelineHealthHtml with data
 * - Empty data
 * - Error handling
 * - Dark mode and theme toggle
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PipelineHealth } from '../../pipeline-health.js';

vi.mock('../../shared/logger.js', () => ({
    rootLogger: { error: vi.fn(), info: vi.fn(), child: vi.fn().mockReturnThis() },
}));

vi.mock('../../shared/config.js', () => ({
    default: { get: vi.fn(() => '') },
    get: vi.fn(() => ''),
}));

function makeHealth(overrides?: Partial<PipelineHealth>): PipelineHealth {
    return {
        period: { from: '2026-06-01', to: '2026-06-07' },
        totalRuns: 30,
        passedRuns: 20,
        failedRuns: 10,
        passRate: 67,
        avgDurationSec: 150,
        topFailingJobs: [{ name: 'lint', failCount: 3, totalCount: 10, rate: 30 }],
        failureReasons: [{ message: 'Module not found', count: 2 }],
        failureByCategory: { code: 3, infrastructure: 1 },
        branchBreakdown: [
            { branch: 'main', passRate: 80, count: 20 },
            { branch: 'develop', passRate: 50, count: 10 },
        ],
        openIssues: { total: 5, byLabel: { bug: 3, feature: 2 }, staleCount: 1 },
        ...overrides,
    };
}

describe('Integration: Pipeline Health', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    describe('PH-01: renderPipelineHealthHtml with data', () => {
        it('produces complete HTML with summary cards, tables, and sections', async () => {expect.hasAssertions();

            const { renderPipelineHealthHtml } = await import('../../pipeline-health.js');
            const health = makeHealth();
            const html = renderPipelineHealthHtml(health, 'Pipeline Report');

            expect(html).toContain('Pipeline Report');
            expect(html).toContain('Total Runs');
            expect(html).toContain('Passed');
            expect(html).toContain('Failed');
            expect(html).toContain('Pass Rate');
            expect(html).toContain('Avg Duration');
            expect(html).toContain('lint');
            expect(html).toContain('Module not found');
            expect(html).toContain('main');
            expect(html).toContain('develop');
            expect(html).toContain('bug');
        });
    });

    describe('PH-02: empty pipeline health', () => {
        it('shows zeros and no-failure messages', async () => {expect.hasAssertions();

            const { aggregatePipelineHealth, renderPipelineHealthHtml } = await import('../../pipeline-health.js');
            const health = aggregatePipelineHealth([], [], [], []);
            const html = renderPipelineHealthHtml(health, 'Empty Report');

            expect(html).toContain('Empty Report');
            expect(html).toContain('0');
            expect(html).toContain('No failing jobs');
        });
    });

    describe('PH-03: theme and dark mode', () => {
        it('includes theme toggle script and dark mode CSS', async () => {expect.hasAssertions();

            const { renderPipelineHealthHtml } = await import('../../pipeline-health.js');
            const html = renderPipelineHealthHtml(makeHealth());

            expect(html).toContain('qa-report-theme');
            expect(html).toContain('html.dark');
        });
    });

    describe('PH-04: design tokens', () => {
        it('uses CSS custom properties for colors', async () => {expect.hasAssertions();

            const { renderPipelineHealthHtml } = await import('../../pipeline-health.js');
            const html = renderPipelineHealthHtml(makeHealth());

            expect(html).toContain('var(--color-surface-card)');
            expect(html).toContain('var(--color-border-default)');
            expect(html).toContain('var(--color-text-muted)');
        });
    });

    describe('PH-05: footer present', () => {
        it('contains footer with module name', async () => {expect.hasAssertions();

            const { renderPipelineHealthHtml } = await import('../../pipeline-health.js');
            const html = renderPipelineHealthHtml(makeHealth());

            expect(html).toContain('Pipeline Health Dashboard');
        });
    });

    describe('PH-06: no legacy HTML4 table attributes', () => {
        it('does not use border="1" or cellpadding="6"', async () => {expect.hasAssertions();

            const { renderPipelineHealthHtml } = await import('../../pipeline-health.js');
            const html = renderPipelineHealthHtml(makeHealth());

            expect(html).not.toContain('border="1"');
            expect(html).not.toContain('cellpadding="6"');
            expect(html).not.toContain('background:#f3f4f6');
        });
    });
});
