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

    it('handles empty runs gracefully', async () => {
        expect.hasAssertions();

        vi.mocked(mockProvider.getRecentPipelines).mockResolvedValue([]);

        const result = await provider.fetchRawData({ repo: 'owner/repo' });

        expect(result.runs).toHaveLength(0);
        expect(result.jobs.size).toBe(0);
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
    });

    it('skips jobs with non-failure status for failure reasons', async () => {
        expect.hasAssertions();

        const successJob = makeJob(301, { status: 'success' });
        const runs = [makeRun(1)];
        vi.mocked(mockProvider.getRecentPipelines).mockResolvedValue(runs);
        vi.mocked(mockProvider.getPipelineJobs).mockResolvedValue([successJob]);
        vi.mocked(mockProvider.listPipelineArtifacts).mockResolvedValue([]);

        const result = await provider.fetchRawData({ repo: 'owner/repo' });

        expect(mockProvider.getJobLogs).not.toHaveBeenCalled();
        expect(result.failureReasons.size).toBe(0);
    });
});
