/**
 * Unit tests for GitLab Data Provider.
 *
 * Tests the adapter that converts GitProvider to DataProvider.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GitLabDataProvider } from '../../providers/gitlab-provider.js';
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
        provider: 'gitlab' as const,
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

describe('GitLabDataProvider', () => {
    let mockProvider: GitProvider;
    let provider: GitLabDataProvider;

    beforeEach(() => {
        mockProvider = createMockProvider();
        provider = new GitLabDataProvider(mockProvider);
    });

    it('has correct name and source', () => {
        expect.hasAssertions();
        expect(provider.name).toBe('gitlab');
        expect(provider.source).toBe('gitlab');
    });

    it('fetches raw data from GitLab provider', async () => {
        expect.hasAssertions();

        const runs = [makeRun(1), makeRun(2)];
        const jobs = [makeJob(101), makeJob(102)];
        vi.mocked(mockProvider.getRecentPipelines).mockResolvedValue(runs);
        vi.mocked(mockProvider.getPipelineJobs).mockResolvedValue(jobs);
        vi.mocked(mockProvider.listPipelineArtifacts).mockResolvedValue([]);

        const result = await provider.fetchRawData({ repo: 'group/project', count: 10 });

        expect(result.runs).toHaveLength(2);
        expect(result.jobs.size).toBe(2);
        expect(result.artifacts.size).toBe(2);
        expect(mockProvider.getRecentPipelines).toHaveBeenCalledWith(10);
    });

    it('passes since to getRecentPipelines when set (Gap 4 incremental)', async () => {
        expect.hasAssertions();

        const runs = [makeRun(1)];
        const since = new Date('2026-01-01T00:00:00Z');
        vi.mocked(mockProvider.getRecentPipelines).mockResolvedValue(runs);
        vi.mocked(mockProvider.getPipelineJobs).mockResolvedValue([makeJob(101)]);
        vi.mocked(mockProvider.listPipelineArtifacts).mockResolvedValue([]);

        const result = await provider.fetchRawData({ repo: 'group/project', count: 10, since });

        expect(result.runs).toHaveLength(1);
        expect(mockProvider.getRecentPipelines).toHaveBeenCalledWith(10, since);
    });

    it('handles empty runs gracefully', async () => {
        expect.hasAssertions();

        vi.mocked(mockProvider.getRecentPipelines).mockResolvedValue([]);

        const result = await provider.fetchRawData({ repo: 'group/project' });

        expect(result.runs).toHaveLength(0);
        expect(result.jobs.size).toBe(0);
    });

    it('tracks provenance for each data source (Gap 2)', async () => {
        expect.hasAssertions();

        const runs = [makeRun(1)];
        vi.mocked(mockProvider.getRecentPipelines).mockResolvedValue(runs);
        vi.mocked(mockProvider.getPipelineJobs).mockResolvedValue([makeJob(101)]);
        vi.mocked(mockProvider.listPipelineArtifacts).mockResolvedValue([]);

        const result = await provider.fetchRawData({ repo: 'group/project' });

        expect(result.provenance).toBeDefined();

        const runsProv = result.provenance?.get('runs');

        expect(runsProv).toBeDefined();
        expect(runsProv?.source).toBe('gitlab-api');
        expect(runsProv?.confidence).toBe(1);
        expect(typeof runsProv?.timestamp).toBe('string');
    });

    it('filters runs by branchFilter (Gap 3)', async () => {
        expect.hasAssertions();

        const mainRun = { id: 1, ref: 'main' } as unknown as PipelineRun;
        const featureRun = { id: 2, ref: 'feature/x' } as unknown as PipelineRun;
        vi.mocked(mockProvider.getRecentPipelines).mockResolvedValue([mainRun, featureRun]);
        vi.mocked(mockProvider.getPipelineJobs).mockResolvedValue([makeJob(101)]);
        vi.mocked(mockProvider.listPipelineArtifacts).mockResolvedValue([]);

        const result = await provider.fetchRawData({ repo: 'group/project', branchFilter: 'main' });

        expect(result.runs).toHaveLength(1);

        expect(result.runs[0]?.id).toBe(1);
    });

    it('uses getJobLogs for failure reasons', async () => {
        expect.hasAssertions();

        const failedJob = makeJob(201, { status: 'failure' });
        const runs = [makeRun(1, { conclusion: 'failure' })];
        vi.mocked(mockProvider.getRecentPipelines).mockResolvedValue(runs);
        vi.mocked(mockProvider.getPipelineJobs).mockResolvedValue([failedJob]);
        vi.mocked(mockProvider.listPipelineArtifacts).mockResolvedValue([]);
        vi.mocked(mockProvider.getJobLogs).mockResolvedValue('Error: Job failed due to OOMKilled');

        const result = await provider.fetchRawData({ repo: 'group/project' });

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
        // run.conclusion === 'failure' → gitlab-reason entry produced (classifyFailures
        // deprioritizes the log when a structured reason exists).
        expect(records.some((r) => r.source === 'gitlab-reason')).toBeTruthy();

        const gitlabRecord = records.find((r) => r.source === 'gitlab-reason');

        expect(gitlabRecord?.confidence).toBeCloseTo(0.8);
    });

    it('lA-1: populates failureRecords from GitLab test-report test cases', async () => {
        expect.hasAssertions();

        const failedJob = makeJob(201, { status: 'failure' });
        const runs = [makeRun(1, { conclusion: 'failure' })];
        vi.mocked(mockProvider.getRecentPipelines).mockResolvedValue(runs);
        vi.mocked(mockProvider.getPipelineJobs).mockResolvedValue([failedJob]);
        vi.mocked(mockProvider.listPipelineArtifacts).mockResolvedValue([]);
        vi.mocked(mockProvider.getTestReport).mockResolvedValue({
            total_count: 2,
            success_count: 1,
            failed_count: 1,
            skipped_count: 0,
            error_count: 0,
            test_suites: [
                {
                    name: 'unit',
                    total_count: 2,
                    success_count: 1,
                    failed_count: 1,
                    skipped_count: 0,
                    error_count: 0,
                    test_cases: [
                        {
                            status: 'failed',
                            name: 'should compute total',
                            classname: 'math',
                            stack_trace: 'Error: expected 4 got 5\n    at src/math.ts:42:10',
                        },
                        { status: 'success', name: 'should add', classname: 'math' },
                    ],
                },
            ],
        });

        const result = await provider.fetchRawData({ repo: 'group/project' });

        const records = result.failureRecords ?? [];

        expect(records.some((r) => r.source === 'gitlab-test-report')).toBeTruthy();

        const tcRecord = records.find((r) => r.source === 'gitlab-test-report');

        expect(tcRecord?.name).toBe('should compute total');
        expect(tcRecord?.file).toBe('src/math.ts');
        expect(tcRecord?.line).toBe(42);
        expect(tcRecord?.confidence).toBeCloseTo(0.8);
        // successful test case must NOT be emitted as a failure record
        expect(records.some((r) => r.name === 'should add' && r.source === 'gitlab-test-report')).toBeFalsy();
    });

    it('skips jobs with non-failure status for failure reasons', async () => {
        expect.assertions(2);

        const successJob = makeJob(301, { status: 'success' });
        const runs = [makeRun(1)];
        vi.mocked(mockProvider.getRecentPipelines).mockResolvedValue(runs);
        vi.mocked(mockProvider.getPipelineJobs).mockResolvedValue([successJob]);
        vi.mocked(mockProvider.listPipelineArtifacts).mockResolvedValue([]);

        const result = await provider.fetchRawData({ repo: 'group/project' });

        // getJobLogs may be called for coverage extraction on success jobs
        // but failure reasons must be empty
        expect(result.failureReasons.size).toBe(0);
        expect(result.failureReasons.get(301)).toBeUndefined();
    });
});
