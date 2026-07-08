/**
 * Compute: Flakiness Entries.
 *
 * Identifies flaky tests by analyzing pass/fail patterns across runs.
 * Equivalent to calculateFlakiness in metrics.ts, but accepts MetricsRun[].
 * Used by flakiness-dashboard.ts, failure-analysis.ts, and quality-gate.ts.
 */
import type { FlakinessEntry, MetricsRun } from '../../types/data-hub.js';

/**
 * Calculate flakiness entries from metrics runs.
 *
 * A test is considered flaky if it has both passed and failed across different runs.
 *
 * @param runs - Metrics runs to analyze.
 * @param minRuns - Minimum number of executions to consider (default: 2).
 * @returns Array of flaky entries sorted by flakiness rate (descending).
 */
export function calcFlakinessEntries(runs: MetricsRun[], minRuns = 2): FlakinessEntry[] {
    const testMap = accumulateTestCounts(runs);
    return buildFlakyEntries(testMap, minRuns);
}

function accumulateTestCounts(
    runs: MetricsRun[],
): Map<string, { pass: number; fail: number; skip: number; project: string }> {
    const testMap = new Map<string, { pass: number; fail: number; skip: number; project: string }>();
    for (const run of runs) {
        for (const t of run.tests) {
            const key = `${run.project}::${t.title}`;
            const entry = testMap.get(key) || { pass: 0, fail: 0, skip: 0, project: run.project };
            if (t.state === 'passed') entry.pass++;
            else if (t.state === 'failed') entry.fail++;
            else entry.skip++;
            testMap.set(key, entry);
        }
    }
    return testMap;
}

function buildFlakyEntries(
    testMap: Map<string, { pass: number; fail: number; skip: number; project: string }>,
    minRuns: number,
): FlakinessEntry[] {
    const result: FlakinessEntry[] = [];
    for (const [key, counts] of testMap) {
        const title = key.split('::')[1] ?? key;
        const executedCount = counts.pass + counts.fail;
        if (executedCount < minRuns) continue;
        if (counts.fail > 0 && counts.pass > 0) {
            result.push({
                title,
                project: counts.project,
                passCount: counts.pass,
                failCount: counts.fail,
                skipCount: counts.skip,
                totalRuns: executedCount,
                rate: executedCount > 0 ? counts.fail / executedCount : 0,
            });
        }
    }
    result.sort((a, b) => b.rate - a.rate);
    return result;
}

/**
 * Calculate the flaky test rate as a percentage (0-100).
 *
 * Returns: (number of flaky tests / number of qualifying tests) * 100
 *
 * A "qualifying test" is one that has been executed at least `minRuns` times.
 * A "flaky test" is a qualifying test that has both passed and failed.
 *
 * @param runs - Metrics runs to analyze.
 * @param minRuns - Minimum number of executions to qualify (default: 2).
 * @returns Flaky percentage (0-100). Returns 0 if no qualifying tests.
 */
export function calculateFlakyTestRate(runs: MetricsRun[], minRuns = 2): number {
    const entries = calcFlakinessEntries(runs, minRuns);

    // Count qualifying tests (tests with enough runs)
    const testMap = accumulateTestCounts(runs);
    let qualifyingCount = 0;
    for (const [, counts] of testMap) {
        const executedCount = counts.pass + counts.fail;
        if (executedCount >= minRuns) {
            qualifyingCount++;
        }
    }

    if (qualifyingCount === 0) return 0;
    return (entries.length / qualifyingCount) * 100;
}
