import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isManifestFile, detectFrameworkFromDeps, detectFrameworkFromAPI } from '../framework-detection.js';
import type { GitProvider } from '../types/ci-cd.js';

describe('IsManifestFile', () => {
    it('detects package.json at root', () => {
        expect.hasAssertions();
        expect(isManifestFile('package.json')).toBeTruthy();
    });

    it('detects package.json in subdirectory', () => {
        expect.hasAssertions();
        expect(isManifestFile('packages/a/package.json')).toBeTruthy();
    });

    it('detects requirements.txt', () => {
        expect.hasAssertions();
        expect(isManifestFile('requirements.txt')).toBeTruthy();
    });

    it('detects pyproject.toml', () => {
        expect.hasAssertions();
        expect(isManifestFile('pyproject.toml')).toBeTruthy();
    });

    it('detects Gemfile', () => {
        expect.hasAssertions();
        expect(isManifestFile('Gemfile')).toBeTruthy();
    });

    it('detects pom.xml', () => {
        expect.hasAssertions();
        expect(isManifestFile('pom.xml')).toBeTruthy();
    });

    it('detects go.mod', () => {
        expect.hasAssertions();
        expect(isManifestFile('go.mod')).toBeTruthy();
    });

    it('detects Cargo.toml', () => {
        expect.hasAssertions();
        expect(isManifestFile('Cargo.toml')).toBeTruthy();
    });

    it('detects composer.json', () => {
        expect.hasAssertions();
        expect(isManifestFile('composer.json')).toBeTruthy();
    });

    it('detects build.gradle', () => {
        expect.hasAssertions();
        expect(isManifestFile('build.gradle')).toBeTruthy();
    });

    it('detects build.gradle.kts', () => {
        expect.hasAssertions();
        expect(isManifestFile('build.gradle.kts')).toBeTruthy();
    });

    it('detects .csproj files', () => {
        expect.hasAssertions();
        expect(isManifestFile('MyApp.csproj')).toBeTruthy();
    });

    it('rejects non-manifest files', () => {
        expect.hasAssertions();
        expect(isManifestFile('README.md')).toBeFalsy();
        expect(isManifestFile('src/index.ts')).toBeFalsy();
        expect(isManifestFile('.gitignore')).toBeFalsy();
    });

    it('rejects package-lock.json', () => {
        expect.hasAssertions();
        expect(isManifestFile('package-lock.json')).toBeFalsy();
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
