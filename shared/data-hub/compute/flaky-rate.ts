/**
 * Compute: Flaky Rate.
 *
 * Consolidates flaky test/job detection from:
 * - ci-data.ts:403-457 (CI-level flaky job detection)
 * - metrics.ts:188-233 (MetricsRun-level flaky test detection)
 * - health-score.ts:125-136 (flaky rate calculation)
 *
 * @reference DORA — flaky tests erode confidence in test results
 */
import type { PipelineRun, PipelineJob } from '../../types/ci-cd.js';
import type { MetricsRun } from '../../metrics.js';
import type { FlakyResult } from '../../types/data-hub.js';
import type { QuarantineConfig } from './types.js';
import { DEFAULT_QUARANTINE_CONFIG } from './types.js';

/**
 * Detect flaky jobs from CI PipelineRuns by analyzing status variations
 * across runs for each job name.
 *
 * A job is flaky if it appears with both 'success' and non-success status
 * across different pipeline runs.
 *
 * @returns FlakyResult[] sorted by rate descending.
 */
export function calcFlakyFromPipelineRuns(runs: PipelineRun[], jobsMap: Map<number, PipelineJob[]>): FlakyResult[] {
    const jobHistory = buildJobHistory(runs, jobsMap);
    return detectFlakyFromHistory(jobHistory);
}

function buildJobHistory(runs: PipelineRun[], jobsMap: Map<number, PipelineJob[]>): Map<string, Map<number, string>> {
    const jobHistory = new Map<string, Map<number, string>>();

    for (const run of runs) {
        const runId = run.id;
        if (runId == null) continue;
        const runIdNum = typeof runId === 'string' ? parseInt(runId, 10) : runId;
        const jobs = jobsMap.get(runIdNum);
        if (!jobs) continue;

        for (const job of jobs) {
            if (!jobHistory.has(job.name)) {
                jobHistory.set(job.name, new Map());
            }
            const history = jobHistory.get(job.name) ?? new Map<number, string>();
            history.set(runIdNum, job.status);
            jobHistory.set(job.name, history);
        }
    }

    return jobHistory;
}

function detectFlakyFromHistory(jobHistory: Map<string, Map<number, string>>): FlakyResult[] {
    const result: FlakyResult[] = [];
    for (const [name, statusByRun] of jobHistory) {
        const statuses = Array.from(statusByRun.values());
        if (statuses.length < 2) continue;
        if (isFlaky(statuses)) {
            result.push(makeFlakyResult(name, statuses));
        }
    }

    result.sort((a, b) => b.rate - a.rate);
    return result;
}

function isFlaky(statuses: string[]): boolean {
    const hasSuccess = statuses.includes('success');
    const hasFailure = statuses.some((s) => s !== 'success');
    return hasSuccess && hasFailure;
}

function makeFlakyResult(name: string, statuses: string[]): FlakyResult {
    const failCount = statuses.filter((s) => s !== 'success').length;
    return {
        title: name,
        rate: Math.round((failCount / statuses.length) * 100 * 100) / 100,
        runs: statuses.length,
    };
}

/**
 * Detect flaky tests from MetricsRun[] by analyzing pass/fail patterns
 * across runs for each test title.
 *
 * A test is flaky if it has both passes and failures across runs,
 * with at least `config.minRuns` executions.
 *
 * @returns FlakyResult[] sorted by rate descending.
 */
export function calcFlakyFromMetricsRuns(
    runs: MetricsRun[],
    config: QuarantineConfig = DEFAULT_QUARANTINE_CONFIG,
): FlakyResult[] {
    const testMap = buildTestMapFromMetrics(runs);
    return detectFlakyFromTestMap(testMap, config);
}

function buildTestMapFromMetrics(runs: MetricsRun[]): Map<string, { pass: number; fail: number }> {
    const testMap = new Map<string, { pass: number; fail: number }>();

    for (const run of runs) {
        for (const t of run.tests) {
            updateTestCounts(testMap, t);
        }
    }

    return testMap;
}

function updateTestCounts(
    testMap: Map<string, { pass: number; fail: number }>,
    t: { title: string; state: string },
): void {
    if (t.state === 'skipped') return;
    if (!testMap.has(t.title)) {
        testMap.set(t.title, { pass: 0, fail: 0 });
    }
    const entry = testMap.get(t.title);
    if (entry == null) return;
    if (t.state === 'passed') entry.pass++;
    else if (t.state === 'failed') entry.fail++;
}

function detectFlakyFromTestMap(
    testMap: Map<string, { pass: number; fail: number }>,
    config: QuarantineConfig,
): FlakyResult[] {
    const result: FlakyResult[] = [];
    for (const [title, counts] of testMap) {
        const totalRuns = counts.pass + counts.fail;
        if (totalRuns < config.minRuns) continue;
        if (counts.fail > 0 && counts.pass > 0) {
            result.push({
                title,
                rate: Math.round((counts.fail / totalRuns) * 100 * 100) / 100,
                runs: totalRuns,
            });
        }
    }

    result.sort((a, b) => b.rate - a.rate);
    return result;
}

/**
 * Calculate the percentage of flaky items among all qualifying items.
 *
 * @param flakyResults - Array of detected flaky results.
 * @param totalQualifyingItems - Total number of items that met the minimum run threshold.
 * @returns Percentage (0-100), or 0 if no qualifying items.
 */
export function calcFlakyPercentage(flakyResults: FlakyResult[], totalQualifyingItems: number): number {
    if (totalQualifyingItems === 0) return 0;
    const raw = (flakyResults.length / totalQualifyingItems) * 100;
    return Math.min(100, Math.round(raw * 100) / 100);
}
