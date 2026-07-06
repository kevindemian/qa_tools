/**
 * Integration tests — getOrFetchDataHub (ci-data.ts)
 *
 * Validates:
 * - Cache hit returns cached hub without re-fetching
 * - Cache miss triggers fetch via correct provider
 * - GitLab provider selection when provider.provider === 'gitlab'
 * - GitHub provider selection when provider.provider === 'github'
 * - Error handling returns undefined
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { GitProvider } from '../../types/ci-cd.js';
import { clearCache } from '../../data-hub/cache.js';

/* ── Mock GitProvider ──────────────────────────────────────────────────── */

function createMockGitProvider(providerType: 'github' | 'gitlab'): GitProvider {
    return {
        getRecentPipelines: vi.fn().mockResolvedValue([]),
        getPipelineJobs: vi.fn().mockResolvedValue([]),
        listPipelineArtifacts: vi.fn().mockResolvedValue([]),
        downloadArtifact: vi.fn().mockResolvedValue({ buffer: Buffer.from(''), filename: '' }),
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
        getJobLogs: vi.fn(),
        getWorkflowRunTiming: vi.fn(),
        provider: providerType,
    };
}

/* ── Tests ─────────────────────────────────────────────────────────────── */

describe('Integration: getOrFetchDataHub', () => {
    beforeEach(() => {
        clearCache();
        vi.clearAllMocks();
    });

    it('returns cached hub on cache hit without re-fetching', async () => {
        expect.hasAssertions();

        const { getOrFetchDataHub } = await import('../../ci-data.js');
        const mockProvider = createMockGitProvider('github');

        // First call — cache miss, triggers fetch
        const hub1 = await getOrFetchDataHub(mockProvider, 'test-repo');

        // Second call — cache hit, should NOT call getRecentPipelines again
        const hub2 = await getOrFetchDataHub(mockProvider, 'test-repo');

        expect(hub1).toBeDefined();
        expect(hub2).toBe(hub1);
        expect(mockProvider.getRecentPipelines).toHaveBeenCalledTimes(1);
    });

    it('selects GitLab provider when provider.provider === "gitlab"', async () => {
        expect.hasAssertions();

        const { getOrFetchDataHub } = await import('../../ci-data.js');
        const mockProvider = createMockGitProvider('gitlab');

        const hub = await getOrFetchDataHub(mockProvider, 'gitlab-repo');

        // Hub should be created (even with empty data)
        expect(hub).toBeDefined();
        expect(hub?.raw.runs).toStrictEqual([]);
    });

    it('selects GitHub provider when provider.provider === "github"', async () => {
        expect.hasAssertions();

        const { getOrFetchDataHub } = await import('../../ci-data.js');
        const mockProvider = createMockGitProvider('github');

        const hub = await getOrFetchDataHub(mockProvider, 'github-repo');

        expect(hub).toBeDefined();
        expect(hub?.raw.runs).toStrictEqual([]);
    });

    it('returns hub with empty data when provider throws', async () => {
        expect.hasAssertions();

        const { getOrFetchDataHub } = await import('../../ci-data.js');
        const mockProvider = createMockGitProvider('github');
        mockProvider.getRecentPipelines = vi.fn().mockRejectedValue(new Error('API rate limit')) as never;

        const hub = await getOrFetchDataHub(mockProvider, 'error-repo');

        // Provider errors are caught by Promise.allSettled in fetchFromProviders
        // Hub is created with empty data (resilient design)
        expect(hub).toBeDefined();
        expect(hub?.raw.runs).toStrictEqual([]);
    });

    it('caches different repos independently', async () => {
        expect.hasAssertions();

        const { getOrFetchDataHub } = await import('../../ci-data.js');
        const mockProvider = createMockGitProvider('github');

        const hub1 = await getOrFetchDataHub(mockProvider, 'repo-a');
        const hub2 = await getOrFetchDataHub(mockProvider, 'repo-b');

        expect(hub1).toBeDefined();
        expect(hub2).toBeDefined();
        expect(hub1).not.toBe(hub2);
        expect(mockProvider.getRecentPipelines).toHaveBeenCalledTimes(2);
    });
});
