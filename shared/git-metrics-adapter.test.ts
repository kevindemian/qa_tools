/**
 * Tests for git-metrics-adapter — transforms git history into MetricsRun[].
 */

vi.mock('child_process', async () => ({
    execFileSync: vi.fn(),
}));

import { execFileSync } from 'child_process';
import { fetchGitLog, generateGitMetricsRuns, generateGitFailureClassifications } from './git-metrics-adapter.js';

vi.mock('./logger', async () => ({
    rootLogger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), child: vi.fn().mockReturnThis() },
}));

const mockExecFileSync = vi.mocked(execFileSync);

function mockGitOutput(output: string): void {
    mockExecFileSync.mockImplementation(() => output);
}

const SAMPLE_GIT_LOG = [
    'abc123|2026-06-01T10:00:00.000Z|Initial commit|kdemian|',
    'def456|2026-06-01T11:30:00.000Z|Add feature X|kdemian|abc123',
    'ghi789|2026-06-02T09:00:00.000Z|Revert "Add feature X"|kdemian|def456',
    'jkl012|2026-06-02T10:00:00.000Z|Fix tests|OpenCode|ghi789',
    'mno345|2026-06-02T11:00:00.000Z|Merge branch feat|Kevin Borges|jkl012 abc123',
    'pqr678|2026-06-03T14:00:00.000Z|Refactor module|kevindemian|mno345',
].join('\n');

describe('fetchGitLog', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('parses git log output correctly', async () => {
        mockGitOutput(SAMPLE_GIT_LOG);
        const commits = fetchGitLog();
        expect(commits).toHaveLength(6);
        expect(commits[0]?.hash).toBe('abc123');
        expect(commits[0]?.subject).toBe('Initial commit');
        expect(commits[0]?.author).toBe('kdemian');
        expect(commits[0]?.parents).toEqual([]);
    });

    it('parses merge commit parents correctly', async () => {
        mockGitOutput(SAMPLE_GIT_LOG);
        const commits = fetchGitLog();
        expect(commits[4]?.subject).toBe('Merge branch feat');
        expect(commits[4]?.parents).toEqual(['jkl012', 'abc123']);
    });

    it('returns empty array when git command fails', async () => {
        mockExecFileSync.mockImplementation(() => {
            throw new Error('git: command not found');
        });
        const commits = fetchGitLog();
        expect(commits).toEqual([]);
    });

    it('returns empty array for empty git log', async () => {
        mockGitOutput('');
        const commits = fetchGitLog();
        expect(commits).toEqual([]);
    });

    it('uses repoPath option', async () => {
        mockGitOutput(SAMPLE_GIT_LOG);
        fetchGitLog({ repoPath: '/custom/path' });
        expect(mockExecFileSync).toHaveBeenCalledWith(
            'git',
            expect.any(Array),
            expect.objectContaining({ cwd: '/custom/path' }),
        );
    });
});

describe('generateGitMetricsRuns', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns empty array when git log fails', async () => {
        mockExecFileSync.mockImplementation(() => {
            throw new Error('git error');
        });
        const runs = generateGitMetricsRuns();
        expect(runs).toEqual([]);
    });

    it('groups commits by day into separate runs', async () => {
        mockGitOutput(SAMPLE_GIT_LOG);
        const runs = generateGitMetricsRuns();
        expect(runs).toHaveLength(3);
        expect(runs[0]?.timestamp).toContain('2026-06-01');
        expect(runs[1]?.timestamp).toContain('2026-06-02');
        expect(runs[2]?.timestamp).toContain('2026-06-03');
    });

    it('maps each commit to a FlatTest', async () => {
        mockGitOutput(SAMPLE_GIT_LOG);
        const runs = generateGitMetricsRuns();
        expect(runs[0]?.tests).toHaveLength(2);
        expect(runs[0]?.tests[0]?.title).toBe('Initial commit');
        expect(runs[0]?.tests[1]?.title).toBe('Add feature X');
    });

    it('marks revert commits as failed', async () => {
        mockGitOutput(SAMPLE_GIT_LOG);
        const runs = generateGitMetricsRuns();
        const revertTest = runs[1]?.tests.find((t) => t.title.startsWith('Revert'));
        expect(revertTest?.state).toBe('failed');
        expect(revertTest?.error).toBe('Commit was reverted');
    });

    it('marks merge commits as skipped', async () => {
        mockGitOutput(SAMPLE_GIT_LOG);
        const runs = generateGitMetricsRuns();
        const mergeTest = runs[1]?.tests.find((t) => t.title.startsWith('Merge'));
        expect(mergeTest?.state).toBe('skipped');
    });

    it('marks normal commits as passed', async () => {
        mockGitOutput(SAMPLE_GIT_LOG);
        const runs = generateGitMetricsRuns();
        const normalTests = runs.flatMap((r) => r.tests.filter((t) => t.state === 'passed'));
        expect(normalTests.length).toBeGreaterThan(0);
        normalTests.forEach((t) => expect(t.state).toBe('passed'));
    });

    it('calculates duration between commits', async () => {
        mockGitOutput(SAMPLE_GIT_LOG);
        const runs = generateGitMetricsRuns();
        expect(runs[0]?.tests[1]?.duration).toBeGreaterThan(0);
        expect(runs[0]?.tests[0]?.duration).toBe(0);
    });

    it('sets total/passed/failed/skipped counts per run', async () => {
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

    it('respects maxDays option', async () => {
        mockGitOutput(SAMPLE_GIT_LOG);
        const runs = generateGitMetricsRuns({ maxDays: 1 });
        expect(runs.length).toBeLessThanOrEqual(1);
    });

    it('uses custom project name', async () => {
        mockGitOutput(SAMPLE_GIT_LOG);
        const runs = generateGitMetricsRuns({ projectName: 'my-project' });
        expect(runs[0]?.project).toBe('my-project');
    });

    it('defaults project to git', async () => {
        mockGitOutput(SAMPLE_GIT_LOG);
        const runs = generateGitMetricsRuns();
        expect(runs[0]?.project).toBe('git');
    });

    it('handles single commit correctly', async () => {
        mockGitOutput('abc123|2026-06-01T10:00:00.000Z|Only commit|kdemian|');
        const runs = generateGitMetricsRuns();
        expect(runs).toHaveLength(1);
        expect(runs[0]?.total).toBe(1);
        expect(runs[0]?.duration).toBe(0);
    });
});

describe('generateGitFailureClassifications', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns empty array when git log fails', async () => {
        mockExecFileSync.mockImplementation(() => {
            throw new Error('git error');
        });
        const result = generateGitFailureClassifications();
        expect(result).toEqual([]);
    });

    it('creates classifications for revert commits only', async () => {
        mockGitOutput(SAMPLE_GIT_LOG);
        const result = generateGitFailureClassifications();
        expect(result.length).toBeGreaterThanOrEqual(1);
        result.forEach((c) => expect(c.category).toBe('REVERT'));
    });

    it('sets correct fields on classification', async () => {
        mockGitOutput(SAMPLE_GIT_LOG);
        const result = generateGitFailureClassifications();
        const revertClass = result.find((c) => c.testTitle.includes('Revert'));
        expect(revertClass?.category).toBe('REVERT');
        expect(revertClass?.project).toBe('git');
        expect(revertClass?.timestamp).toBeDefined();
    });

    it('respects maxDays option filtering out older commits', async () => {
        mockGitOutput(SAMPLE_GIT_LOG);
        const result = generateGitFailureClassifications({ maxDays: 1 });
        expect(result.length).toBeLessThanOrEqual(1);
    });
});
