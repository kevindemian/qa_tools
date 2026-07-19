/**
 * Unit tests for Phase 22 Foundation — new compute functions and persistence.
 *
 * Tests execution-rate, flaky-percentage, per-run-costs, metrics-runs,
 * flakiness-entries, metrics-trends, and persistence adapter.
 */
import { describe, it, expect } from 'vitest';
import { calcExecutionRate } from '../../compute/execution-rate.js';
import { calcFlakyPercentage } from '../../compute/flaky-percentage.js';
import { calcPerRunCosts } from '../../compute/per-run-costs.js';
import { convertToMetricsRuns } from '../../compute/metrics-runs.js';
import { calcFlakinessEntries } from '../../compute/flakiness-entries.js';
import { calcMetricsTrends } from '../../compute/metrics-trends.js';
import type { PipelineRun, PipelineJob } from '../../../types/ci-cd.js';
import type { ArtifactParseResult } from '../../artifact-parser.js';
import type { MetricsRun, FlakyResult } from '../../../types/data-hub.js';

/* ── Helpers ────────────────────────────────────────────────────────────── */

function makeRun(overrides?: Partial<PipelineRun>): PipelineRun {
    return {
        id: 1,
        conclusion: 'success',
        created_at: '2026-01-01T10:00:00Z',
        updated_at: '2026-01-01T10:10:00Z',
        head_branch: 'main',
        ...overrides,
    };
}

function makeArtifact(overrides?: Partial<ArtifactParseResult>): ArtifactParseResult {
    return {
        fileName: 'test-results.json',
        data: {
            tests: [
                { title: 'test A', state: 'passed', duration: 100 },
                { title: 'test B', state: 'failed', duration: 200, error: 'fail' },
            ],
            stats: {
                passed: 1,
                failed: 1,
                skipped: 0,
                total: 2,
                duration: 300,
            },
        },
        format: 'ctrf',
        ...overrides,
    };
}

function makeMetricsRun(overrides?: Partial<MetricsRun>): MetricsRun {
    return {
        timestamp: '2026-01-01T10:00:00Z',
        project: '',
        total: 10,
        passed: 8,
        failed: 2,
        skipped: 0,
        duration: 1000,
        tests: [],
        ...overrides,
    };
}

/* ── CalcExecutionRate ──────────────────────────────────────────────────── */

describe('CalcExecutionRate', () => {
    it('returns 100 when all runs completed', () => {
        expect.hasAssertions();

        const runs = [makeRun({ conclusion: 'success' }), makeRun({ conclusion: 'failure' })];

        expect(calcExecutionRate(runs)).toBe(100);
    });

    it('returns 0 when all runs cancelled', () => {
        expect.hasAssertions();

        const runs = [makeRun({ conclusion: 'cancelled' }), makeRun({ conclusion: 'cancelled' })];

        expect(calcExecutionRate(runs)).toBe(0);
    });

    it('returns 50 when half cancelled', () => {
        expect.hasAssertions();

        const runs = [makeRun({ conclusion: 'success' }), makeRun({ conclusion: 'cancelled' })];

        expect(calcExecutionRate(runs)).toBe(50);
    });

    it('returns 0 for empty runs', () => {
        expect.hasAssertions();

        expect(calcExecutionRate([])).toBe(0);
    });

    it('ignores runs without conclusion', () => {
        expect.hasAssertions();

        const runs = [makeRun({ conclusion: 'success' }), makeRun()];

        expect(calcExecutionRate(runs)).toBe(100);
    });
});

/* ── CalcFlakyPercentage ────────────────────────────────────────────────── */

describe('CalcFlakyPercentage', () => {
    it('returns 0 for empty runs', () => {
        expect.hasAssertions();

        const flakyRate: FlakyResult[] = [{ title: 'flaky', rate: 50, runs: 5 }];

        expect(calcFlakyPercentage(flakyRate, [], new Map())).toBe(0);
    });

    it('returns 0 for empty flakyRate', () => {
        expect.hasAssertions();

        const runs = [makeRun()];

        expect(calcFlakyPercentage([], runs, new Map())).toBe(0);
    });

    it('calculates percentage correctly', () => {
        expect.hasAssertions();

        const jobs = new Map<number, PipelineJob[]>([
            [
                1,
                [
                    { id: 1, name: 'job-a', stage: 'test', status: 'success' },
                    { id: 2, name: 'job-b', stage: 'test', status: 'success' },
                ],
            ],
        ]);
        const runs = [makeRun()];
        const flakyRate: FlakyResult[] = [{ title: 'job-a', rate: 50, runs: 5 }];

        expect(calcFlakyPercentage(flakyRate, runs, jobs)).toBe(50);
    });
});

/* ── CalcPerRunCosts ────────────────────────────────────────────────────── */

describe('CalcPerRunCosts', () => {
    it('calculates cost for runs with timestamps', () => {
        expect.hasAssertions();

        const runs = [
            makeRun({
                id: 1,
                created_at: '2026-01-01T10:00:00Z',
                updated_at: '2026-01-01T10:10:00Z',
            }),
        ];
        const costs = calcPerRunCosts(runs, 0.008);

        expect(costs).toHaveLength(1);

        const cost = costs[0];

        expect(cost).toBeDefined();
        expect(cost?.minutes).toBeCloseTo(10, 0);
        expect(cost?.cost).toBeCloseTo(0.08, 2);
        expect(cost?.runId).toBe(1);
        expect(cost?.branch).toBe('main');
    });

    it('filters runs without timestamps', () => {
        expect.hasAssertions();

        const run = makeRun({ id: 1 });
        delete run.created_at;
        delete run.updated_at;
        const runs = [run];

        expect(calcPerRunCosts(runs)).toHaveLength(0);
    });

    it('returns empty for empty runs', () => {
        expect.hasAssertions();

        expect(calcPerRunCosts([])).toHaveLength(0);
    });

    it('aGGRESIVE: negative/NaN costPerMinute does not fabricate negative/NaN cost (§24)', () => {
        expect.hasAssertions();

        const runs = [makeRun({ id: 1, created_at: '2026-01-01T10:00:00Z', updated_at: '2026-01-01T10:10:00Z' })];

        const neg = calcPerRunCosts(runs, -5);

        expect(neg[0]?.cost).toBe(0);
        expect(Number.isNaN(neg[0]?.cost)).toBeFalsy();

        const nan = calcPerRunCosts(runs, NaN);

        expect(nan[0]?.cost).toBe(0);
    });

    it('aGGRESIVE: invalid dates yield 0 minutes, not NaN (§25)', () => {
        expect.hasAssertions();

        const runs = [makeRun({ id: 1, created_at: 'not-a-date', updated_at: 'also-bad' })];

        const costs = calcPerRunCosts(runs, 0.008);

        expect(costs).toHaveLength(1);
        expect(Number.isNaN(costs[0]?.minutes)).toBeFalsy();
        expect(costs[0]?.minutes).toBe(0);
    });
});

/* ── ConvertToMetricsRuns ───────────────────────────────────────────────── */

describe('ConvertToMetricsRuns', () => {
    it('converts parsedArtifacts to MetricsRun[]', () => {
        expect.hasAssertions();

        const artifacts = new Map<number, ArtifactParseResult[]>([[1, [makeArtifact()]]]);
        const runs = convertToMetricsRuns(artifacts);

        expect(runs).toHaveLength(1);

        const run = runs[0];

        expect(run).toBeDefined();
        expect(run?.passed).toBe(1);
        expect(run?.failed).toBe(1);
        expect(run?.total).toBe(2);
        expect(run?.duration).toBe(300);
        expect(run?.tests).toHaveLength(2);
    });

    it('aggregates multiple artifacts per run', () => {
        expect.hasAssertions();

        const artifact1 = makeArtifact({
            data: {
                tests: [{ title: 'test1', state: 'passed', duration: 100 }],
                stats: { passed: 1, failed: 0, skipped: 0, total: 1, duration: 100 },
            },
        });
        const artifact2 = makeArtifact({
            data: {
                tests: [{ title: 'test2', state: 'failed', duration: 200, error: 'fail' }],
                stats: { passed: 0, failed: 1, skipped: 0, total: 1, duration: 200 },
            },
        });
        const artifacts = new Map<number, ArtifactParseResult[]>([[1, [artifact1, artifact2]]]);
        const runs = convertToMetricsRuns(artifacts);
        const run = runs[0];

        expect(run).toBeDefined();
        expect(run?.passed).toBe(1);
        expect(run?.failed).toBe(1);
        expect(run?.total).toBe(2);
        expect(run?.duration).toBe(300);
    });

    it('returns empty for empty artifacts', () => {
        expect.hasAssertions();

        expect(convertToMetricsRuns(new Map())).toHaveLength(0);
    });
});

/* ── CalcFlakinessEntries ───────────────────────────────────────────────── */

describe('CalcFlakinessEntries', () => {
    it('detects flaky tests (passed and failed)', () => {
        expect.hasAssertions();

        const runs: MetricsRun[] = [
            makeMetricsRun({
                timestamp: '2026-01-01T10:00:00Z',
                total: 1,
                passed: 1,
                failed: 0,
                tests: [{ title: 'flaky-test', state: 'passed', duration: 100 }],
            }),
            makeMetricsRun({
                timestamp: '2026-01-02T10:00:00Z',
                total: 1,
                passed: 0,
                failed: 1,
                tests: [{ title: 'flaky-test', state: 'failed', duration: 100, error: 'fail' }],
            }),
        ];
        const entries = calcFlakinessEntries(runs, 2);

        expect(entries).toHaveLength(1);

        const entry = entries[0];

        expect(entry).toBeDefined();
        expect(entry?.title).toBe('flaky-test');
        expect(entry?.rate).toBe(0.5);
    });

    it('ignores tests with less than minRuns', () => {
        expect.hasAssertions();

        const runs: MetricsRun[] = [
            makeMetricsRun({
                timestamp: '2026-01-01T10:00:00Z',
                total: 1,
                passed: 1,
                failed: 0,
                tests: [{ title: 'test', state: 'passed', duration: 100 }],
            }),
        ];

        expect(calcFlakinessEntries(runs, 2)).toHaveLength(0);
    });

    it('returns empty for empty runs', () => {
        expect.hasAssertions();

        expect(calcFlakinessEntries([])).toHaveLength(0);
    });
});

/* ── CalcMetricsTrends ──────────────────────────────────────────────────── */

describe('CalcMetricsTrends', () => {
    it('returns trend points from runs', () => {
        expect.hasAssertions();

        const runs: MetricsRun[] = [
            makeMetricsRun({
                timestamp: '2026-01-01T10:00:00Z',
                total: 10,
                passed: 8,
                failed: 2,
                tests: [],
            }),
        ];
        const trends = calcMetricsTrends(runs);

        expect(trends).toHaveLength(1);

        const trend = trends[0];

        expect(trend).toBeDefined();
        expect(trend?.label).toBe('2026-01-01');
        expect(trend?.passRate).toBeCloseTo(80, 0);
        expect(trend?.total).toBe(10);
        expect(trend?.failed).toBe(2);
    });

    it('respects window parameter', () => {
        expect.hasAssertions();

        const runs: MetricsRun[] = Array.from({ length: 20 }, (_, i) =>
            makeMetricsRun({
                timestamp: `2026-01-${String(i + 1).padStart(2, '0')}T10:00:00Z`,
            }),
        );
        const trends = calcMetricsTrends(runs, 5);

        expect(trends).toHaveLength(5);
    });

    it('returns empty for empty runs', () => {
        expect.hasAssertions();

        expect(calcMetricsTrends([])).toHaveLength(0);
    });
});
