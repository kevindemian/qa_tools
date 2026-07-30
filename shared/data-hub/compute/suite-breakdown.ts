/**
 * Suite Breakdown — compute module.
 *
 * Produces per-suite aggregation (passed/failed/skipped/duration) from parsed artifact data.
 * This is the SSOT for suite-level statistics — renderers consume
 * dataHub.computed.suiteBreakdown instead of computing locally.
 *
 * @module compute/suite-breakdown
 */

import type { SuiteBreakdown } from '../../types/data-hub.js';
import type { MetricsRun } from '../../types/data-hub.js';
import { rootLogger } from '../../logger.js';

/**
 * Aggregate test results by suite from metrics runs.
 *
 * @param metricsRuns - Array of MetricsRun from the hub
 * @returns Array of SuiteBreakdown with per-suite statistics
 */
function getOrCreateSuite(suiteMap: Map<string, SuiteBreakdown>, suite: string): SuiteBreakdown {
    let agg = suiteMap.get(suite);
    if (!agg) {
        agg = { suite, passed: 0, failed: 0, skipped: 0, totalDuration: 0, tests: [] };
        suiteMap.set(suite, agg);
    }
    return agg;
}

function accumulateTest(agg: SuiteBreakdown, test: MetricsRun['tests'][number]): void {
    if (test.state === 'passed') agg.passed++;
    else if (test.state === 'failed') agg.failed++;
    else agg.skipped++;
    const safeDuration = Number.isFinite(test.duration) && test.duration >= 0 ? test.duration : 0;
    if (!Number.isFinite(test.duration)) {
        rootLogger.warn('suite-breakdown: non-finite test.duration treated as 0', {
            operation: 'computeSuiteBreakdown',
            title: test.title,
            value: test.duration,
            remediation: 'Duration replaced with 0 to prevent NaN propagation.',
        });
    }
    agg.totalDuration += safeDuration;
    agg.tests.push({
        title: test.title,
        state: test.state,
        duration: safeDuration,
        ...(test.fullTitle ? { fullTitle: test.fullTitle } : {}),
    });
}

export function computeSuiteBreakdown(metricsRuns: MetricsRun[]): SuiteBreakdown[] {
    try {
        const suiteMap = new Map<string, SuiteBreakdown>();
        for (const run of metricsRuns) {
            for (const test of run.tests) {
                const suite = extractSuiteFromTitle(test.title) || '(root)';
                accumulateTest(getOrCreateSuite(suiteMap, suite), test);
            }
        }
        return Array.from(suiteMap.values());
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        rootLogger.error('Failed to compute suite breakdown. Verify that metrics run data is valid. Details: ' + msg);
        return [];
    }
}

/**
 * Extract suite name from test title (e.g., "Suite > Test" → "Suite").
 */
function extractSuiteFromTitle(title: string): string {
    const parts = title.split(' > ');
    return parts.length > 1 ? parts.slice(0, -1).join(' > ') : '';
}
