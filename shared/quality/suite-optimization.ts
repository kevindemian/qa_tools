/**
 * Suite Optimization Advisor — analyzes test duration and flakiness data
 * to recommend optimization actions for a test suite.
 *
 * @module suite-optimization
 */

export { generateOptimizationHtml } from './suite-optimization-renderer.js';

export type OptimizationAction = 'parallelize' | 'quarantine' | 'speed_up' | 'split' | 'remove_wait' | 'none';

export type OptimizationImpact = 'high' | 'medium' | 'low';

export interface OptimizationEntry {
    testTitle: string;
    duration: number;
    flakiness: number;
    impact: OptimizationImpact;
    action: string;
    reason: string;
}

export interface OptimizationResult {
    optimizations: OptimizationEntry[];
    totalTests: number;
    totalDuration: number;
    potentialSavings: number;
    slowThreshold: number;
    flakyThreshold: number;
    timestamp: string;
}

function toFinite(value: unknown, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;
}

const DEFAULT_SLOW_THRESHOLD = 5;
const DEFAULT_FLAKY_THRESHOLD = 0.3;
const SPLIT_MULTIPLIER = 3;
const PARALLELIZE_MULTIPLIER = 2;
const REMOVE_WAIT_MULTIPLIER = 1.5;
const REMOVE_WAIT_FLAKINESS_CAP = 0.1;

export function analyzeSuiteOptimization(
    tests: Array<{ title: string; duration: number; flakiness: number }>,
    slowThreshold?: number,
    flakyThreshold?: number,
): OptimizationResult {
    const safeSlow = toFinite(slowThreshold, DEFAULT_SLOW_THRESHOLD);
    const safeFlaky = toFinite(flakyThreshold, DEFAULT_FLAKY_THRESHOLD);

    const entries: OptimizationEntry[] = [];
    let totalDuration = 0;
    let potentialSavings = 0;

    for (const test of tests) {
        const duration = toFinite(test.duration, 0);
        const flakiness = toFinite(test.flakiness, 0);
        totalDuration += duration;

        let action: OptimizationAction;
        let reason: string;

        if (flakiness > safeFlaky) {
            action = 'quarantine';
            reason = `Flakiness ${(flakiness * 100).toFixed(0)}% exceeds threshold of ${(safeFlaky * 100).toFixed(0)}%`;
        } else if (duration > safeSlow * SPLIT_MULTIPLIER) {
            action = 'split';
            reason = `Duration ${duration.toFixed(1)}s is ${(duration / safeSlow).toFixed(1)}x over ${safeSlow}s threshold — consider splitting`;
        } else if (duration > safeSlow * PARALLELIZE_MULTIPLIER) {
            action = 'parallelize';
            reason = `Duration ${duration.toFixed(1)}s is ${(duration / safeSlow).toFixed(1)}x over ${safeSlow}s threshold — candidate for parallel execution`;
        } else if (duration > safeSlow * REMOVE_WAIT_MULTIPLIER && flakiness < REMOVE_WAIT_FLAKINESS_CAP) {
            action = 'remove_wait';
            reason = `Duration ${duration.toFixed(1)}s is ${(duration / safeSlow).toFixed(1)}x over ${safeSlow}s threshold with low flakiness — likely unnecessary waits`;
        } else if (duration > safeSlow) {
            action = 'speed_up';
            reason = `Duration ${duration.toFixed(1)}s exceeds ${safeSlow}s threshold — needs optimization`;
        } else {
            action = 'none';
            reason = 'Within acceptable thresholds';
        }

        let impact: 'high' | 'medium' | 'low';
        if (duration > safeSlow * SPLIT_MULTIPLIER || flakiness > safeFlaky) {
            impact = 'high';
        } else if (duration > safeSlow) {
            impact = 'medium';
        } else {
            impact = 'low';
        }

        if (action !== 'none') {
            potentialSavings += Math.max(0, duration - safeSlow);
        }

        entries.push({
            testTitle: test.title,
            duration,
            flakiness,
            impact,
            action,
            reason,
        });
    }

    const impactOrder: Record<'high' | 'medium' | 'low', number> = { high: 3, medium: 2, low: 1 };
    entries.sort((a, b) => {
        const orderDiff = impactOrder[b.impact] - impactOrder[a.impact];
        if (orderDiff !== 0) return orderDiff;
        return b.duration - a.duration;
    });

    return {
        optimizations: entries,
        totalTests: tests.length,
        totalDuration,
        potentialSavings,
        slowThreshold: safeSlow,
        flakyThreshold: safeFlaky,
        timestamp: new Date().toISOString(),
    };
}
