/**
 * Compute: Suite Optimization Actions.
 *
 * Classifies tests into optimization actions based on duration and flakiness.
 * Feeds suite-optimization dashboard.
 *
 * @reference DORA — test suite optimization for deployment frequency
 * @reference Google SRE — reducing toil in CI/CD
 *
 * SSOT: All classification logic here. Renderers consume directly.
 */
import type {
    OptimizationResult,
    OptimizationAction,
    OptimizationImpact,
    OptimizationEntry,
} from '../../types/data-hub-extensions.js';

const DEFAULT_SLOW_THRESHOLD = 5;
const DEFAULT_FLAKY_THRESHOLD = 0.3;
const SPLIT_MULTIPLIER = 3;
const PARALLELIZE_MULTIPLIER = 2;
const REMOVE_WAIT_MULTIPLIER = 1.5;
const REMOVE_WAIT_FLAKINESS_CAP = 0.1;

/**
 * Classify tests into optimization actions.
 *
 * @param testDurationMap - Record<testTitle, durations[]>
 * @param flakinessMap - Record<testTitle, flakinessRate> (0-1)
 * @param slowThreshold - Duration threshold in seconds (default: 5)
 * @param flakyThreshold - Flakiness threshold (0-1, default: 0.3)
 */
export function computeOptimizationActions(
    testDurationMap: Record<string, number[]>,
    flakinessMap: Record<string, number>,
    slowThreshold: number = DEFAULT_SLOW_THRESHOLD,
    flakyThreshold: number = DEFAULT_FLAKY_THRESHOLD,
): OptimizationResult {
    const validSlow = Number.isFinite(slowThreshold) && slowThreshold > 0 ? slowThreshold : DEFAULT_SLOW_THRESHOLD;
    const validFlaky =
        Number.isFinite(flakyThreshold) && flakyThreshold >= 0 && flakyThreshold <= 1
            ? flakyThreshold
            : DEFAULT_FLAKY_THRESHOLD;
    const flakinessByTitle = new Map(Object.entries(flakinessMap));

    const optimizations: OptimizationEntry[] = [];
    let totalDuration = 0;
    let potentialSavings = 0;

    for (const [title, durations] of Object.entries(testDurationMap)) {
        if (!Array.isArray(durations) || durations.length === 0) continue;

        const rawAvg = durations.reduce((s, v) => s + v, 0) / durations.length;
        const avgDuration = Number.isFinite(rawAvg) && rawAvg > 0 ? rawAvg : 0;
        const durationSec = avgDuration / 1000;
        const rawFlakiness = flakinessByTitle.get(title) ?? 0;
        const flakiness = Number.isFinite(rawFlakiness) && rawFlakiness >= 0 ? rawFlakiness : 0;

        totalDuration += durationSec;

        const { action, reason, impact } = classifyAction(durationSec, flakiness, validSlow, validFlaky);

        if (action !== 'none') {
            potentialSavings += Math.max(0, durationSec - validSlow);
        }

        optimizations.push({
            testTitle: title,
            duration: Math.round(durationSec * 100) / 100,
            flakiness,
            impact,
            action,
            reason,
        });
    }

    optimizations.sort((a, b) => {
        const impactOrder: Record<OptimizationImpact, number> = { high: 0, medium: 1, low: 2 };
        const impactDiff = impactOrder[a.impact] - impactOrder[b.impact];
        if (impactDiff !== 0) return impactDiff;
        return b.duration - a.duration;
    });

    return {
        optimizations,
        totalTests: optimizations.length,
        totalDuration,
        potentialSavings,
        slowThreshold: validSlow,
        flakyThreshold: validFlaky,
        timestamp: new Date().toISOString(),
    };
}

function classifyAction(
    durationSec: number,
    flakiness: number,
    slowThreshold: number,
    flakyThreshold: number,
): { action: OptimizationAction; reason: string; impact: OptimizationImpact } {
    // Quarantine: high flakiness
    if (flakiness > flakyThreshold) {
        return {
            action: 'quarantine',
            reason: `Flakiness ${(flakiness * 100).toFixed(0)}% exceeds threshold ${(flakyThreshold * 100).toFixed(0)}%`,
            impact: 'high',
        };
    }

    // Split: very slow (> 3x threshold)
    if (durationSec > slowThreshold * SPLIT_MULTIPLIER) {
        return {
            action: 'split',
            reason: `Duration ${durationSec.toFixed(1)}s exceeds ${SPLIT_MULTIPLIER}x threshold (${(slowThreshold * SPLIT_MULTIPLIER).toFixed(1)}s)`,
            impact: 'high',
        };
    }

    // Parallelize: slow (> 2x threshold)
    if (durationSec > slowThreshold * PARALLELIZE_MULTIPLIER) {
        return {
            action: 'parallelize',
            reason: `Duration ${durationSec.toFixed(1)}s exceeds ${PARALLELIZE_MULTIPLIER}x threshold (${(slowThreshold * PARALLELIZE_MULTIPLIER).toFixed(1)}s)`,
            impact: 'medium',
        };
    }

    // Remove wait: moderately slow (> 1.5x) and low flakiness
    if (durationSec > slowThreshold * REMOVE_WAIT_MULTIPLIER && flakiness < REMOVE_WAIT_FLAKINESS_CAP) {
        return {
            action: 'remove_wait',
            reason: `Duration ${durationSec.toFixed(1)}s exceeds ${REMOVE_WAIT_MULTIPLIER}x threshold with low flakiness`,
            impact: 'medium',
        };
    }

    // Speed up: above threshold
    if (durationSec > slowThreshold) {
        return {
            action: 'speed_up',
            reason: `Duration ${durationSec.toFixed(1)}s exceeds threshold (${slowThreshold}s)`,
            impact: 'low',
        };
    }

    return { action: 'none', reason: 'Within acceptable thresholds', impact: 'low' };
}
