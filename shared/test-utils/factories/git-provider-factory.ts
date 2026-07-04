import type { GitProvider } from '../../types/ci-cd.js';
import type { Mocked } from 'vitest';

export function createMockGitProvider(overrides?: Partial<Mocked<GitProvider>>): Mocked<GitProvider> {
    const base: Mocked<GitProvider> = {
        provider: 'gitlab',
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
        getRecentPipelines: vi.fn(),
        getBranch: vi.fn(),
        getPipeline: vi.fn(),
        getPipelineJobs: vi.fn(),
        listPipelineArtifacts: vi.fn(),
        downloadArtifact: vi.fn(),
        getJobLogs: vi.fn(),
        getDiff: vi.fn(),
    };
    return { ...base, ...overrides };
}
