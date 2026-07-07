import { describe, it, expect, vi, beforeEach } from 'vitest';
import { detectFrameworkCascade } from '../../extractors/framework-detector.js';
import type { GitProvider } from '../../../types/ci-cd.js';

function createMockGitProvider(): GitProvider {
    return {
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
        getWorkflowRunTiming: vi.fn(),
        getFileContents: vi.fn<(...args: [path: string, ref?: string]) => Promise<string | null>>(),
        listDirectory: vi.fn(),
        provider: 'github',
    };
}

describe('DetectFrameworkCascade', () => {
    let mockProvider: GitProvider;

    beforeEach(() => {
        mockProvider = createMockGitProvider();
    });

    it('returns vitest when package.json has vitest', async () => {
        expect.hasAssertions();
        (mockProvider.getFileContents as ReturnType<typeof vi.fn>).mockResolvedValue(
            JSON.stringify({ devDependencies: { vitest: '1.0.0' } }),
        );
        const result = await detectFrameworkCascade(mockProvider, 'main');
        expect(result).toEqual({ framework: 'vitest', confidence: 0.9 });
    });

    it('returns unknown when package.json not found', async () => {
        expect.hasAssertions();
        (mockProvider.getFileContents as ReturnType<typeof vi.fn>).mockResolvedValue(null);
        const result = await detectFrameworkCascade(mockProvider, 'main');
        expect(result).toEqual({ framework: 'unknown', confidence: 0 });
    });

    it('returns unknown on API error', async () => {
        expect.hasAssertions();
        (mockProvider.getFileContents as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('API error'));
        const result = await detectFrameworkCascade(mockProvider, 'main');
        expect(result).toEqual({ framework: 'unknown', confidence: 0 });
    });
});
