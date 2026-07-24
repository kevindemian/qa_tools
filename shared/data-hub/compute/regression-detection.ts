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

const LOW_THRESHOLD = 1;
const MEDIUM_THRESHOLD = 2;
const HIGH_THRESHOLD = 3;
const CRITICAL_THRESHOLD = 5;
const STDDEV_DENOM_FALLBACK = 0.001;

/**
 * Detect silent regressions in test durations using z-score analysis.
 *
 * @param testDurationMap - Record mapping test title to array of durations across runs.
 * @param threshold - Z-score threshold for flagging a regression (default: 2).
 * @returns RegressionDetectionResult with detected regressions.
 */
export function detectSilentRegressions(
    testDurationMap: Record<string, number[]>,
    threshold: number = 2,
): RegressionDetectionResult {
    const validThreshold = Number.isFinite(threshold) && threshold > 0 ? threshold : 2;
    const regressions: RegressionEntry[] = [];
    let totalTests = 0;

    for (const [title, durations] of Object.entries(testDurationMap)) {
        if (!Array.isArray(durations) || durations.length < 2) continue;
        totalTests++;

        const finiteDurations = durations.filter(Number.isFinite);
        if (finiteDurations.length < 2) continue;

        const mean = finiteDurations.reduce((s, v) => s + v, 0) / finiteDurations.length;
        const variance = finiteDurations.reduce((s, v) => s + (v - mean) ** 2, 0) / finiteDurations.length;
        const stdDev = Math.sqrt(variance);

        const current = finiteDurations[finiteDurations.length - 1];
        if (current === undefined) continue;
        const zScore = stdDev > STDDEV_DENOM_FALLBACK ? (current - mean) / stdDev : 0;

        if (zScore > validThreshold) {
            regressions.push({
                title,
                meanDuration: Math.round(mean * 100) / 100,
                currentDuration: current,
                stdDev: Math.round(stdDev * 100) / 100,
                zScore: Math.round(zScore * 100) / 100,
                severity: classifyRegressionSeverity(zScore),
                previousDurations: finiteDurations.slice(0, -1),
            });
        }
    }

    regressions.sort((a, b) => b.zScore - a.zScore);

    return { regressions, totalTests, threshold: validThreshold };
}

function classifyRegressionSeverity(zScore: number): RegressionSeverity {
    if (zScore > CRITICAL_THRESHOLD) return 'critical';
    if (zScore > HIGH_THRESHOLD) return 'high';
    if (zScore > MEDIUM_THRESHOLD) return 'medium';
    if (zScore > LOW_THRESHOLD) return 'low';
    return 'none';
}
