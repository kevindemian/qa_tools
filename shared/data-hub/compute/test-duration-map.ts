/**
 * Compute: Test Duration Map.
 *
 * Builds a mapping from test title to array of durations across runs.
 * Used by silent regression detection and test duration analysis.
 *
 * Eliminates 3 duplicate implementations in schedule-handler.ts,
 * interactive-mode.ts (2 copies).
 */
import type { MetricsRun } from '../../types/data-hub.js';

/**
 * Build a duration map from MetricsRun[].
 * Maps each test title to its array of durations across runs.
 * Skipped tests are excluded (no meaningful duration data).
 *
 * @param runs - Metrics runs to analyze.
 * @returns Record mapping test title to duration array (in ms).
 */
export function calcTestDurationMap(runs: MetricsRun[]): Record<string, number[]> {
    const map = Object.create(null) as Record<string, number[]>;
    for (const run of runs) {
        for (const test of run.tests) {
            if (test.state === 'skipped') continue;
            if (!Number.isFinite(test.duration) || test.duration <= 0) continue;
            const existing = map[test.title];
            if (existing === undefined) {
                map[test.title] = [test.duration];
            } else {
                existing.push(test.duration);
            }
        }
    }
    return map;
}
