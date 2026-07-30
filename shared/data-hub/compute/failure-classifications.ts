/**
 * Failure Classifications — compute module.
 *
 * Produces failure category mapping (test title → category) from metrics runs.
 * This is the SSOT for failure categorization — renderers consume
 * dataHub.computed.failureClassifications instead of computing locally.
 *
 * @module compute/failure-classifications
 */

import type { MetricsRun } from '../../types/data-hub.js';
import { rootLogger } from '../../logger.js';

/**
 * Classify failures by test title from metrics runs.
 *
 * @param metricsRuns - Array of MetricsRun from the hub
 * @returns Record mapping test title to failure category
 */
function classifyError(upper: string): string {
    if (/TIMEOUT|TIMED OUT|30S|60S/.test(upper)) return 'TIMEOUT';
    if (/ASSERT|EXPECTED|GOT |ACTUAL|TO BE /.test(upper)) return 'ASSERTION';
    if (/CONNECT|DATABASE|NETWORK|REFUSED|ECONNREFUSED/.test(upper)) return 'ENVIRONMENT';
    if (/NULL|UNDEFINED|CANNOT READ|TYPEERROR|REFERENCEERROR/.test(upper)) return 'APPLICATION';
    if (/FLAKY|INTERMITTENT|RETRY/.test(upper)) return 'FLAKY';
    return 'UNKNOWN';
}

export function computeFailureClassifications(metricsRuns: MetricsRun[]): Record<string, string> {
    try {
        const classifications: Record<string, string> = {};
        for (const run of metricsRuns) {
            for (const test of run.tests) {
                if (test.state !== 'failed' || !test.error) continue;
                if (classifications[test.title]) continue;
                classifications[test.title] = classifyError(test.error.toUpperCase());
            }
        }
        return classifications;
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        rootLogger.error(
            'Failed to compute failure classifications. Verify that metrics run data is valid. Details: ' + msg,
        );
        return {};
    }
}
