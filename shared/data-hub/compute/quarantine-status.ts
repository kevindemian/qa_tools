/**
 * Compute: Quarantine Status.
 *
 * Calculates quarantine status for flaky tests based on failure rate.
 *
 * @reference Google Testing Blog — flaky test quarantine strategy
 */
import type { FlakyResult, QuarantineStatus } from '../../types/data-hub.js';
import type { QuarantineConfig } from './types.js';
import { DEFAULT_QUARANTINE_CONFIG } from './types.js';
import { rootLogger } from '../../logger.js';

/**
 * Determine quarantine status for flaky tests.
 *
 * A test is recommended for quarantine if its failure rate >= quarantineThreshold.
 *
 * @param flakyResults - Detected flaky results.
 * @param config - Quarantine configuration.
 * @returns QuarantineStatus with counts.
 */
export function calcQuarantineStatus(
    flakyResults: FlakyResult[],
    config: QuarantineConfig = DEFAULT_QUARANTINE_CONFIG,
): QuarantineStatus {
    const quarantinedCount = flakyResults.filter((r) => {
        if (!Number.isFinite(r.rate)) {
            rootLogger.warn('quarantine-status: non-finite flaky rate, test excluded from quarantine check', {
                operation: 'calcQuarantineStatus',
                testName: r.title,
                rate: r.rate,
                remediation: 'Non-finite rate excluded; test will not be quarantined.',
            });
            return false;
        }
        return r.rate >= config.quarantineThreshold;
    }).length;

    return {
        flakyCount: flakyResults.length,
        quarantinedCount,
    };
}
