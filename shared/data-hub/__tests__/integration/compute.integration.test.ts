/**
 * Integration test: Compute layer.
 *
 * Verifies that compute functions work together in a realistic pipeline analysis flow.
 * Tests the full pipeline: raw data → compute functions → coherent results.
 */
import { describe, it, expect } from 'vitest';
import type { PipelineRun, PipelineJob } from '../../../types/ci-cd.js';
import type { MetricsRun } from '../../../metrics.js';
import { calcPipelinePassRate, calcPipelineFailRate } from '../../compute/pass-rate.js';
import { calcAvgDuration } from '../../compute/avg-duration.js';
import { calcSuiteSpeedP95 } from '../../compute/suite-speed.js';
import { calcFlakyFromPipelineRuns, calcFlakyPercentage } from '../../compute/flaky-rate.js';
import { calcBranchBreakdown, calcTopFailingJobs } from '../../compute/branch-health.js';
import { calcCoverageFromRaw } from '../../compute/coverage.js';
import { calcTrendsFromPipelineRuns, calcTrendsFromMetricsRuns } from '../../compute/trends.js';
import { scorePassRate, scoreFlakyRate, computeGrade } from '../../compute/scoring.js';
import { calcReleaseScore, makeDimensionScore } from '../../compute/release-score.js';
import { calcQuarantineStatus } from '../../compute/quarantine-status.js';
import type { HealthDimensions } from '../../../types/data-hub.js';

describe('Compute Layer Integration', () => {
    const runs: PipelineRun[] = [
        {
            id: 1,
            head_branch: 'main',
            conclusion: 'success',
            created_at: '2026-07-01T10:00:00Z',
            run_started_at: '2026-07-01T10:00:00Z',
            updated_at: '2026-07-01T10:05:00Z',
        },
        {
            id: 2,
            head_branch: 'main',
            conclusion: 'failure',
            created_at: '2026-07-02T10:00:00Z',
            run_started_at: '2026-07-02T10:00:00Z',
            updated_at: '2026-07-02T10:10:00Z',
        },
        {
            id: 3,
            head_branch: 'feature',
            conclusion: 'success',
            created_at: '2026-07-03T10:00:00Z',
            run_started_at: '2026-07-03T10:00:00Z',
            updated_at: '2026-07-03T10:03:00Z',
        },
        {
            id: 4,
            head_branch: 'main',
            conclusion: 'success',
            created_at: '2026-07-04T10:00:00Z',
            run_started_at: '2026-07-04T10:00:00Z',
            updated_at: '2026-07-04T10:04:00Z',
        },
        {
            id: 5,
            head_branch: 'main',
            conclusion: 'failure',
            created_at: '2026-07-05T10:00:00Z',
            run_started_at: '2026-07-05T10:00:00Z',
            updated_at: '2026-07-05T10:08:00Z',
        },
    ];

    const jobsMap = new Map<number, PipelineJob[]>([
        [
            1,
            [
                { id: 101, name: 'test', stage: 'test', status: 'success' },
                { id: 102, name: 'lint', stage: 'test', status: 'success' },
            ],
        ],
        [
            2,
            [
                { id: 201, name: 'test', stage: 'test', status: 'failure' },
                { id: 202, name: 'lint', stage: 'test', status: 'success' },
            ],
        ],
        [3, [{ id: 301, name: 'test', stage: 'test', status: 'success' }]],
        [
            4,
            [
                { id: 401, name: 'test', stage: 'test', status: 'success' },
                { id: 402, name: 'lint', stage: 'test', status: 'failure' },
            ],
        ],
        [
            5,
            [
                { id: 501, name: 'test', stage: 'test', status: 'failure' },
                { id: 502, name: 'lint', stage: 'test', status: 'success' },
            ],
        ],
    ]);

    const metricsRuns: MetricsRun[] = [
        {
            timestamp: '2026-07-01',
            project: 'test',
            total: 100,
            passed: 90,
            failed: 5,
            skipped: 5,
            duration: 120,
            tests: [],
        },
        {
            timestamp: '2026-07-02',
            project: 'test',
            total: 100,
            passed: 85,
            failed: 10,
            skipped: 5,
            duration: 150,
            tests: [],
        },
        {
            timestamp: '2026-07-03',
            project: 'test',
            total: 100,
            passed: 95,
            failed: 3,
            skipped: 2,
            duration: 100,
            tests: [],
        },
    ];

    it('pipeline pass rate and fail rate are consistent', () => {
        expect.hasAssertions();

        const passRate = calcPipelinePassRate(runs);
        const failRate = calcPipelineFailRate(runs);

        expect(Math.round((passRate + failRate) * 100) / 100).toBe(100);
        expect(passRate).toBe(60);
    });

    it('average duration is within reasonable bounds', () => {
        expect.hasAssertions();

        const avgDuration = calcAvgDuration(runs);

        expect(avgDuration).toBeGreaterThan(0);
        expect(avgDuration).toBeLessThanOrEqual(86400);
    });

    it('suite speed P95 is computed from jobs', () => {
        expect.hasAssertions();

        const p95 = calcSuiteSpeedP95(jobsMap);

        expect(p95).toBeGreaterThanOrEqual(0);
    });

    it('flaky jobs are detected with consistent rates', () => {
        expect.hasAssertions();

        const flaky = calcFlakyFromPipelineRuns(runs, jobsMap);
        const percentage = calcFlakyPercentage(flaky, 5);

        expect(percentage).toBeGreaterThanOrEqual(0);
        expect(percentage).toBeLessThanOrEqual(100);
    });

    it('branch breakdown shows per-branch health', () => {
        expect.hasAssertions();

        const breakdown = calcBranchBreakdown(runs);

        expect(breakdown['main']).toBeDefined();
        expect(breakdown['main']?.passRate).toBeGreaterThanOrEqual(0);
        expect(breakdown['main']?.passRate).toBeLessThanOrEqual(100);
    });

    it('top failing jobs are ranked by failure rate', () => {
        expect.hasAssertions();

        const topJobs = calcTopFailingJobs(runs, jobsMap);

        expect(topJobs.length).toBeGreaterThan(0);

        for (let i = 1; i < topJobs.length; i++) {
            const prev = topJobs[i - 1] as { failureRate: number };
            const curr = topJobs[i] as { failureRate: number };

            expect(prev.failureRate).toBeGreaterThanOrEqual(curr.failureRate);
        }
    });

    it('coverage is normalized to 0-100', () => {
        expect.hasAssertions();

        const coverage = calcCoverageFromRaw({ total: 75, covered: 75, percentage: 75 });

        expect(coverage.total).toBeGreaterThanOrEqual(0);
        expect(coverage.total).toBeLessThanOrEqual(100);
    });

    it('trends from pipeline runs are within bounds', () => {
        expect.hasAssertions();

        const trends = calcTrendsFromPipelineRuns(runs, 10);

        expect(trends.length).toBeLessThanOrEqual(10);

        for (const point of trends) {
            expect(point.passRate).toBeGreaterThanOrEqual(0);
            expect(point.passRate).toBeLessThanOrEqual(100);
        }
    });

    it('trends from metrics runs are within bounds', () => {
        expect.hasAssertions();

        const trends = calcTrendsFromMetricsRuns(metricsRuns, 10);

        expect(trends.length).toBeLessThanOrEqual(10);

        for (const point of trends) {
            expect(point.passRate).toBeGreaterThanOrEqual(0);
            expect(point.passRate).toBeLessThanOrEqual(100);
        }
    });

    it('scoring functions produce valid scores', () => {
        expect.hasAssertions();

        const passScore = scorePassRate(85);
        const flakyScore = scoreFlakyRate(2);

        expect(passScore).toBeGreaterThanOrEqual(0);
        expect(passScore).toBeLessThanOrEqual(100);
        expect(flakyScore).toBeGreaterThanOrEqual(0);
        expect(flakyScore).toBeLessThanOrEqual(100);
    });

    it('release score aggregates dimensions correctly', () => {
        expect.hasAssertions();

        const dimensions: HealthDimensions = {
            passRate: makeDimensionScore(85, 80),
            flakyRate: makeDimensionScore(90, 80),
            coverage: makeDimensionScore(75, 80),
            suiteSpeed: makeDimensionScore(80, 80),
            executionRate: makeDimensionScore(85, 80),
        };
        const releaseScore = calcReleaseScore(dimensions);

        expect(releaseScore.score).toBeGreaterThanOrEqual(0);
        expect(releaseScore.score).toBeLessThanOrEqual(100);
        expect(releaseScore.grade).toBeDefined();
    });

    it('quarantine status identifies tests needing quarantine', () => {
        expect.hasAssertions();

        const flakyResults = [
            { title: 'flaky-test', rate: 50, runs: 10 },
            { title: 'mild-flaky', rate: 10, runs: 10 },
        ];
        const status = calcQuarantineStatus(flakyResults, { minRuns: 3, quarantineThreshold: 30 });

        expect(status.flakyCount).toBe(2);
        expect(status.quarantinedCount).toBe(1);
    });

    it('grade assignment is consistent', () => {
        expect.hasAssertions();
        expect(computeGrade(95)).toBe('excellent');
        expect(computeGrade(85)).toBe('good');
        expect(computeGrade(75)).toBe('needs_attention');
        expect(computeGrade(65)).toBe('poor');
        expect(computeGrade(50)).toBe('critical');
    });
});
