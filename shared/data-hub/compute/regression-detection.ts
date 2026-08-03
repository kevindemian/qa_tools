/**
 * Compute: Regression Detection.
 *
 * Detects silent test duration regressions using z-score statistical analysis.
 * Based on ISO 3534-2 (Statistical Process Control).
 *
 * SSOT: All z-score computation happens here. Renderers consume the result directly.
 */
import type {
    RegressionDetectionResult,
    RegressionEntry,
    RegressionSeverity,
} from '../../types/data-hub-extensions.js';

/**
 * Dimension 5 Provenance — documents the source and justification for z-score thresholds.
 * @reference ISO 3534-2 (Statistical process control)
 */
export const SILENT_REGRESSION_PROVENANCE = {
    severityThresholds: {
        LOW: { zScore: 1, source: 'Statistical process control (1-sigma)', standard: 'ISO 3534-2' },
        MEDIUM: { zScore: 2, source: 'Statistical process control (2-sigma)', standard: 'ISO 3534-2' },
        HIGH: { zScore: 3, source: 'Statistical process control (3-sigma)', standard: 'ISO 3534-2' },
        CRITICAL: { zScore: 5, source: 'Extreme outlier detection (5-sigma)', standard: 'ISO 3534-2' },
    },
} as const;

const SEVERITY_THRESHOLD_CRITICAL = 5;
const SEVERITY_THRESHOLD_HIGH = 3;
const SEVERITY_THRESHOLD_MEDIUM = 2;
const SEVERITY_THRESHOLD_LOW = 1;
const STDDEV_DENOM_FALLBACK = 0.001;
const DEFAULT_THRESHOLD = 2;

function computeMean(values: number[]): number {
    if (values.length === 0) return 0;
    const sum = values.reduce((a, b) => a + b, 0);
    return Number.isFinite(sum) ? sum / values.length : 0;
}

function computeStdDev(values: number[], mean: number): number {
    if (values.length === 0) return 0;
    const squaredDiffs = values.map((v) => (v - mean) ** 2);
    const variance = squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
    return Number.isFinite(variance) ? Math.sqrt(variance) : 0;
}

function computeSeverity(zScore: number): RegressionSeverity {
    if (!Number.isFinite(zScore)) return 'none';
    if (zScore > SEVERITY_THRESHOLD_CRITICAL) return 'critical';
    if (zScore > SEVERITY_THRESHOLD_HIGH) return 'high';
    if (zScore > SEVERITY_THRESHOLD_MEDIUM) return 'medium';
    if (zScore > SEVERITY_THRESHOLD_LOW) return 'low';
    return 'none';
}

/**
 * Detect silent regressions in test durations using z-score analysis.
 *
 * Statistics are computed over the PRIOR durations only (excluding the current
 * run) so the tested value is never part of its own baseline — a correct
 * outlier test ("> 2σ from historical mean", ISO 3534-2).
 *
 * @param testDurationMap - Record mapping test title to array of durations across runs.
 * @param threshold - Z-score threshold for flagging a regression (default: 2).
 * @returns RegressionDetectionResult with detected regressions.
 */
export function detectSilentRegressions(
    testDurationMap: Record<string, number[]>,
    threshold: number = DEFAULT_THRESHOLD,
): RegressionDetectionResult {
    const validThreshold = Number.isFinite(threshold) && threshold > 0 ? threshold : DEFAULT_THRESHOLD;
    const regressions: RegressionEntry[] = [];
    let totalTests = 0;

    for (const [title, durations] of Object.entries(testDurationMap)) {
        if (!Array.isArray(durations) || durations.length < 2) continue;
        totalTests++;

        const hist = durations.slice(0, -1);
        const last = durations[durations.length - 1];
        if (last === undefined) continue;
        const currentDuration = last;
        const mean = computeMean(hist);
        const stdDev = computeStdDev(hist, mean);
        const denom = stdDev || STDDEV_DENOM_FALLBACK;
        const zScore = (currentDuration - mean) / denom;
        const severity = computeSeverity(zScore);

        if (zScore > validThreshold) {
            regressions.push({
                title,
                meanDuration: mean,
                currentDuration,
                stdDev,
                zScore,
                severity,
                previousDurations: hist,
            });
        }
    }

    regressions.sort((a, b) => b.zScore - a.zScore);

    return { regressions, totalTests, threshold: validThreshold, timestamp: new Date().toISOString() };
}
