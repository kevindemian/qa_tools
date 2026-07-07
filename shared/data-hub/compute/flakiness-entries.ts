/**
 * Compute: Flakiness Entries.
 *
 * Identifies flaky tests by analyzing pass/fail patterns across runs.
 * Equivalent to calculateFlakiness in metrics.ts, but accepts MetricsRun[].
 * Used by flakiness-dashboard.ts and failure-analysis.ts.
 */
import type { FlakinessEntry } from '../../types/data-hub.js';
import type { MetricsRun } from '../../types/data-hub.js';

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

function accumulateTestCounts(runs: MetricsRun[]): Map<string, { pass: number; fail: number; skip: number }> {
    const testMap = new Map<string, { pass: number; fail: number; skip: number }>();
    for (const run of runs) {
        for (const t of run.tests) {
            const entry = testMap.get(t.title) || { pass: 0, fail: 0, skip: 0 };
            if (t.state === 'passed') entry.pass++;
            else if (t.state === 'failed') entry.fail++;
            else entry.skip++;
            testMap.set(t.title, entry);
        }
    }
    return testMap;
}

function buildFlakyEntries(
    testMap: Map<string, { pass: number; fail: number; skip: number }>,
    minRuns: number,
): FlakinessEntry[] {
    const result: FlakinessEntry[] = [];
    for (const [title, counts] of testMap) {
        const executedCount = counts.pass + counts.fail;
        if (executedCount < minRuns) continue;
        if (counts.fail > 0 && counts.pass > 0) {
            result.push({
                title,
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
