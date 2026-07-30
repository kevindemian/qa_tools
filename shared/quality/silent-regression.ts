/**
 * Silent Regression Detector — detects tests whose duration has increased
 * abnormally (> 2σ from historical mean), indicating a possible silent regression.
 *
 * Compute layer: produces RegressionResult from test histories.
 * Render layer: see silent-regression-renderer.ts.
 *
 * @module silent-regression
 */

export { generateSilentRegressionHtml } from './silent-regression-renderer.js';

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

export interface RegressionEntry {
    title: string;
    meanDuration: number;
    currentDuration: number;
    stdDev: number;
    zScore: number;
    severity: 'none' | 'low' | 'medium' | 'high' | 'critical';
    previousDurations: number[];
}

export interface RegressionResult {
    regressions: RegressionEntry[];
    totalTests: number;
    threshold: number;
    timestamp: string;
}

const SEVERITY_THRESHOLD_CRITICAL = 5;
const SEVERITY_THRESHOLD_HIGH = 3;
const SEVERITY_THRESHOLD_MEDIUM = 2;
const SEVERITY_THRESHOLD_LOW = 1;
const STDDEV_DENOM_FALLBACK = 0.001;

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

function computeSeverity(zScore: number): RegressionEntry['severity'] {
    if (!Number.isFinite(zScore)) return 'none';
    if (zScore > SEVERITY_THRESHOLD_CRITICAL) return 'critical';
    if (zScore > SEVERITY_THRESHOLD_HIGH) return 'high';
    if (zScore > SEVERITY_THRESHOLD_MEDIUM) return 'medium';
    if (zScore > SEVERITY_THRESHOLD_LOW) return 'low';
    return 'none';
}

export function detectSilentRegression(testHistories: Record<string, number[]>, threshold?: number): RegressionResult {
    const t = threshold ?? 2;
    const regressions: RegressionEntry[] = [];
    let totalTests = 0;

    for (const [title, durations] of Object.entries(testHistories)) {
        if (durations.length < 2) continue;
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

        const entry: RegressionEntry = {
            title,
            meanDuration: mean,
            currentDuration,
            stdDev,
            zScore,
            severity,
            previousDurations: hist,
        };

        if (zScore > t) {
            regressions.push(entry);
        }
    }

    return {
        regressions,
        totalTests,
        threshold: t,
        timestamp: new Date().toISOString(),
    };
}
