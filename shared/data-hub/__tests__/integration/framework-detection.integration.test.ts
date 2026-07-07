import { describe, it, expect, vi } from 'vitest';
import { detectFrameworkFromAPI } from '../../../framework-detection.js';
import type { GitProvider } from '../../../types/ci-cd.js';

/**
 * Integration-style tests for the full framework detection flow.
 * Mocks the GitProvider at the interface level but exercises
 * the full detection pipeline end-to-end.
 */
describe('Framework Detection Integration', () => {
    function createMockProvider(overrides?: Partial<GitProvider>): GitProvider {
        const base: GitProvider = {
            triggerPipeline: vi.fn(),
            getSchedules: vi.fn().mockResolvedValue([]),
            runSchedule: vi.fn(),
            createMergeRequest: vi.fn(),
            updateMergeRequest: vi.fn(),
            getMergeRequest: vi.fn(),
            searchMergeRequests: vi.fn(),
            acceptMergeRequest: vi.fn(),
            isApproved: vi.fn(),
            getCICDVariables: vi.fn(),
            getRecentPipelines: vi.fn().mockResolvedValue([]),
            getBranch: vi.fn(),
            getPipeline: vi.fn(),
            getPipelineJobs: vi.fn(),
            listPipelineArtifacts: vi.fn(),
            downloadArtifact: vi.fn(),
            getJobLogs: vi.fn(),
            getDiff: vi.fn(),
            getWorkflowRunTiming: vi.fn(),
            getFileContents: vi.fn(),
            listDirectory: vi.fn(),
            provider: 'github',
        };
        return { ...base, ...overrides };
    }

    it('detects vitest from package.json via Contents API', async () => {
        expect.hasAssertions();

        const mockProvider = createMockProvider({
            getFileContents: vi
                .fn<(...args: [path: string, ref?: string]) => Promise<string | null>>()
                .mockResolvedValue(JSON.stringify({ devDependencies: { vitest: '1.0.0' } })),
        });

        const result = await detectFrameworkFromAPI(mockProvider, 'main');

        expect(result).toStrictEqual({ framework: 'vitest', confidence: 0.9 });
        expect(mockProvider.getFileContents).toHaveBeenCalledWith('package.json', 'main');
    });

    it('detects jest with multiple dependencies', async () => {
        expect.hasAssertions();

        const mockProvider = createMockProvider({
            getFileContents: vi
                .fn<(...args: [path: string, ref?: string]) => Promise<string | null>>()
                .mockResolvedValue(
                    JSON.stringify({
                        dependencies: { react: '18.0.0' },
                        devDependencies: { jest: '29.0.0', '@types/jest': '29.0.0' },
                    }),
                ),
        });

        const result = await detectFrameworkFromAPI(mockProvider, 'develop');

        expect(result).toStrictEqual({ framework: 'jest', confidence: 0.9 });
    });

    it('returns unknown when package.json has no test framework', async () => {
        expect.hasAssertions();

        const mockProvider = createMockProvider({
            getFileContents: vi
                .fn<(...args: [path: string, ref?: string]) => Promise<string | null>>()
                .mockResolvedValue(JSON.stringify({ dependencies: { express: '4.18.0' } })),
        });

        const result = await detectFrameworkFromAPI(mockProvider, 'main');

        expect(result).toStrictEqual({ framework: 'unknown', confidence: 0 });
    });

    it('returns unknown when package.json is missing entirely', async () => {
        expect.hasAssertions();

        const mockProvider = createMockProvider({
            getFileContents: vi
                .fn<(...args: [path: string, ref?: string]) => Promise<string | null>>()
                .mockResolvedValue(null),
        });

        const result = await detectFrameworkFromAPI(mockProvider, 'main');

        expect(result).toStrictEqual({ framework: 'unknown', confidence: 0 });
    });

    it('handles API errors gracefully', async () => {
        expect.hasAssertions();

        const mockProvider = createMockProvider({
            getFileContents: vi
                .fn<(...args: [path: string, ref?: string]) => Promise<string | null>>()
                .mockRejectedValue(new Error('Network error')),
        });

        const result = await detectFrameworkFromAPI(mockProvider, 'main');

        expect(result).toStrictEqual({ framework: 'unknown', confidence: 0 });
    });
});
