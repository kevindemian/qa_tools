import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isManifestFile, detectFrameworkFromDeps, detectFrameworkFromAPI } from '../framework-detection.js';
import type { GitProvider } from '../types/ci-cd.js';

describe('IsManifestFile', () => {
    it('detects package.json at root', () => {
        expect.hasAssertions();
        expect(isManifestFile('package.json')).toBe(true);
    });

    it('detects package.json in subdirectory', () => {
        expect.hasAssertions();
        expect(isManifestFile('packages/a/package.json')).toBe(true);
    });

    it('detects requirements.txt', () => {
        expect.hasAssertions();
        expect(isManifestFile('requirements.txt')).toBe(true);
    });

    it('detects pyproject.toml', () => {
        expect.hasAssertions();
        expect(isManifestFile('pyproject.toml')).toBe(true);
    });

    it('detects Gemfile', () => {
        expect.hasAssertions();
        expect(isManifestFile('Gemfile')).toBe(true);
    });

    it('detects pom.xml', () => {
        expect.hasAssertions();
        expect(isManifestFile('pom.xml')).toBe(true);
    });

    it('detects go.mod', () => {
        expect.hasAssertions();
        expect(isManifestFile('go.mod')).toBe(true);
    });

    it('detects Cargo.toml', () => {
        expect.hasAssertions();
        expect(isManifestFile('Cargo.toml')).toBe(true);
    });

    it('detects composer.json', () => {
        expect.hasAssertions();
        expect(isManifestFile('composer.json')).toBe(true);
    });

    it('detects build.gradle', () => {
        expect.hasAssertions();
        expect(isManifestFile('build.gradle')).toBe(true);
    });

    it('detects build.gradle.kts', () => {
        expect.hasAssertions();
        expect(isManifestFile('build.gradle.kts')).toBe(true);
    });

    it('detects .csproj files', () => {
        expect.hasAssertions();
        expect(isManifestFile('MyApp.csproj')).toBe(true);
    });

    it('rejects non-manifest files', () => {
        expect.hasAssertions();
        expect(isManifestFile('README.md')).toBe(false);
        expect(isManifestFile('src/index.ts')).toBe(false);
        expect(isManifestFile('.gitignore')).toBe(false);
    });

    it('rejects package-lock.json', () => {
        expect.hasAssertions();
        expect(isManifestFile('package-lock.json')).toBe(false);
    });
});

describe('DetectFrameworkFromDeps', () => {
    it('detects vitest from dependencies', () => {
        expect.hasAssertions();
        const result = detectFrameworkFromDeps({ vitest: '1.0.0' });
        expect(result).toEqual({ framework: 'vitest', confidence: 0.9 });
    });

    it('detects vitest from devDependencies', () => {
        expect.hasAssertions();
        const result = detectFrameworkFromDeps({ vitest: '2.0.0' });
        expect(result).toEqual({ framework: 'vitest', confidence: 0.9 });
    });

    it('detects jest', () => {
        expect.hasAssertions();
        const result = detectFrameworkFromDeps({ jest: '29.0.0' });
        expect(result).toEqual({ framework: 'jest', confidence: 0.9 });
    });

    it('detects playwright', () => {
        expect.hasAssertions();
        const result = detectFrameworkFromDeps({ '@playwright/test': '1.40.0' });
        expect(result).toEqual({ framework: 'playwright', confidence: 0.95 });
    });

    it('detects cypress', () => {
        expect.hasAssertions();
        const result = detectFrameworkFromDeps({ cypress: '13.0.0' });
        expect(result).toEqual({ framework: 'cypress', confidence: 0.95 });
    });

    it('detects mocha', () => {
        expect.hasAssertions();
        const result = detectFrameworkFromDeps({ mocha: '10.0.0' });
        expect(result).toEqual({ framework: 'mocha', confidence: 0.8 });
    });

    it('detects pytest', () => {
        expect.hasAssertions();
        const result = detectFrameworkFromDeps({ pytest: '7.0.0' });
        expect(result).toEqual({ framework: 'pytest', confidence: 0.8 });
    });

    it('returns unknown when no framework found', () => {
        expect.hasAssertions();
        const result = detectFrameworkFromDeps({ express: '4.18.0' });
        expect(result).toEqual({ framework: 'unknown', confidence: 0 });
    });

    it('returns unknown for empty deps', () => {
        expect.hasAssertions();
        const result = detectFrameworkFromDeps({});
        expect(result).toEqual({ framework: 'unknown', confidence: 0 });
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
        getFileContents: vi.fn<(...args: [path: string, ref?: string]) => Promise<string | null>>(),
        listDirectory: vi.fn(),
        provider: 'github',
    };
}

describe('DetectFrameworkFromAPI', () => {
    let mockProvider: GitProvider;

    beforeEach(() => {
        mockProvider = createMockGitProvider();
    });

    it('detects vitest from package.json via API', async () => {
        expect.hasAssertions();
        (mockProvider.getFileContents as ReturnType<typeof vi.fn>).mockResolvedValue(
            JSON.stringify({ devDependencies: { vitest: '1.0.0' } }),
        );
        const result = await detectFrameworkFromAPI(mockProvider, 'main');
        expect(result).toEqual({ framework: 'vitest', confidence: 0.9 });
    });

    it('returns unknown when package.json not found', async () => {
        expect.hasAssertions();
        (mockProvider.getFileContents as ReturnType<typeof vi.fn>).mockResolvedValue(null);
        const result = await detectFrameworkFromAPI(mockProvider, 'main');
        expect(result).toEqual({ framework: 'unknown', confidence: 0 });
    });

    it('returns unknown on invalid JSON', async () => {
        expect.hasAssertions();
        (mockProvider.getFileContents as ReturnType<typeof vi.fn>).mockResolvedValue('not valid json');
        const result = await detectFrameworkFromAPI(mockProvider, 'main');
        expect(result).toEqual({ framework: 'unknown', confidence: 0 });
    });

    it('returns unknown on API error', async () => {
        expect.hasAssertions();
        (mockProvider.getFileContents as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('API error'));
        const result = await detectFrameworkFromAPI(mockProvider, 'main');
        expect(result).toEqual({ framework: 'unknown', confidence: 0 });
    });
});
