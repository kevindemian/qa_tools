/**
 * Flakiness Dashboard — compute layer.
 *
 * Produces flakiness data from test entries.
 * Render layer: see flakiness-renderer.ts.
 *
 * @module flakiness-dashboard
 */

import type { FlakinessEntry, DataHub } from '../types/data-hub.js';

export { generateFlakinessHtml } from './flakiness-renderer.js';

export interface FlakinessThresholds {
    /** Percentage threshold to flag a test as flaky (default: 30) */
    thresholdPct: number;
    /** Number of high-flakiness tests that triggers error severity (default: 5) */
    errorSeverityThreshold: number;
    /** Percentage above which a test is considered highly flaky (default: 50) */
    highFlakinessPct: number;
}

const DEFAULT_THRESHOLDS: FlakinessThresholds = {
    thresholdPct: 30,
    errorSeverityThreshold: 5,
    highFlakinessPct: 50,
};

export function validateThresholds(t: Partial<FlakinessThresholds> | undefined): FlakinessThresholds {
    const merged = { ...DEFAULT_THRESHOLDS, ...(t ?? {}) };
    if (!Number.isFinite(merged.thresholdPct) || merged.thresholdPct < 0 || merged.thresholdPct > 100) {
        throw new Error('thresholdPct must be a finite number between 0 and 100');
    }
    if (!Number.isFinite(merged.errorSeverityThreshold) || merged.errorSeverityThreshold < 0) {
        throw new Error('errorSeverityThreshold must be a finite non-negative number');
    }
    if (!Number.isFinite(merged.highFlakinessPct) || merged.highFlakinessPct < 0 || merged.highFlakinessPct > 100) {
        throw new Error('highFlakinessPct must be a finite number between 0 and 100');
    }
    if (merged.highFlakinessPct < merged.thresholdPct) {
        throw new Error('highFlakinessPct must be >= thresholdPct');
    }
    return merged;
}

/** Filter flaky entries whose rate exceeds a percentage threshold. */
export function filterHighFlakiness(
    flaky: FlakinessEntry[],
    thresholds: Partial<FlakinessThresholds> | undefined = DEFAULT_THRESHOLDS,
): FlakinessEntry[] {
    const t = validateThresholds(thresholds);
    return flaky.filter((f) => Number.isFinite(f.rate) && f.rate * 100 >= t.thresholdPct);
}

/** Generate a complete HTML page with flakiness summary cards and a test table. */
export interface FlakinessOptions {
    /** EIXO C awareness: surface failure-records provenance confidence + getQuality('failureRecords'). */
    dataHub?: DataHub;
    /** Configurable thresholds for flakiness detection. */
    thresholds?: Partial<FlakinessThresholds>;
    /** Fixed generation instant (ISO-8601) for deterministic output. Omit for wall-clock. */
    generatedAt?: string;
}
