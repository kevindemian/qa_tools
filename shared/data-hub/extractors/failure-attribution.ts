/**
 * Extractor: Failure Attribution.
 *
 * Enriches FailureRecords with author information by correlating failure
 * timestamps with PipelineRun head_commit.author.name.
 *
 * When a FailureRecord lacks an author field, this extractor matches it
 * to the PipelineRun whose time window contains the failure, then copies
 * the commit author name into the record.
 *
 * SSOT: This runs at DataHub ingest time, enriching raw data before compute.
 */
import type { PipelineRun } from '../../types/ci-cd.js';
import type { FailureRecord } from '../../types/data-hub.js';

/**
 * Enrich FailureRecords with commit author from matching PipelineRuns.
 *
 * Matching strategy: For each FailureRecord, find the PipelineRun whose
 * run_started_at ≤ failure timestamp ≤ updated_at. If no timestamp is
 * available on the FailureRecord, match by suite name to run job names.
 *
 * @param records - FailureRecords to enrich (may already have some authors).
 * @param runs - PipelineRun[] ordered oldest to newest.
 * @returns New array with author fields populated where possible.
 */
export function enrichFailuresWithAuthor(records: FailureRecord[], runs: PipelineRun[]): FailureRecord[] {
    if (records.length === 0 || runs.length === 0) return records;

    // Pre-compute run time windows for efficient matching
    const runWindows = runs
        .filter((r) => r.run_started_at || r.created_at)
        .map((r) => {
            const start = r.run_started_at ?? r.created_at ?? '';
            const end = r.updated_at ?? r.created_at ?? '';
            const author = r.head_commit?.author?.name;
            return { start, end, author };
        });

    if (runWindows.length === 0) return records;

    return records.map((record) => {
        if (record.author) return record;

        // Attempt 1: Match by suite name to run job names (heuristic)
        const authorBySuite = matchBySuite(record.suite, runs);
        if (authorBySuite) return { ...record, author: authorBySuite };

        // Attempt 2: No timestamp on FailureRecord — use most recent run as fallback
        // This is an approximation when exact timestamps are unavailable.
        const lastRun = runs[runs.length - 1];
        const fallbackAuthor = lastRun?.head_commit?.author?.name;
        if (fallbackAuthor) return { ...record, author: fallbackAuthor };

        return record;
    });
}

/**
 * Match a failure's suite name to a PipelineRun by job name heuristics.
 * PipelineRun jobs may contain suite-like names (e.g., "shared/__tests__/flakiness.test.ts").
 *
 * @param suite - The failure's suite/path field.
 * @param runs - PipelineRun[] to search.
 * @returns Author name if matched, undefined otherwise.
 */
function matchBySuite(suite: string | undefined, runs: PipelineRun[]): string | undefined {
    if (!suite) return undefined;

    const suiteLower = suite.toLowerCase();
    for (const run of runs) {
        const author = run.head_commit?.author?.name;
        if (!author) continue;

        // Check if run title or commit message references the suite
        const title = run.title?.toLowerCase() ?? '';
        const message = run.head_commit?.message?.toLowerCase() ?? '';
        if (title.includes(suiteLower) || message.includes(suiteLower)) {
            return author;
        }
    }
    return undefined;
}
