import { describe, it, expect } from 'vitest';
import { buildCommitLog, type CommitLogRunInput } from '../../extractors/commit-log-extractor.js';

describe('Commit log extractor', () => {
    it('formats a GitHub run using head_commit (message + author + date)', () => {
        const runs: CommitLogRunInput[] = [
            {
                created_at: '2024-01-10T12:00:00Z',
                head_commit: { message: 'Fix crash on startup\nDetails here', author: { name: 'Alice' } },
            },
        ];

        expect(buildCommitLog(runs)).toBe('- Fix crash on startup (Alice, 2024-01-10)\n');
    });

    it('truncates multi-line GitHub commit message to its first line', () => {
        const runs: CommitLogRunInput[] = [
            {
                created_at: '2024-01-11T08:00:00Z',
                head_commit: { message: 'Subject\nBody line', author: { name: 'Bob' } },
            },
        ];

        expect(buildCommitLog(runs)).toBe('- Subject (Bob, 2024-01-11)\n');
    });

    it('formats a GitLab run using the pipeline title', () => {
        const runs: CommitLogRunInput[] = [{ created_at: '2024-02-05T09:30:00Z', title: 'Add feature flag' }];

        expect(buildCommitLog(runs)).toBe('- Add feature flag (2024-02-05)\n');
    });

    it('uses "unknown" author when head_commit has no author name', () => {
        const runs: CommitLogRunInput[] = [
            { created_at: '2024-03-01T00:00:00Z', head_commit: { message: 'No author' } },
        ];

        expect(buildCommitLog(runs)).toBe('- No author (unknown, 2024-03-01)\n');
    });

    it('skips runs that have neither head_commit nor title', () => {
        const runs: CommitLogRunInput[] = [
            { created_at: '2024-03-02T00:00:00Z' },
            { created_at: '2024-03-03T00:00:00Z', head_commit: { message: 'Kept', author: { name: 'Carol' } } },
        ];

        expect(buildCommitLog(runs)).toBe('- Kept (Carol, 2024-03-03)\n');
    });

    it('caps the log to GIT_HISTORY_RUNS (5) entries, most-recent-first by input order', () => {
        const runs: CommitLogRunInput[] = Array.from({ length: 7 }, (_, i) => ({
            created_at: `2024-04-${String(10 + i).padStart(2, '0')}T00:00:00Z`,
            head_commit: { message: `Commit ${i}`, author: { name: 'Dev' } },
        }));
        const result = buildCommitLog(runs);
        const lines = result.split('\n').filter((l) => l.length > 0);

        expect(lines).toHaveLength(5);
        expect(lines[0]).toBe('- Commit 0 (Dev, 2024-04-10)');
        expect(lines[4]).toBe('- Commit 4 (Dev, 2024-04-14)');
        expect(result).not.toContain('Commit 5');
        expect(result).not.toContain('Commit 6');
    });

    it('returns an empty string for an empty input', () => {
        expect(buildCommitLog([])).toBe('');
    });

    it('returns an empty string when all runs lack commit info', () => {
        const runs: CommitLogRunInput[] = [
            { created_at: '2024-05-01T00:00:00Z' },
            { created_at: '2024-05-02T00:00:00Z' },
        ];

        expect(buildCommitLog(runs)).toBe('');
    });

    it('mixes GitHub and GitLab shaped runs in a single list', () => {
        const runs: CommitLogRunInput[] = [
            { created_at: '2024-06-01T00:00:00Z', head_commit: { message: 'gh commit', author: { name: 'Eve' } } },
            { created_at: '2024-06-02T00:00:00Z', title: 'gl commit' },
        ];

        expect(buildCommitLog(runs)).toBe('- gh commit (Eve, 2024-06-01)\n- gl commit (2024-06-02)\n');
    });
});
