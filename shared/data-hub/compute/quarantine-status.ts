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
    const quarantinedCount = flakyResults.filter((r) => r.rate >= config.quarantineThreshold).length;

    return {
        flakyCount: flakyResults.length,
        quarantinedCount,
    };
}
