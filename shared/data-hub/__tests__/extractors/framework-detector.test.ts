import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../prompt-format.js', async () => {
    const actual = await vi.importActual<typeof import('../../../prompt-format.js')>('../../../prompt-format.js');
    return { ...actual, warn: vi.fn() };
});

import { detectFrameworkCascade } from '../../extractors/framework-detector.js';
import { rootLogger } from '../../../logger.js';
import { warn } from '../../../prompt-format.js';
import { ExternalError, type ExternalErrorKind } from '../../../errors.js';
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
        getWorkflowUsage: vi.fn(),
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

    describe('Infrastructure-error surfacing (must warn the user, never silently degrade)', () => {
        const INFRA_KINDS: ExternalErrorKind[] = ['auth', 'permission', 'rateLimit', 'network', 'server'];

        beforeEach(() => {
            vi.mocked(warn).mockClear();
        });

        it.each(INFRA_KINDS)('surfaces an ExternalError of kind "%s" to the user via warn()', async (kind) => {
            expect.assertions(3);

            mockGetFileContents.mockRejectedValue(
                new ExternalError(kind, `boundary failure (${kind})`, { operation: 'getFileContents' }),
            );

            const result = await detectFrameworkCascade(mockProvider, 'main');

            expect(result).toStrictEqual({ framework: 'unknown', confidence: 0 });
            expect(warn).toHaveBeenCalledTimes(1);
            expect(vi.mocked(warn).mock.calls[0]?.[0]).toContain(kind);
        });

        it('appends the remediation hint to the warning when present', async () => {
            expect.assertions(2);

            mockGetFileContents.mockRejectedValue(
                new ExternalError('auth', 'token invalid (HTTP 401)', {
                    operation: 'getFileContents',
                    remediation: 'Reconfigure the token via /setup',
                }),
            );

            await detectFrameworkCascade(mockProvider, 'main');

            expect(warn).toHaveBeenCalledTimes(1);
            expect(vi.mocked(warn).mock.calls[0]?.[0]).toContain('Reconfigure the token via /setup');
        });

        it('does NOT warn for non-infrastructure ExternalError kinds (notFound falls through to debug)', async () => {
            expect.assertions(2);

            const debugSpy = vi.spyOn(rootLogger, 'debug').mockImplementation(() => undefined);
            mockGetFileContents.mockRejectedValue(
                new ExternalError('notFound', 'missing resource', { operation: 'getFileContents' }),
            );

            const result = await detectFrameworkCascade(mockProvider, 'main');

            expect(warn).not.toHaveBeenCalled();
            expect(result).toStrictEqual({ framework: 'unknown', confidence: 0 });

            debugSpy.mockRestore();
        });
    });
});
