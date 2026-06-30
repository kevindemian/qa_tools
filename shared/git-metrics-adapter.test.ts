/**
 * Tests for git-metrics-adapter — transforms git history into MetricsRun[].
 */

vi.mock('child_process', () => ({
    execFileSync: vi.fn(),
}));

import { execFileSync } from 'child_process';
import {
    fetchGitLog,
    generateGitMetricsRuns,
    generateGitFailureClassifications,
    getLastGitLogError,
    parseGitLogOutput,
    clearGitLogError,
} from './git-metrics-adapter.js';

vi.mock('./logger', () => ({
    rootLogger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), child: vi.fn().mockReturnThis() },
}));

const mockExecFileSync = vi.mocked(execFileSync);

function mockGitOutput(output: string): void {
    mockExecFileSync.mockImplementation(() => output);
}

// NUL-delimited format: hash\0date\0subject\0author\0parents
const SAMPLE_GIT_LOG = [
    'abc123\0' + new Date('2026-06-01T10:00:00Z').toISOString() + '\0Initial commit\0kdemian\0',
    'def456\0' + new Date('2026-06-01T11:30:00Z').toISOString() + '\0Add feature X\0kdemian\0abc123',
    'ghi789\0' + new Date('2026-06-02T09:00:00Z').toISOString() + '\0Revert "Add feature X"\0kdemian\0def456',
    'jkl012\0' + new Date('2026-06-02T10:00:00Z').toISOString() + '\0Fix tests\0OpenCode\0ghi789',
    'mno345\0' + new Date('2026-06-02T11:00:00Z').toISOString() + '\0Merge branch feat\0Kevin Borges\0jkl012 abc123',
    'pqr678\0' + new Date('2026-06-03T14:00:00Z').toISOString() + '\0Refactor module\0kevindemian\0mno345',
].join('\n');

describe('ParseGitLogOutput', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('parses valid NUL-delimited lines', () => {
        const result = parseGitLogOutput('hash1\0date1\0subj1\0author1\0parent1');

        expect(result).toHaveLength(1);
        expect(result[0]?.hash).toBe('hash1');
        expect(result[0]?.date).toBe('date1');
        expect(result[0]?.subject).toBe('subj1');
        expect(result[0]?.author).toBe('author1');
        expect(result[0]?.parents).toStrictEqual(['parent1']);
    });

    it('skips malformed lines with fewer than 5 fields', () => {
        const result = parseGitLogOutput('hash1\0date1\0subj1');

        expect(result).toStrictEqual([]);
    });

    it('skips only the malformed line, keeps valid ones', () => {
        const input = 'hash1\0date1\0subj1\0author1\0\nhash2\0date2\0subj2\nhash3\0date3\0subj3\0author3\0parent3';
        const result = parseGitLogOutput(input);

        expect(result).toHaveLength(2);
        expect(result[0]?.hash).toBe('hash1');
        expect(result[1]?.hash).toBe('hash3');
    });

    it('handles empty input', () => {
        expect(parseGitLogOutput('')).toStrictEqual([]);
    });

    it('handles empty parents field', () => {
        const result = parseGitLogOutput('hash1\0date1\0subj1\0author1\0');

        expect(result).toHaveLength(1);
        expect(result[0]?.parents).toStrictEqual([]);
    });

    it('handles multiple parent hashes', () => {
        const result = parseGitLogOutput('hash1\0date1\0subj1\0author1\0parent1 parent2 parent3');

        expect(result[0]?.parents).toStrictEqual(['parent1', 'parent2', 'parent3']);
    });
});

describe('GetLastGitLogError', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        clearGitLogError();
    });

    it('returns error message after git command failure', () => {
        mockExecFileSync.mockImplementation(() => {
            throw new Error('fatal: not a git repository');
        });
        fetchGitLog();

        expect(getLastGitLogError()).toBe('fatal: not a git repository');
    });

    it('returns undefined after successful git command', () => {
        mockGitOutput(SAMPLE_GIT_LOG);
        fetchGitLog();

        expect(getLastGitLogError()).toBeUndefined();
    });

    it('is cleared at start of each fetchGitLog call', () => {
        mockExecFileSync.mockImplementation(() => {
            throw new Error('first error');
        });
        fetchGitLog();

        expect(getLastGitLogError()).toBe('first error');

        mockGitOutput(SAMPLE_GIT_LOG);
        fetchGitLog();

        expect(getLastGitLogError()).toBeUndefined();
    });

    it('is undefined before any fetchGitLog call', () => {
        clearGitLogError();

        expect(getLastGitLogError()).toBeUndefined();
    });
});

describe('FetchGitLog', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('parses git log output correctly', () => {
        mockGitOutput(SAMPLE_GIT_LOG);
        const commits = fetchGitLog();

        expect(commits).toHaveLength(6);
        expect(commits[0]?.hash).toBe('abc123');
        expect(commits[0]?.subject).toBe('Initial commit');
        expect(commits[0]?.author).toBe('kdemian');
        expect(commits[0]?.parents).toStrictEqual([]);
    });

    it('parses merge commit parents correctly', () => {
        mockGitOutput(SAMPLE_GIT_LOG);
        const commits = fetchGitLog();

        expect(commits[4]?.subject).toBe('Merge branch feat');
        expect(commits[4]?.parents).toStrictEqual(['jkl012', 'abc123']);
    });

    it('returns empty array when git command fails', () => {
        mockExecFileSync.mockImplementation(() => {
            throw new Error('git: command not found');
        });
        const commits = fetchGitLog();

        expect(commits).toStrictEqual([]);
    });

    it('returns empty array for empty git log', () => {
        mockGitOutput('');
        const commits = fetchGitLog();

        expect(commits).toStrictEqual([]);
    });

    it('uses repoPath option', () => {
        mockGitOutput(SAMPLE_GIT_LOG);
        fetchGitLog({ repoPath: '/custom/path' });

        expect(mockExecFileSync).toHaveBeenCalledWith(
            'git',
            expect.any(Array),
            expect.objectContaining({ cwd: '/custom/path' }),
        );
    });

    it('uses --all by default (no branch option)', () => {
        mockGitOutput(SAMPLE_GIT_LOG);
        fetchGitLog();
        const args = mockExecFileSync.mock.calls[0]?.[1] as string[];

        expect(args).toContain('--all');
        expect(args).not.toContain('HEAD');
    });

    it('uses branch option instead of --all', () => {
        mockGitOutput(SAMPLE_GIT_LOG);
        fetchGitLog({ branch: 'main' });
        const args = mockExecFileSync.mock.calls[0]?.[1] as string[];

        expect(args).toContain('main');
        expect(args).not.toContain('--all');
    });
});

describe('GenerateGitMetricsRuns', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns empty array when git log fails', () => {
        mockExecFileSync.mockImplementation(() => {
            throw new Error('git error');
        });
        const runs = generateGitMetricsRuns();

        expect(runs).toStrictEqual([]);
    });

    it('groups commits by day into separate runs', () => {
        mockGitOutput(SAMPLE_GIT_LOG);
        const runs = generateGitMetricsRuns();

        expect(runs).toHaveLength(3);
        expect(runs[0]?.timestamp).toContain('2026-06-01');
        expect(runs[1]?.timestamp).toContain('2026-06-02');
        expect(runs[2]?.timestamp).toContain('2026-06-03');
    });

    it('maps each commit to a FlatTest', () => {
        mockGitOutput(SAMPLE_GIT_LOG);
        const runs = generateGitMetricsRuns();

        expect(runs[0]?.tests).toHaveLength(2);
        expect(runs[0]?.tests[0]?.title).toBe('Initial commit');
        expect(runs[0]?.tests[1]?.title).toBe('Add feature X');
    });

    it('marks revert commits as failed', () => {
        mockGitOutput(SAMPLE_GIT_LOG);
        const runs = generateGitMetricsRuns();
        const revertTest = runs[1]?.tests.find((t) => t.title.startsWith('Revert'));

        expect(revertTest?.state).toBe('failed');
        expect(revertTest?.error).toBe('Commit was reverted');
    });

    it('marks merge commits as skipped', () => {
        mockGitOutput(SAMPLE_GIT_LOG);
        const runs = generateGitMetricsRuns();
        const mergeTest = runs[1]?.tests.find((t) => t.title.startsWith('Merge'));

        expect(mergeTest?.state).toBe('skipped');
    });

    it('marks normal commits as passed', () => {
        expect.hasAssertions();

        mockGitOutput(SAMPLE_GIT_LOG);
        const runs = generateGitMetricsRuns();
        const normalTests = runs.flatMap((r) => r.tests.filter((t) => t.state === 'passed'));

        expect(normalTests.length).toBeGreaterThan(0);

        normalTests.forEach((t) => expect(t.state).toBe('passed'));
    });

    it('calculates duration between commits', () => {
        mockGitOutput(SAMPLE_GIT_LOG);
        const runs = generateGitMetricsRuns();

        expect(runs[0]?.tests[1]?.duration).toBeGreaterThan(0);
        expect(runs[0]?.tests[0]?.duration).toBe(0);
    });

    it('sets total/passed/failed/skipped counts per run', () => {
        mockGitOutput(SAMPLE_GIT_LOG);
        const runs = generateGitMetricsRuns();

        expect(runs[0]?.total).toBe(2);
        expect(runs[0]?.passed).toBe(2);
        expect(runs[0]?.failed).toBe(0);
        expect(runs[1]?.total).toBe(3);
        expect(runs[1]?.passed).toBe(1);
        expect(runs[1]?.failed).toBe(1);
        expect(runs[1]?.skipped).toBe(1);
    });

    it('respects maxDays option', () => {
        mockGitOutput(SAMPLE_GIT_LOG);
        const runs = generateGitMetricsRuns({ maxDays: 1 });

        expect(runs.length).toBeLessThanOrEqual(1);
    });

    it('uses custom project name', () => {
        mockGitOutput(SAMPLE_GIT_LOG);
        const runs = generateGitMetricsRuns({ projectName: 'my-project' });

        expect(runs[0]?.project).toBe('my-project');
    });

    it('defaults project to git', () => {
        mockGitOutput(SAMPLE_GIT_LOG);
        const runs = generateGitMetricsRuns();

        expect(runs[0]?.project).toBe('git');
    });

    it('handles single commit correctly', () => {
        const line = 'abc123' + '\0' + '2026-06-01T10:00:00.000Z' + '\0' + 'Only commit' + '\0' + 'kdemian' + '\0';
        mockGitOutput(line);
        const runs = generateGitMetricsRuns();

        expect(runs).toHaveLength(1);
        expect(runs[0]?.total).toBe(1);
        expect(runs[0]?.duration).toBe(0);
    });
});

describe('GenerateGitFailureClassifications', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns empty array when git log fails', () => {
        mockExecFileSync.mockImplementation(() => {
            throw new Error('git error');
        });
        const result = generateGitFailureClassifications();

        expect(result).toStrictEqual([]);
    });

    it('creates classifications for revert commits only', () => {
        expect.hasAssertions();

        mockGitOutput(SAMPLE_GIT_LOG);
        const result = generateGitFailureClassifications();

        expect(result.length).toBeGreaterThanOrEqual(1);

        result.forEach((c) => expect(c.category).toBe('REVERT'));
    });

    it('sets correct fields on classification', () => {
        mockGitOutput(SAMPLE_GIT_LOG);
        const result = generateGitFailureClassifications();
        const revertClass = result.find((c) => c.testTitle.includes('Revert'));

        expect(revertClass?.category).toBe('REVERT');
        expect(revertClass?.project).toBe('git');
        expect(revertClass?.timestamp).toBeDefined();
    });

    it('respects maxDays option filtering out older commits', () => {
        mockGitOutput(SAMPLE_GIT_LOG);
        const result = generateGitFailureClassifications({ maxDays: 1 });

        expect(result.length).toBeLessThanOrEqual(1);
    });
});
