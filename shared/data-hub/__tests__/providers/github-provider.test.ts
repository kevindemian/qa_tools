/**
 * Unit tests for GitHub Data Provider.
 *
 * Tests the adapter that converts GitProvider to DataProvider.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GitHubDataProvider } from '../../providers/github-provider.js';
import type { GitProvider, PipelineRun, PipelineJob } from '../../../types/ci-cd.js';

/* ── Mock GitProvider ──────────────────────────────────────────────────── */

function createMockProvider(): GitProvider {
    return {
        getRecentPipelines: vi.fn(),
        getPipelineJobs: vi.fn(),
        listPipelineArtifacts: vi.fn(),
        downloadArtifact: vi.fn(),
        getJobLogs: vi.fn(),
        triggerPipeline: vi.fn(),
        getSchedules: vi.fn(),
        runSchedule: vi.fn(),
        createMergeRequest: vi.fn(),
        updateMergeRequest: vi.fn(),
        getMergeRequest: vi.fn(),
        searchMergeRequests: vi.fn(),
        acceptMergeRequest: vi.fn(),
        isApproved: vi.fn(),
        getCICDVariables: vi.fn(),
        getBranch: vi.fn(),
        getPipeline: vi.fn(),
        getDiff: vi.fn(),
        getWorkflowRunTiming: vi.fn(),
        getWorkflowUsage: vi.fn(),
        getFileContents: vi.fn(),
        listDirectory: vi.fn(),
        getTestReport: vi.fn(),
        provider: 'github' as const,
    };
}

function makeRun(id: number, overrides?: Partial<PipelineRun>): PipelineRun {
    return {
        id,
        conclusion: 'success',
        head_branch: 'main',
        created_at: '2026-07-01T10:00:00Z',
        updated_at: '2026-07-01T10:05:00Z',
        run_started_at: '2026-07-01T10:00:00Z',
        ...overrides,
    };
}

function makeJob(id: number, overrides?: Partial<PipelineJob>): PipelineJob {
    return {
        id,
        name: `job-${id}`,
        stage: 'test',
        status: 'success',
        ...overrides,
    };
}

/* ── Tests ─────────────────────────────────────────────────────────────── */

describe('GitHubDataProvider', () => {
    let mockProvider: GitProvider;
    let provider: GitHubDataProvider;

    beforeEach(() => {
        mockProvider = createMockProvider();
        provider = new GitHubDataProvider(mockProvider);
    });

    it('has correct name and source', () => {
        expect.hasAssertions();
        expect(provider.name).toBe('github');
        expect(provider.source).toBe('github');
    });

    it('fetches raw data from GitHub provider', async () => {
        expect.hasAssertions();

        const runs = [makeRun(1), makeRun(2)];
        const jobs = [makeJob(101), makeJob(102)];
        vi.mocked(mockProvider.getRecentPipelines).mockResolvedValue(runs);
        vi.mocked(mockProvider.getPipelineJobs).mockResolvedValue(jobs);
        vi.mocked(mockProvider.listPipelineArtifacts).mockResolvedValue([]);

        const result = await provider.fetchRawData({ repo: 'owner/repo', count: 10 });

        expect(result.runs).toHaveLength(2);
        expect(result.jobs.size).toBe(2);
        expect(result.artifacts.size).toBe(2);
        expect(mockProvider.getRecentPipelines).toHaveBeenCalledWith(10);
    });

    it('lA-2: preserves run_attempt from GitHub raw runs into result.runs', async () => {
        expect.hasAssertions();

        const runs = [makeRun(1, { run_attempt: 2, conclusion: 'success' })];
        vi.mocked(mockProvider.getRecentPipelines).mockResolvedValue(runs);
        vi.mocked(mockProvider.getPipelineJobs).mockResolvedValue([makeJob(101)]);
        vi.mocked(mockProvider.listPipelineArtifacts).mockResolvedValue([]);

        const result = await provider.fetchRawData({ repo: 'owner/repo', count: 10 });

        expect(result.runs[0]?.run_attempt).toBe(2);
    });

    it('lA-2: fetchRawData captures billable usage into timing (real cost)', async () => {
        expect.hasAssertions();

        const runs = [makeRun(1, { run_attempt: 1, conclusion: 'success' })];
        vi.mocked(mockProvider.getRecentPipelines).mockResolvedValue(runs);
        vi.mocked(mockProvider.getPipelineJobs).mockResolvedValue([makeJob(101)]);
        vi.mocked(mockProvider.listPipelineArtifacts).mockResolvedValue([]);
        vi.mocked(mockProvider.getWorkflowUsage).mockResolvedValue({
            run_duration_ms: 120000,
            billable: { UBUNTU: { total_ms: 60000, jobs: 2 } },
        });

        const result = await provider.fetchRawData({ repo: 'owner/repo', count: 10 });

        const stored = result.timing?.get(1);

        expect(stored).toBeDefined();
        expect(stored?.run_duration_ms).toBe(120000);
        expect(stored?.billable?.['UBUNTU']?.total_ms).toBe(60000);
    });

    it('passes since to getRecentPipelines when set (Gap 4 incremental)', async () => {
        expect.hasAssertions();

        const runs = [makeRun(1)];
        const since = new Date('2026-01-01T00:00:00Z');
        vi.mocked(mockProvider.getRecentPipelines).mockResolvedValue(runs);
        vi.mocked(mockProvider.getPipelineJobs).mockResolvedValue([makeJob(101)]);
        vi.mocked(mockProvider.listPipelineArtifacts).mockResolvedValue([]);

        const result = await provider.fetchRawData({ repo: 'owner/repo', count: 10, since });

        expect(result.runs).toHaveLength(1);
        expect(mockProvider.getRecentPipelines).toHaveBeenCalledWith(10, since);
    });

    it('handles empty runs gracefully', async () => {
        expect.hasAssertions();

        vi.mocked(mockProvider.getRecentPipelines).mockResolvedValue([]);

        const result = await provider.fetchRawData({ repo: 'owner/repo' });

        expect(result.runs).toHaveLength(0);
        expect(result.jobs.size).toBe(0);
    });

    it('tracks provenance for each data source (Gap 2)', async () => {
        expect.hasAssertions();

        const runs = [makeRun(1)];
        vi.mocked(mockProvider.getRecentPipelines).mockResolvedValue(runs);
        vi.mocked(mockProvider.getPipelineJobs).mockResolvedValue([makeJob(101)]);
        vi.mocked(mockProvider.listPipelineArtifacts).mockResolvedValue([]);

        const result = await provider.fetchRawData({ repo: 'owner/repo' });

        expect(result.provenance).toBeDefined();

        const runsProv = result.provenance?.get('runs');

        expect(runsProv).toBeDefined();
        expect(runsProv?.source).toBe('github-api');
        expect(runsProv?.confidence).toBe(1);
        expect(typeof runsProv?.timestamp).toBe('string');
    });

    it('filters runs by branchFilter (Gap 3)', async () => {
        expect.hasAssertions();

        const mainRun = makeRun(1, { head_branch: 'main' });
        const featureRun = makeRun(2, { head_branch: 'feature/x' });
        vi.mocked(mockProvider.getRecentPipelines).mockResolvedValue([mainRun, featureRun]);
        vi.mocked(mockProvider.getPipelineJobs).mockResolvedValue([makeJob(101)]);
        vi.mocked(mockProvider.listPipelineArtifacts).mockResolvedValue([]);

        const result = await provider.fetchRawData({ repo: 'owner/repo', branchFilter: 'main' });

        expect(result.runs).toHaveLength(1);

        expect(result.runs[0]?.id).toBe(1);
    });

    it('uses getJobLogs for failure reasons (bug fix)', async () => {
        expect.hasAssertions();

        const failedJob = makeJob(201, { status: 'failure' });
        const runs = [makeRun(1)];
        vi.mocked(mockProvider.getRecentPipelines).mockResolvedValue(runs);
        vi.mocked(mockProvider.getPipelineJobs).mockResolvedValue([failedJob]);
        vi.mocked(mockProvider.listPipelineArtifacts).mockResolvedValue([]);
        vi.mocked(mockProvider.getJobLogs).mockResolvedValue('Error: Connection timeout after 30s');

        const result = await provider.fetchRawData({ repo: 'owner/repo' });

        expect(mockProvider.getJobLogs).toHaveBeenCalledWith(201);
        expect(mockProvider.downloadArtifact).not.toHaveBeenCalled();

        const reasons = result.failureReasons.get(201);

        expect(reasons).toBeDefined();
        expect(reasons?.length).toBeGreaterThan(0);

        // CDH-L4g: canonical FailureRecord[] must absorb category/confidence/source
        // instead of dropping them to null.
        const records = result.failureRecords ?? [];

        expect(records.length).toBeGreaterThan(0);
        expect(
            records.every(
                (r) =>
                    typeof r.category === 'string' && typeof r.confidence === 'number' && typeof r.source === 'string',
            ),
        ).toBeTruthy();
        expect(
            records.some((r) => r.source === 'log-regex' && (r.message ?? '').includes('Connection timeout')),
        ).toBeTruthy();
    });

    it('skips jobs with non-failure status for failure reasons', async () => {
        expect.assertions(2);

        const successJob = makeJob(301, { status: 'success' });
        const runs = [makeRun(1)];
        vi.mocked(mockProvider.getRecentPipelines).mockResolvedValue(runs);
        vi.mocked(mockProvider.getPipelineJobs).mockResolvedValue([successJob]);
        vi.mocked(mockProvider.listPipelineArtifacts).mockResolvedValue([]);

        const result = await provider.fetchRawData({ repo: 'owner/repo' });

        // getJobLogs may be called for coverage extraction on success jobs
        // but failure reasons must be empty
        expect(result.failureReasons.size).toBe(0);
        expect(result.failureReasons.get(301)).toBeUndefined();
    });
});
