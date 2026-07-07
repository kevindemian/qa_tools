/**
 * Compute: Metrics Runs.
 *
 * Maps parsedArtifacts to MetricsRun[] format for persistence.
 * Used by hub.ts to store test results in data hub persistence.
 */
import type { ArtifactParseResult } from '../artifact-parser.js';
import type { MetricsRun } from '../../types/data-hub.js';

/**
 * Convert parsedArtifacts map to MetricsRun[] array.
 *
 * @param parsedArtifacts - Map of run ID to parsed test artifacts.
 * @returns Array of MetricsRun sorted by timestamp (newest first).
 */
export function convertToMetricsRuns(parsedArtifacts: Map<number, ArtifactParseResult[]>): MetricsRun[] {
    const runs: MetricsRun[] = [];
    for (const artifacts of parsedArtifacts.values()) {
        let totalPassed = 0;
        let totalFailed = 0;
        let totalSkipped = 0;
        let totalDuration = 0;
        const allTests: MetricsRun['tests'] = [];
        for (const artifact of artifacts) {
            totalPassed += artifact.data.stats.passed;
            totalFailed += artifact.data.stats.failed;
            totalSkipped += artifact.data.stats.skipped;
            totalDuration += artifact.data.stats.duration;
            allTests.push(...artifact.data.tests);
        }
        runs.push({
            timestamp: new Date().toISOString(),
            project: '',
            passed: totalPassed,
            failed: totalFailed,
            skipped: totalSkipped,
            duration: totalDuration,
            total: totalPassed + totalFailed + totalSkipped,
            tests: allTests,
        });
    }
    runs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return runs;
}
