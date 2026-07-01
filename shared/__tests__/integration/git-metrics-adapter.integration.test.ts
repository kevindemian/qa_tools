/**
 * Integration Tests — Git Metrics Adapter (FT-37)
 *
 * FT-37a: groups commits by day into runs
 * FT-37b: maps commit types (normal/revert/merge) correctly
 * FT-37c: respects maxDays filter
 * FT-37d: returns empty array when git fails
 * FT-37e: generateGitFailureClassifications for reverts only
 */
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import fs from 'fs';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';

import {
    generateGitMetricsRuns,
    generateGitFailureClassifications,
    getLastGitLogError,
} from '../../git-metrics-adapter.js';

const GIT_BIN = '/usr/bin/git';

let TEST_DIR: string;

function git(...args: string[]): string {
    return execFileSync(GIT_BIN, args, { cwd: TEST_DIR, encoding: 'utf-8' }).trim();
}

function commit(msg: string, date: string): void {
    const filePath = path.join(TEST_DIR, 'file.txt');
    fs.writeFileSync(filePath, msg, 'utf-8');
    execFileSync(GIT_BIN, ['add', '.'], { cwd: TEST_DIR, encoding: 'utf-8' });
    execFileSync(GIT_BIN, ['commit', '-m', msg, '--date', date], {
        cwd: TEST_DIR,
        encoding: 'utf-8',
        env: { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date },
    });
}

describe('Git Metrics Adapter Integration', () => {
    beforeEach(() => {
        TEST_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-integration-git-metrics-'));
        git('init');
        git('config', 'user.email', 'test@test.com');
        git('config', 'user.name', 'Test');
    });

    afterEach(() => {
        try {
            fs.rmSync(TEST_DIR, { recursive: true, force: true });
        } catch {
            /* best effort */
        }
    });

    describe('FT-37a: groups commits by day into runs', () => {
        it('creates one MetricsRun per day', () => {
            commit('first commit', '2026-06-01T10:00:00');
            commit('second commit', '2026-06-01T11:00:00');
            commit('next day commit', '2026-06-02T09:00:00');

            const runs = generateGitMetricsRuns({ repoPath: TEST_DIR });

            expect(runs).toHaveLength(2);
            expect(runs[0]?.timestamp).toContain('2026-06-01');
            expect(runs[1]?.timestamp).toContain('2026-06-02');
            expect(runs[0]?.tests).toHaveLength(2);
            expect(runs[1]?.tests).toHaveLength(1);
        });
    });

    describe('FT-37b: maps commit types correctly', () => {
        it('marks normal commits as passed, merge as skipped, revert as failed', () => {
            commit('normal commit', '2026-06-01T10:00:00');
            commit('normal commit 2', '2026-06-01T11:00:00');
            commit('Revert "normal commit 2"', '2026-06-02T09:00:00');
            git('checkout', '-b', 'feat');
            commit('feature work', '2026-06-03T10:00:00');
            git('checkout', '-'); // back to previous branch (master)
            execFileSync(GIT_BIN, ['merge', 'feat', '--no-ff', '-m', 'Merge branch feat'], {
                cwd: TEST_DIR,
                encoding: 'utf-8',
            });

            const runs = generateGitMetricsRuns({ repoPath: TEST_DIR });

            const allTests = runs.flatMap((r) => r.tests);
            const normal = allTests.find((t) => t.title === 'normal commit');
            const revert = allTests.find((t) => t.title.startsWith('Revert'));
            const merge = allTests.find((t) => t.title.startsWith('Merge'));

            expect(normal?.state).toBe('passed');
            expect(revert?.state).toBe('failed');
            expect(revert?.error).toBe('Commit was reverted');
            expect(merge?.state).toBe('skipped');
        });
    });

    describe('FT-37c: respects maxDays filter', () => {
        it('filters out commits older than maxDays', () => {
            commit('old commit', '2026-05-01T10:00:00');
            const recentDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
            commit('recent commit', recentDate);

            const runs = generateGitMetricsRuns({ repoPath: TEST_DIR, maxDays: 7 });

            expect(runs).toHaveLength(1);
            expect(runs[0]?.tests[0]?.title).toBe('recent commit');
        });
    });

    describe('FT-37d: returns empty array when git fails', () => {
        it('returns empty for non-repo directory', () => {
            expect.hasAssertions();

            const fakeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-fake-repo-'));

            try {
                const runs = generateGitMetricsRuns({ repoPath: fakeDir });

                expect(runs).toStrictEqual([]);
            } finally {
                fs.rmSync(fakeDir, { recursive: true, force: true });
            }
        });
    });

    describe('FT-37e: generateGitFailureClassifications for reverts only', () => {
        it('creates REVERT classifications for revert commits', () => {
            commit('normal', '2026-06-01T10:00:00');
            commit('Revert "normal"', '2026-06-01T11:00:00');

            const result = generateGitFailureClassifications({ repoPath: TEST_DIR });

            expect(result.length).toBeGreaterThanOrEqual(1);

            result.forEach((c) => expect(c.category).toBe('REVERT'));
        });

        it('returns empty when no reverts exist', () => {
            commit('normal 1', '2026-06-01T10:00:00');
            commit('normal 2', '2026-06-01T11:00:00');

            const result = generateGitFailureClassifications({ repoPath: TEST_DIR });

            expect(result.filter((c) => c.category === 'REVERT')).toHaveLength(0);
        });
    });

    describe('FT-37f: --all includes commits from all branches', () => {
        it('finds commits on secondary branches', () => {
            commit('initial commit', '2026-06-01T10:00:00');
            git('checkout', '-b', 'feature-branch');
            commit('feature work', '2026-06-02T10:00:00');

            const runs = generateGitMetricsRuns({ repoPath: TEST_DIR });

            const allTitles = runs.flatMap((r) => r.tests.map((t) => t.title));

            expect(allTitles).toContain('initial commit');
            expect(allTitles).toContain('feature work');
        });
    });

    describe('FT-37g: branch option filters to single branch', () => {
        it('includes only commits from the specified branch', () => {
            commit('main commit 1', '2026-06-01T10:00:00');
            git('checkout', '-b', 'feature-branch');
            commit('feature commit', '2026-06-02T10:00:00');
            git('checkout', 'master');
            commit('main commit 2', '2026-06-03T10:00:00');

            const runs = generateGitMetricsRuns({ repoPath: TEST_DIR, branch: 'master' });

            const allTitles = runs.flatMap((r) => r.tests.map((t) => t.title));

            expect(allTitles).toContain('main commit 1');
            expect(allTitles).toContain('main commit 2');
            expect(allTitles).not.toContain('feature commit');
        });
    });

    describe('FT-37h: getLastGitLogError returns error for non-repo directory', () => {
        it('exposes the error message when git log fails', () => {
            expect.hasAssertions();

            const fakeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-fake-repo-'));

            try {
                generateGitMetricsRuns({ repoPath: fakeDir });
                const err = getLastGitLogError();

                expect(err).toBeTruthy();
                expect(err).toContain('not a git repository');
            } finally {
                fs.rmSync(fakeDir, { recursive: true, force: true });
            }
        });
    });
});
