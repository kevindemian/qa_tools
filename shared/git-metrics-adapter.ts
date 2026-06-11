/**
 * Git Metrics Adapter — transforms git history into MetricsRun[] and
 * FailureClassification[] so the quality gate, health score, and dashboards
 * can operate on real project data even when no pipeline metrics exist.
 *
 * Mapping:
 *   Each day with commits → one MetricsRun
 *   Each commit           → one FlatTest
 *   Normal commits        → state = 'passed'
 *   Revert commits        → state = 'failed'
 *   Merge commits         → state = 'skipped'
 *   Revert commits        → FailureClassification with category 'REVERT'
 *
 * @module git-metrics-adapter
 */

import { execFileSync } from 'child_process';
import { rootLogger } from './logger.js';
import type { MetricsRun, FailureClassification } from './metrics.js';
import type { FlatTest } from './result_parser.js';

export interface GitCommitEntry {
    hash: string;
    date: string;
    subject: string;
    author: string;
    parents: string[];
}

export interface GitMetricsAdapterOptions {
    maxDays?: number;
    projectName?: string;
    repoPath?: string;
}

const REVERT_PATTERN = /^(Revert|revert)\b/;

const GIT_LOG_FORMAT = ['--all', '--format=%H|%aI|%s|%an|%P', '--date=iso-strict', '--reverse'];

function parseGitLogOutput(output: string): GitCommitEntry[] {
    const lines = output.trim().split('\n').filter(Boolean);
    return lines.map((line) => {
        const parts = line.split('|');
        const hash = parts[0] ?? '';
        const date = parts[1] ?? '';
        const subject = parts[2] ?? '';
        const author = parts[3] ?? '';
        const parentField = parts.slice(4).join('|');
        const parents = parentField ? parentField.split(' ').filter(Boolean) : [];
        return { hash, date, subject, author, parents };
    });
}

function isRevert(subject: string): boolean {
    return REVERT_PATTERN.test(subject);
}

function isMerge(parents: string[]): boolean {
    return parents.length > 1;
}

function extractDate(isoTimestamp: string): string {
    return isoTimestamp.slice(0, 10);
}

export function fetchGitLog(options?: GitMetricsAdapterOptions): GitCommitEntry[] {
    try {
        const repoPath = options?.repoPath ?? process.cwd();
        const args = ['log', ...GIT_LOG_FORMAT];
        const output = execFileSync('git', args, {
            cwd: repoPath,
            encoding: 'utf-8',
            maxBuffer: 10 * 1024 * 1024,
            timeout: 15000,
        });
        return parseGitLogOutput(output);
    } catch (err) {
        rootLogger.warn('Git metrics adapter: failed to fetch git log — ' + (err as Error).message);
        return [];
    }
}

function filterCommits(commits: GitCommitEntry[], options?: GitMetricsAdapterOptions): GitCommitEntry[] {
    let filtered = [...commits];
    if (options?.maxDays && options.maxDays > 0) {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - options.maxDays);
        filtered = filtered.filter((c) => new Date(c.date) >= cutoff);
    }
    return filtered;
}

function buildFlatTest(commit: GitCommitEntry): FlatTest {
    let state: FlatTest['state'] = 'passed';
    if (isRevert(commit.subject)) {
        state = 'failed';
    } else if (isMerge(commit.parents)) {
        state = 'skipped';
    }
    return {
        title: commit.subject,
        state,
        duration: 0,
        ...(isRevert(commit.subject) ? { error: 'Commit was reverted' } : {}),
    };
}

export function generateGitMetricsRuns(options?: GitMetricsAdapterOptions): MetricsRun[] {
    const allCommits = fetchGitLog(options);
    if (allCommits.length === 0) return [];

    const filtered = filterCommits(allCommits, options);
    if (filtered.length === 0) return [];

    const projectName = options?.projectName ?? 'git';

    const dayBuckets = new Map<string, GitCommitEntry[]>();
    for (const commit of filtered) {
        const day = extractDate(commit.date);
        const bucket = dayBuckets.get(day) ?? [];
        bucket.push(commit);
        dayBuckets.set(day, bucket);
    }

    const runs: MetricsRun[] = [];
    let prevCommitTime: number | null = null;

    for (const [day, dayCommits] of dayBuckets) {
        const tests: FlatTest[] = [];
        let totalDuration = 0;
        let passedCount = 0;
        let failedCount = 0;
        let skippedCount = 0;

        for (const commit of dayCommits) {
            const test = buildFlatTest(commit);
            const commitTime = new Date(commit.date).getTime();

            if (prevCommitTime !== null) {
                const diffSec = Math.round((commitTime - prevCommitTime) / 1000);
                test.duration = Math.max(0, diffSec);
            }

            totalDuration += test.duration;

            if (test.state === 'passed') passedCount++;
            else if (test.state === 'failed') failedCount++;
            else skippedCount++;

            tests.push(test);
            prevCommitTime = commitTime;
        }

        runs.push({
            timestamp: day + 'T00:00:00.000Z',
            project: projectName,
            total: tests.length,
            passed: passedCount,
            failed: failedCount,
            skipped: skippedCount,
            duration: totalDuration,
            tests,
        });
    }

    return runs;
}

export function generateGitFailureClassifications(options?: GitMetricsAdapterOptions): FailureClassification[] {
    const allCommits = fetchGitLog(options);
    if (allCommits.length === 0) return [];

    const filtered = filterCommits(allCommits, options);
    const classifications: FailureClassification[] = [];

    for (const commit of filtered) {
        if (isRevert(commit.subject)) {
            classifications.push({
                timestamp: commit.date,
                testTitle: commit.subject,
                category: 'REVERT',
                project: options?.projectName ?? 'git',
            });
        }
    }

    return classifications;
}
