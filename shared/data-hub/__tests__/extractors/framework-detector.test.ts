import { describe, it, expect, vi, beforeEach } from 'vitest';
import { detectFrameworkCascade } from '../../extractors/framework-detector.js';
import { rootLogger } from '../../../logger.js';
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
        getTestReport: vi.fn(),
        provider: 'github',
    };
}

describe('DetectFrameworkCascade', () => {
    let mockProvider: GitProvider;
    let mockGetFileContents: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        mockProvider = createMockGitProvider();
        mockGetFileContents = vi.mocked(mockProvider.getFileContents);
    });

    it('returns vitest when package.json has vitest', async () => {
        expect.hasAssertions();

        mockGetFileContents.mockResolvedValue(JSON.stringify({ devDependencies: { vitest: '1.0.0' } }));
        const result = await detectFrameworkCascade(mockProvider, 'main');

        expect(result).toStrictEqual({ framework: 'vitest', confidence: 0.9 });
    });

    it('returns unknown when package.json not found', async () => {
        expect.hasAssertions();

        mockGetFileContents.mockResolvedValue(null);
        const result = await detectFrameworkCascade(mockProvider, 'main');

        expect(result).toStrictEqual({ framework: 'unknown', confidence: 0 });
    });

    it('returns unknown on API error', async () => {
        expect.hasAssertions();

        mockGetFileContents.mockRejectedValue(new Error('API error'));
        const result = await detectFrameworkCascade(mockProvider, 'main');

        expect(result).toStrictEqual({ framework: 'unknown', confidence: 0 });
    });

    it('logs the error instead of swallowing it silently on API error', async () => {
        expect.hasAssertions();

        const debugSpy = vi.spyOn(rootLogger, 'debug').mockImplementation(() => undefined);
        mockGetFileContents.mockRejectedValue(new Error('API error'));

        await detectFrameworkCascade(mockProvider, 'main');

        expect(debugSpy).toHaveBeenCalledWith(expect.stringContaining('API error'));

        debugSpy.mockRestore();
    });
});
