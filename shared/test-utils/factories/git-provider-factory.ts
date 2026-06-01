import { jest } from '@jest/globals';
import type { GitProvider } from '../../types/ci-cd';

export function createMockGitProvider(overrides?: Partial<jest.Mocked<GitProvider>>): jest.Mocked<GitProvider> {
    const base: jest.Mocked<GitProvider> = {
        provider: 'gitlab',
        triggerPipeline: jest.fn(),
        getSchedules: jest.fn(),
        runSchedule: jest.fn(),
        createMergeRequest: jest.fn(),
        updateMergeRequest: jest.fn(),
        getMergeRequest: jest.fn(),
        searchMergeRequests: jest.fn(),
        acceptMergeRequest: jest.fn(),
        isApproved: jest.fn(),
        getCICDVariables: jest.fn(),
        getRecentPipelines: jest.fn(),
        getBranch: jest.fn(),
        getPipeline: jest.fn(),
        getPipelineJobs: jest.fn(),
        listPipelineArtifacts: jest.fn(),
        downloadArtifact: jest.fn(),
        getDiff: jest.fn(),
    };
    return { ...base, ...overrides };
}
