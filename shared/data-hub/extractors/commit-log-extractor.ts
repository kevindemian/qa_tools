/**
 * Commit log extractor — SSOT for commit messages derived from CI workflow runs.
 *
 * This is the single, canonical implementation of `buildCommitLog`. It replaces
 * the previous `shared/commit-log.ts` module, which was an alternative source of
 * truth (Gap G14). DataHub providers (GitHub/GitLab) are the only consumers.
 *
 * The function is a PURE transformation: raw workflow/pipeline runs -> formatted
 * commit log string. It performs no I/O, which keeps it trivially unit-testable.
 */
import { GIT_HISTORY_RUNS } from '../../ci/ci-detect.js';

/** Shape accepted by `buildCommitLog`. GitHub uses `head_commit`; GitLab uses `title`. */
export interface CommitLogRunInput {
    created_at?: string;
    head_commit?: { message?: string; author?: { name?: string } };
    title?: string;
}

/**
 * Build a commit log string from workflow/pipeline runs.
 *
 * Supports both GitHub (head_commit) and GitLab (title) pipeline data.
 * Returns an empty string when no recognizable commit info is present.
 *
 * @param runs - Raw workflow/pipeline runs (GitHub or GitLab shaped).
 * @returns Formatted, newline-separated commit log (most-recent-first, capped at GIT_HISTORY_RUNS).
 */
export function buildCommitLog(runs: CommitLogRunInput[]): string {
    let log = '';
    for (const run of runs.slice(0, GIT_HISTORY_RUNS)) {
        const hc = run.head_commit;
        if (hc) {
            // GitHub: head_commit has message + author
            const msg = (hc.message ?? '').split('\n')[0];
            const author = typeof hc.author?.name === 'string' ? hc.author.name : 'unknown';
            const date = (typeof run.created_at === 'string' ? run.created_at : '').slice(0, 10);
            log += `- ${msg} (${author}, ${date})\n`;
        } else if (run.title) {
            // GitLab: pipeline title is the commit message
            const date = (typeof run.created_at === 'string' ? run.created_at : '').slice(0, 10);
            log += `- ${run.title} (${date})\n`;
        }
    }
    return log;
}
