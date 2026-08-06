/**
 * Compute: Metrics Runs.
 *
 * Maps parsedArtifacts to MetricsRun[] format for persistence.
 * Used by hub.ts to store test results in data hub persistence.
 */
import type { ArtifactParseResult } from '../artifact-parser.js';
import type { MetricsRun } from '../../types/data-hub.js';
import type { PipelineRun } from '../../types/ci-cd.js';
import { rootLogger } from '../../logger.js';

/**
 * Convert parsedArtifacts map to MetricsRun[] array.
 *
 * Each run is stamped with the owning project name — the identity every
 * consumer filter (`r.project === getCurrentProject()`, schedule/batch/interactive)
 * matches against. The pipeline `runs` are used only for timestamps, not identity.
 *
 * @param parsedArtifacts - Map of run ID to parsed test artifacts.
 * @param runs - Optional PipelineRun[] for timestamp lookup (preserves original timestamps).
 * @param project - Project name stamped on every produced MetricsRun.
 * @returns Array of MetricsRun sorted by timestamp (newest first).
 */
function accumulateArtifactStats(
    artifact: ArtifactParseResult,
    stats: { passed: number; failed: number; skipped: number; duration: number; tests: MetricsRun['tests'] },
): void {
    const { passed, failed, skipped, duration } = artifact.data.stats;
    stats.passed += Number.isFinite(passed) ? passed : 0;
    stats.failed += Number.isFinite(failed) ? failed : 0;
    stats.skipped += Number.isFinite(skipped) ? skipped : 0;
    stats.duration += Number.isFinite(duration) ? duration : 0;
    if (
        !Number.isFinite(passed) ||
        !Number.isFinite(failed) ||
        !Number.isFinite(skipped) ||
        !Number.isFinite(duration)
    ) {
        rootLogger.warn('metrics-runs: non-finite stats in artifact treated as 0', {
            operation: 'convertToMetricsRuns',
            stats: { passed, failed, skipped, duration },
            remediation: 'Non-finite values replaced with 0 to prevent NaN propagation.',
        });
    }
    stats.tests.push(...artifact.data.tests);
}

export function convertToMetricsRuns(
    parsedArtifacts: Map<number, ArtifactParseResult[]>,
    runs: PipelineRun[] | undefined,
    project: string,
): MetricsRun[] {
    const result: MetricsRun[] = [];
    const runsById = new Map((runs ?? []).map((r) => [String(r.id), r]));

    for (const [runId, artifacts] of parsedArtifacts) {
        const acc = { passed: 0, failed: 0, skipped: 0, duration: 0, tests: [] as MetricsRun['tests'] };
        for (const artifact of artifacts) {
            accumulateArtifactStats(artifact, acc);
        }

        const run = runsById.get(String(runId));
        const timestamp = run?.created_at ?? new Date().toISOString();

        result.push({
            timestamp,
            project,
            passed: acc.passed,
            failed: acc.failed,
            skipped: acc.skipped,
            duration: acc.duration,
            total: acc.passed + acc.failed + acc.skipped,
            tests: acc.tests,
        });
    }
    result.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return result;
}
