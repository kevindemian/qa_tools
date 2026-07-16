import { describe, expect, it } from 'vitest';
import { buildCommitLog, type CommitLogRunInput } from '../commit-log-extractor.js';

describe('DataHub/extractors/commit-log', () => {
    describe('BuildCommitLog', () => {
        it('returns empty string for empty input', () => {
            expect.hasAssertions();
            expect(buildCommitLog([])).toBe('');
        });

        it('returns empty string when no recognizable commit info present', () => {
            expect.hasAssertions();

            const runs: CommitLogRunInput[] = [{ created_at: '2026-07-15T10:00:00Z' }];

            expect(buildCommitLog(runs)).toBe('');
        });

        it('formats a GitHub head_commit (first line of message, author, date)', () => {
            expect.hasAssertions();

            const runs: CommitLogRunInput[] = [
                {
                    created_at: '2026-07-15T10:00:00Z',
                    head_commit: { message: 'Fix coverage gate\nbody line', author: { name: 'Demian' } },
                },
            ];

            expect(buildCommitLog(runs)).toBe('- Fix coverage gate (Demian, 2026-07-15)\n');
        });

        it('falls back to "unknown" author when name is absent', () => {
            expect.hasAssertions();

            const runs: CommitLogRunInput[] = [
                { created_at: '2026-07-15T10:00:00Z', head_commit: { message: 'msg only' } },
            ];

            expect(buildCommitLog(runs)).toBe('- msg only (unknown, 2026-07-15)\n');
        });

        it('supports GitLab pipeline title', () => {
            expect.hasAssertions();

            const runs: CommitLogRunInput[] = [{ created_at: '2026-07-15T10:00:00Z', title: 'GitLab commit' }];

            expect(buildCommitLog(runs)).toBe('- GitLab commit (2026-07-15)\n');
        });

        it('prefers head_commit over title when both present', () => {
            expect.hasAssertions();

            const runs: CommitLogRunInput[] = [
                { created_at: '2026-07-15T10:00:00Z', head_commit: { message: 'gh' }, title: 'gl' },
            ];

            expect(buildCommitLog(runs)).toBe('- gh (unknown, 2026-07-15)\n');
        });

        it('caps the log at GIT_HISTORY_RUNS entries', () => {
            expect.hasAssertions();

            const runs: CommitLogRunInput[] = Array.from({ length: 50 }, (_, i) => ({
                created_at: '2026-07-15T10:00:00Z',
                head_commit: { message: 'c' + i, author: { name: 'a' } },
            }));
            const log = buildCommitLog(runs);
            const lines = log.split('\n').filter((l) => l.length > 0);

            expect(lines.length).toBeLessThanOrEqual(50);
            expect(lines.length).toBeGreaterThan(0);
        });
    });
});
