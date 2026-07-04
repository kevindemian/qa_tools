/**
 * Integration tests for Data Hub Providers.
 *
 * Tests the full flow: mock provider → fetchRawData → coherent data.
 */
import { describe, it, expect, vi } from 'vitest';
import { GitHubDataProvider } from '../../providers/github-provider.js';
import { GitLabDataProvider } from '../../providers/gitlab-provider.js';
import { CompositeProvider } from '../../providers/composite-provider.js';
import type { GitProvider, PipelineRun, PipelineJob } from '../../../types/ci-cd.js';

/* ── Mock GitProvider ──────────────────────────────────────────────────── */

function createMockGitProvider(runs: PipelineRun[], jobsPerRun: Map<number, PipelineJob[]>): GitProvider {
    return {
        getRecentPipelines: vi.fn().mockResolvedValue(runs),
        getPipelineJobs: vi.fn().mockImplementation((id: number) => Promise.resolve(jobsPerRun.get(id) ?? [])),
        listPipelineArtifacts: vi.fn().mockResolvedValue([]),
        downloadArtifact: vi.fn().mockResolvedValue({ buffer: Buffer.from(''), filename: '' }),
        getJobLogs: vi.fn().mockResolvedValue(null),
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

/* ── Tests ─────────────────────────────────────────────────────────────── */

describe('Integration: Data Hub Providers', () => {
    it('gitHub provider returns coherent raw data', async () => {
        expect.hasAssertions();

        const runs: PipelineRun[] = [
            {
                id: 1,
                head_branch: 'main',
                conclusion: 'success',
                created_at: '2026-07-01T10:00:00Z',
                updated_at: '2026-07-01T10:05:00Z',
            },
            {
                id: 2,
                head_branch: 'feature',
                conclusion: 'failure',
                created_at: '2026-07-01T11:00:00Z',
                updated_at: '2026-07-01T11:10:00Z',
            },
        ];
        const jobs = new Map<number, PipelineJob[]>([
            [1, [{ id: 101, name: 'build', stage: 'build', status: 'success' }]],
            [2, [{ id: 201, name: 'test', stage: 'test', status: 'failure' }]],
        ]);

        const gitProvider = createMockGitProvider(runs, jobs);
        const provider = new GitHubDataProvider(gitProvider);

        const result = await provider.fetchRawData({ repo: 'owner/repo', count: 10 });

        expect(result.runs).toHaveLength(2);
        expect(result.jobs.size).toBe(2);
        expect(result.jobs.get(1)).toHaveLength(1);
        expect(result.jobs.get(2)).toHaveLength(1);
        expect(result.artifacts.size).toBe(2);
    });

    it('gitLab provider returns coherent raw data', async () => {
        expect.hasAssertions();

        const runs: PipelineRun[] = [
            {
                id: 10,
                head_branch: 'main',
                conclusion: 'success',
                created_at: '2026-07-01T10:00:00Z',
                updated_at: '2026-07-01T10:05:00Z',
            },
        ];
        const jobs = new Map<number, PipelineJob[]>([
            [10, [{ id: 1001, name: 'deploy', stage: 'deploy', status: 'success' }]],
        ]);

        const gitProvider = createMockGitProvider(runs, jobs);
        const provider = new GitLabDataProvider(gitProvider);

        const result = await provider.fetchRawData({ repo: 'group/project', count: 5 });

        expect(result.runs).toHaveLength(1);
        expect(result.jobs.size).toBe(1);
        expect(result.jobs.get(10)).toHaveLength(1);
    });

    it('composite provider merges GitHub and GitLab data', async () => {
        expect.hasAssertions();

        const githubRuns: PipelineRun[] = [{ id: 1, head_branch: 'main', conclusion: 'success' }];
        const gitlabRuns: PipelineRun[] = [{ id: 100, head_branch: 'main', conclusion: 'success' }];

        const githubProvider = new GitHubDataProvider(createMockGitProvider(githubRuns, new Map()));
        const gitlabProvider = new GitLabDataProvider(createMockGitProvider(gitlabRuns, new Map()));

        const composite = new CompositeProvider([githubProvider, gitlabProvider]);
        const result = await composite.fetchRawData({ repo: 'test' });

        expect(result.runs).toHaveLength(2);
    });

    it('composite provider handles provider failure gracefully', async () => {
        expect.hasAssertions();

        const failingProvider: GitProvider = {
            getRecentPipelines: vi.fn().mockRejectedValue(new Error('API down')),
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

        const workingRuns: PipelineRun[] = [{ id: 2, head_branch: 'main', conclusion: 'success' }];

        const failing = new GitHubDataProvider(failingProvider);
        const working = new GitLabDataProvider(createMockGitProvider(workingRuns, new Map()));

        const composite = new CompositeProvider([failing, working]);
        const result = await composite.fetchRawData({ repo: 'test' });

        expect(result.runs).toHaveLength(1);

        const firstRun = result.runs[0];

        expect(firstRun?.id).toBe(2);
    });
});
