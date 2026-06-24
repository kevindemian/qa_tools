/** Pipeline health — pure function tests with fixture data. */
import { aggregatePipelineHealth, extractErrorMessages, renderPipelineHealthHtml } from './pipeline-health.js';
import type { PipelineRunExtended, PipelineJobExtended } from './pipeline-health.js';
import { nonNull } from '../shared/test-utils.js';

/* ------------------------------------------------------------------ */
/*  Fixtures                                                           */
/* ------------------------------------------------------------------ */

const sampleRuns: PipelineRunExtended[] = [
    {
        id: 1,
        status: 'completed',
        conclusion: 'success',
        head_branch: 'main',
        created_at: '2026-05-28T10:00:00Z',
        run_started_at: '2026-05-28T10:00:00Z',
        updated_at: '2026-05-28T10:04:00Z',
    },
    {
        id: 2,
        status: 'completed',
        conclusion: 'success',
        head_branch: 'main',
        created_at: '2026-05-28T11:00:00Z',
        run_started_at: '2026-05-28T11:00:00Z',
        updated_at: '2026-05-28T11:05:00Z',
    },
    {
        id: 3,
        status: 'completed',
        conclusion: 'failure',
        head_branch: 'develop',
        created_at: '2026-05-28T12:00:00Z',
        run_started_at: '2026-05-28T12:00:00Z',
        updated_at: '2026-05-28T12:03:00Z',
    },
    {
        id: 4,
        status: 'completed',
        conclusion: 'failure',
        head_branch: 'main',
        created_at: '2026-05-28T13:00:00Z',
        run_started_at: '2026-05-28T13:00:00Z',
        updated_at: '2026-05-28T13:06:00Z',
    },
    {
        id: 5,
        status: 'completed',
        conclusion: 'success',
        head_branch: 'main',
        created_at: '2026-05-28T14:00:00Z',
        run_started_at: '2026-05-28T14:00:00Z',
        updated_at: '2026-05-28T14:03:30Z',
    },
];

const sampleJobs: PipelineJobExtended[][] = [
    /* run 1 — all pass */
    [
        { id: 101, name: 'lint', status: 'success' },
        { id: 102, name: 'test', status: 'success' },
        { id: 103, name: 'build', status: 'success' },
    ],
    /* run 2 — all pass */
    [
        { id: 201, name: 'lint', status: 'success' },
        { id: 202, name: 'test', status: 'success' },
    ],
    /* run 3 — lint fails */
    [
        { id: 301, name: 'lint', status: 'failure' },
        { id: 302, name: 'test', status: 'success' },
    ],
    /* run 4 — test fails */
    [
        { id: 401, name: 'lint', status: 'success' },
        { id: 402, name: 'test', status: 'failure' },
        { id: 403, name: 'build', status: 'failure' },
    ],
    /* run 5 — all pass */
    [
        { id: 501, name: 'lint', status: 'success' },
        { id: 502, name: 'test', status: 'success' },
    ],
];

const sampleErrors: string[][] = [
    [] /* run 1 — no errors */,
    [] /* run 2 — no errors */,
    ["Module not found: 'foo'", 'SyntaxError: Unexpected token'] /* run 3 — lint */,
    ['Timeout: page did not load', 'Cannot connect to Docker daemon'] /* run 4 — test + build */,
    [] /* run 5 — no errors */,
];

const sampleIssues: Array<{ labels: string[]; updated_at: string; created_at: string }> = [
    { labels: ['bug', 'frontend'], updated_at: '2026-05-20T10:00:00Z', created_at: '2026-05-01T10:00:00Z' },
    { labels: ['enhancement'], updated_at: '2026-04-01T10:00:00Z', created_at: '2026-03-01T10:00:00Z' },
    { labels: ['bug'], updated_at: '2026-05-25T10:00:00Z', created_at: '2026-05-10T10:00:00Z' },
];

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
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

describe('AggregatePipelineHealth', () => {
    const now = new Date('2026-05-29T00:00:00Z');
    const health = aggregatePipelineHealth(sampleRuns, sampleJobs, sampleErrors, sampleIssues, now);

    it('computes pass rate correctly', () => {
        expect(health.totalRuns).toBe(5);
        expect(health.passedRuns).toBe(3);
        expect(health.failedRuns).toBe(2);
        expect(health.passRate).toBe(60);
    });

    it('computes average duration', () => {
        expect(health.avgDurationSec).toBeGreaterThan(0);
    });

    it('identifies top failing jobs', () => {
        expect(health.topFailingJobs.length).toBeGreaterThanOrEqual(2);

        const lint = health.topFailingJobs.find((j) => j.name === 'lint');

        expect(lint).toBeDefined();
        expect(nonNull(lint).failCount).toBe(1);
        expect(nonNull(lint).totalCount).toBe(5);

        /* test appears in 4 runs (not in run3) */
        const test = health.topFailingJobs.find((j) => j.name === 'test');

        expect(test).toBeDefined();
    });

    it('aggregates failure reasons', () => {
        expect(health.failureReasons.length).toBeGreaterThanOrEqual(3);

        const moduleNotFound = health.failureReasons.find((r) => r.message.includes('Module not found'));

        expect(moduleNotFound).toBeDefined();
        expect(nonNull(moduleNotFound).count).toBe(1);
    });

    it('breaks down by branch', () => {
        const main = health.branchBreakdown.find((b) => b.branch === 'main');

        expect(main).toBeDefined();
        expect(nonNull(main).count).toBe(4);
        expect(nonNull(main).passRate).toBe(75);

        const develop = health.branchBreakdown.find((b) => b.branch === 'develop');

        expect(develop).toBeDefined();
        expect(nonNull(develop).count).toBe(1);
        expect(nonNull(develop).passRate).toBe(0);
    });

    it('counts open issues by label', () => {
        expect(health.openIssues.total).toBe(3);
        expect(health.openIssues.byLabel['bug']).toBe(2);
        expect(health.openIssues.byLabel['frontend']).toBe(1);
    });

    it('detects stale issues (30d+ no update)', () => {
        expect(health.openIssues.staleCount).toBe(1);
    });

    it('returns zero pass rate for empty runs', () => {
        const empty = aggregatePipelineHealth([], [], [], [], now);

        expect(empty.totalRuns).toBe(0);
        expect(empty.passRate).toBe(0);
    });

    it('handles runs without duration data', () => {
        const noDurationRuns: PipelineRunExtended[] = [
            { id: 1, status: 'completed', conclusion: 'success', head_branch: 'main' },
        ];
        const h = aggregatePipelineHealth(noDurationRuns, [[]], [], [], now);

        expect(h.avgDurationSec).toBe(0);
        expect(h.passRate).toBe(100);
    });
});

describe('RenderPipelineHealthHtml', () => {
    const now = new Date('2026-05-29T00:00:00Z');
    const health = aggregatePipelineHealth(sampleRuns, sampleJobs, sampleErrors, sampleIssues, now);
    const html = renderPipelineHealthHtml(health, 'Test Report');

    it('contains title', () => {
        expect(html).toContain('Test Report');
    });

    it('contains summary cards', () => {
        expect(html).toContain('Total Runs');
        expect(html).toContain('Passed');
        expect(html).toContain('Failed');
        expect(html).toContain('Pass Rate');
        expect(html).toContain('Avg Duration');
    });

    it('contains top failing jobs table', () => {
        expect(html).toContain('Top Failing Jobs');
        expect(html).toContain('lint');
        expect(html).toContain('test');
    });

    it('contains failure intelligence section', () => {
        expect(html).toContain('Failure Intelligence');
        expect(html).toContain('Module not found');
    });

    it('contains branch breakdown', () => {
        expect(html).toContain('Branch Breakdown');
        expect(html).toContain('main');
    });

    it('contains open issues section', () => {
        expect(html).toContain('Open Issues');
        expect(html).toContain('bug');
    });

    it('is valid HTML document', () => {
        expect(html).toMatch(/^<!DOCTYPE html>/);
        expect(html).toContain('</html>');
    });

    it('uses buildCss design tokens', () => {
        expect(html).toContain('--color-surface-page');
        expect(html).toContain('--color-text-primary');
        expect(html).toContain('--color-text-muted');
    });

    it('includes theme toggle script', () => {
        expect(html).toContain('qa-report-theme');
        expect(html).toContain('prefers-color-scheme');
    });

    it('includes dark mode CSS', () => {
        expect(html).toContain('html.dark');
    });

    it('includes footer', () => {
        expect(html).toContain('Pipeline Health Dashboard');
    });

    it('uses design-token CSS variables for card borders', () => {
        expect(html).toContain('var(--color-surface-card)');
        expect(html).toContain('var(--color-border-default)');
    });

    it('uses TABLE_CSS without legacy border="1" / cellpadding', () => {
        expect(html).not.toContain('border="1"');
        expect(html).not.toContain('cellpadding="6"');
        expect(html).not.toContain('background:#f3f4f6');
    });

    it('renders empty state gracefully', () => {
        const emptyHtml = renderPipelineHealthHtml(aggregatePipelineHealth([], [], [], [], now), 'Empty Report');

        expect(emptyHtml).toContain('Empty Report');
        expect(emptyHtml).toContain('0');
    });
});
