import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isManifestFile, detectFrameworkFromDeps, detectFrameworkFromAPI } from '../framework-detection.js';
import type { GitProvider } from '../types/ci-cd.js';

describe('IsManifestFile', () => {
    it.each([
        { name: 'package.json at root', file: 'package.json' },
        { name: 'package.json in subdirectory', file: 'packages/a/package.json' },
        { name: 'requirements.txt', file: 'requirements.txt' },
        { name: 'pyproject.toml', file: 'pyproject.toml' },
        { name: 'Gemfile', file: 'Gemfile' },
        { name: 'pom.xml', file: 'pom.xml' },
        { name: 'go.mod', file: 'go.mod' },
        { name: 'Cargo.toml', file: 'Cargo.toml' },
        { name: 'composer.json', file: 'composer.json' },
        { name: 'build.gradle', file: 'build.gradle' },
        { name: 'build.gradle.kts', file: 'build.gradle.kts' },
        { name: '.csproj files', file: 'MyApp.csproj' },
    ])('detects $name', ({ file }) => {
        expect.hasAssertions();
        expect(isManifestFile(file)).toBeTruthy();
    });

    it.each([
        { name: 'README.md', file: 'README.md' },
        { name: 'src/index.ts', file: 'src/index.ts' },
        { name: '.gitignore', file: '.gitignore' },
        { name: 'package-lock.json', file: 'package-lock.json' },
    ])('rejects $name', ({ file }) => {
        expect.hasAssertions();
        expect(isManifestFile(file)).toBeFalsy();
    });
});

describe('DetectFrameworkFromDeps', () => {
    it('detects vitest from dependencies', () => {
        expect.hasAssertions();

        const result = detectFrameworkFromDeps({ vitest: '1.0.0' });

        expect(result).toStrictEqual({ framework: 'vitest', confidence: 0.9 });
    });

    it('detects vitest from devDependencies', () => {
        expect.hasAssertions();

        const result = detectFrameworkFromDeps({ vitest: '2.0.0' });

        expect(result).toStrictEqual({ framework: 'vitest', confidence: 0.9 });
    });

    it('detects jest', () => {
        expect.hasAssertions();

        const result = detectFrameworkFromDeps({ jest: '29.0.0' });

        expect(result).toStrictEqual({ framework: 'jest', confidence: 0.9 });
    });

    it('detects playwright', () => {
        expect.hasAssertions();

        const result = detectFrameworkFromDeps({ '@playwright/test': '1.40.0' });

        expect(result).toStrictEqual({ framework: 'playwright', confidence: 0.95 });
    });

    it('detects cypress', () => {
        expect.hasAssertions();

        const result = detectFrameworkFromDeps({ cypress: '13.0.0' });

        expect(result).toStrictEqual({ framework: 'cypress', confidence: 0.95 });
    });

    it('detects mocha', () => {
        expect.hasAssertions();

        const result = detectFrameworkFromDeps({ mocha: '10.0.0' });

        expect(result).toStrictEqual({ framework: 'mocha', confidence: 0.8 });
    });

    it('detects pytest', () => {
        expect.hasAssertions();

        const result = detectFrameworkFromDeps({ pytest: '7.0.0' });

        expect(result).toStrictEqual({ framework: 'pytest', confidence: 0.8 });
    });

    it('returns unknown when no framework found', () => {
        expect.hasAssertions();

        const result = detectFrameworkFromDeps({ express: '4.18.0' });

        expect(result).toStrictEqual({ framework: 'unknown', confidence: 0 });
    });

    it('returns unknown for empty deps', () => {
        expect.hasAssertions();

        const result = detectFrameworkFromDeps({});

        expect(result).toStrictEqual({ framework: 'unknown', confidence: 0 });
    });
});

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

describe('DetectFrameworkFromAPI', () => {
    let mockProvider: GitProvider;
    let mockGetFileContents: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        mockProvider = createMockGitProvider();
        mockGetFileContents = vi.mocked(mockProvider.getFileContents);
    });

    it('detects vitest from package.json via API', async () => {
        expect.hasAssertions();

        mockGetFileContents.mockResolvedValue(JSON.stringify({ devDependencies: { vitest: '1.0.0' } }));
        const result = await detectFrameworkFromAPI(mockProvider, 'main');

        expect(result).toStrictEqual({ framework: 'vitest', confidence: 0.9 });
    });

    it('returns unknown when package.json not found', async () => {
        expect.hasAssertions();

        mockGetFileContents.mockResolvedValue(null);
        const result = await detectFrameworkFromAPI(mockProvider, 'main');

        expect(result).toStrictEqual({ framework: 'unknown', confidence: 0 });
    });

    it('returns unknown on invalid JSON', async () => {
        expect.hasAssertions();

        mockGetFileContents.mockResolvedValue('not valid json');
        const result = await detectFrameworkFromAPI(mockProvider, 'main');

        expect(result).toStrictEqual({ framework: 'unknown', confidence: 0 });
    });

    it('propagates API error instead of swallowing it', async () => {
        expect.hasAssertions();

        mockGetFileContents.mockRejectedValue(new Error('API error'));

        await expect(detectFrameworkFromAPI(mockProvider, 'main')).rejects.toThrow('API error');
    });
});
