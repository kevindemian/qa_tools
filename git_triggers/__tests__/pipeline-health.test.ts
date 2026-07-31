/** Pipeline health renderer — pure function tests with fixture data. */
import { renderPipelineHealthHtml, extractErrorMessages, formatDuration } from '../pipeline-health-renderer.js';
import type { PipelineHealthData } from '../pipeline-health-renderer.js';

/* ------------------------------------------------------------------ */
/*  Fixtures                                                           */
/* ------------------------------------------------------------------ */

const sampleHealthData: PipelineHealthData = {
    totalRuns: 5,
    passRate: 60,
    avgDurationSec: 240,
    topFailingJobs: [
        { name: 'lint', failCount: 1, totalCount: 5, rate: 20 },
        { name: 'test', failCount: 1, totalCount: 4, rate: 25 },
    ],
    failureReasons: ["Module not found: 'foo'", 'Timeout: page did not load', 'Cannot connect to Docker daemon'],
    branchBreakdown: {
        main: { passRate: 75, count: 4 },
        develop: { passRate: 0, count: 1 },
    },
    period: { from: '2026-05-28', to: '2026-05-28' },
};

/* ------------------------------------------------------------------ */
/*  Tests — ExtractErrorMessages                                       */
/* ------------------------------------------------------------------ */

describe('ExtractErrorMessages', () => {
    it('extracts unique error messages from log text', () => {
        const log = `[INFO] Starting build
Error: Module not found: 'foo'
[WARN] retrying
Error: Module not found: 'foo'
FATAL: OOMKilled`;
        const result = extractErrorMessages(log, 5);

        expect(result).toStrictEqual(["Module not found: 'foo'", 'OOMKilled']);
    });

    it('respects maxEntries limit', () => {
        const log = `Error: A\nError: B\nError: C\nError: D`;

        expect(extractErrorMessages(log, 2)).toHaveLength(2);
    });

    it('returns empty array for clean log', () => {
        expect(extractErrorMessages('All tests passed!', 5)).toStrictEqual([]);
    });

    it('handles empty string', () => {
        expect(extractErrorMessages('', 5)).toStrictEqual([]);
    });
});

/* ------------------------------------------------------------------ */
/*  Tests — FormatDuration                                             */
/* ------------------------------------------------------------------ */

describe('FormatDuration', () => {
    it('formats seconds only', () => {
        expect(formatDuration(30)).toBe('30s');
    });

    it('formats minutes and seconds', () => {
        expect(formatDuration(125)).toBe('2m 5s');
    });

    it('formats hours and minutes', () => {
        expect(formatDuration(3660)).toBe('1h 1m');
    });

    it('handles zero', () => {
        expect(formatDuration(0)).toBe('0s');
    });
});

/* ------------------------------------------------------------------ */
/*  Tests — RenderPipelineHealthHtml                                   */
/* ------------------------------------------------------------------ */

describe('RenderPipelineHealthHtml', () => {
    it('contains title', () => {
        const html = renderPipelineHealthHtml(sampleHealthData, 'Test Report');

        expect(html).toContain('Test Report');
    });

    it('contains summary cards', () => {
        const html = renderPipelineHealthHtml(sampleHealthData);

        expect(html).toContain('Total Runs');
        expect(html).toContain('Passed');
        expect(html).toContain('Failed');
        expect(html).toContain('Pass Rate');
        expect(html).toContain('Avg Duration');
    });

    it('contains top failing jobs table', () => {
        const html = renderPipelineHealthHtml(sampleHealthData);

        expect(html).toContain('Top Failing Jobs');
        expect(html).toContain('lint');
        expect(html).toContain('test');
    });

    it.each([
        { label: 'failure intelligence section', expected: ['Failure Intelligence', 'Module not found'] },
        { label: 'branch breakdown', expected: ['Branch Breakdown', 'main'] },
        { label: 'design tokens', expected: ['--color-surface-page', '--color-text-primary', '--color-text-muted'] },
        { label: 'theme toggle script', expected: ['qa-report-theme', 'prefers-color-scheme'] },
        { label: 'dark mode CSS', expected: ['html.dark'] },
    ])('contains $label', ({ expected }) => {
        expect.hasAssertions();

        const html = renderPipelineHealthHtml(sampleHealthData);

        for (const token of expected) {
            expect(html).toContain(token);
        }
    });

    it('is valid HTML document', () => {
        const html = renderPipelineHealthHtml(sampleHealthData);

        expect(html).toMatch(/^<!DOCTYPE html>/);
        expect(html).toContain('</html>');
    });

    it('includes footer', () => {
        const html = renderPipelineHealthHtml(sampleHealthData);

        expect(html).toContain('Pipeline Health Dashboard');
    });

    it('uses design-token CSS variables for card borders', () => {
        const html = renderPipelineHealthHtml(sampleHealthData);

        expect(html).toContain('var(--color-surface-card)');
        expect(html).toContain('var(--color-border-default)');
    });

    it('uses TABLE_CSS without legacy border="1" / cellpadding', () => {
        const html = renderPipelineHealthHtml(sampleHealthData);

        expect(html).not.toContain('border="1"');
        expect(html).not.toContain('cellpadding="6"');
        expect(html).not.toContain('background:#f3f4f6');
    });

    it('renders empty state gracefully', () => {
        const emptyData: PipelineHealthData = {
            totalRuns: 0,
            passRate: 0,
            avgDurationSec: 0,
            topFailingJobs: [],
            failureReasons: [],
            branchBreakdown: {},
        };
        const html = renderPipelineHealthHtml(emptyData, 'Empty Report');

        expect(html).toContain('Empty Report');
        expect(html).toContain('0');
    });

    it('computes passed/failed counts from passRate', () => {
        const html = renderPipelineHealthHtml(sampleHealthData);

        expect(html).toContain('3');
        expect(html).toContain('2');
    });
});
