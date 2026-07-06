import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { CiEnvironment } from '../git-provider-factory.js';
import { createGitProvider } from '../git-provider-factory.js';

vi.mock('../gitlab_manager.js', () => {
    const MockGitLab = vi.fn().mockImplementation(function MockGitLab(id: string, token: string, baseUrl: string) {
        return { provider: 'gitlab', projectId: id, token, baseUrl };
    });
    return { default: MockGitLab };
});

vi.mock('../github_manager.js', () => {
    const MockGitHub = vi.fn().mockImplementation(function MockGitHub(repo: string, token: string) {
        return { provider: 'github', repo, token };
    });
    return { default: MockGitHub };
});

const GitLabManager = (await import('../gitlab_manager.js')).default;

function makeCiEnv(overrides: Partial<CiEnvironment> = {}): CiEnvironment {
    return {
        isCI: true,
        repo: 'owner/repo',
        runId: '1',
        ...overrides,
    };
}

describe('CreateGitProvider', () => {
    const originalEnv = { ...process.env };

    beforeEach(() => {
        process.env = { ...originalEnv };
        delete process.env['CI_JOB_TOKEN'];
        delete process.env['CI_PROJECT_ID'];
        delete process.env['GITHUB_TOKEN'];
        delete process.env['CI_SERVER_URL'];
    });

    afterEach(() => {
        process.env = { ...originalEnv };
    });

    it('returns undefined when ciEnv.isCI is false', () => {
        expect.hasAssertions();

        const result = createGitProvider(makeCiEnv({ isCI: false }));

        expect(result).toBeUndefined();
    });

    it('returns undefined when no tokens are configured', () => {
        expect.hasAssertions();

        const result = createGitProvider(makeCiEnv());

        expect(result).toBeUndefined();
    });

    it('returns undefined when CI_JOB_TOKEN is set but CI_PROJECT_ID is missing', () => {
        expect.hasAssertions();

        process.env['CI_JOB_TOKEN'] = 'gl-token-123';

        const result = createGitProvider(makeCiEnv());

        expect(result).toBeUndefined();
    });

    it('creates GitLab provider when CI_JOB_TOKEN and CI_PROJECT_ID are set', () => {
        expect.hasAssertions();

        process.env['CI_JOB_TOKEN'] = 'gl-token-123';
        process.env['CI_PROJECT_ID'] = '12345';

        const result = createGitProvider(makeCiEnv());

        expect(result).toBeDefined();
        expect(result).toHaveProperty('provider', 'gitlab');
    });

    it('creates GitHub provider when GITHUB_TOKEN is set and no GitLab vars', () => {
        expect.hasAssertions();

        process.env['GITHUB_TOKEN'] = 'gh-token-123';

        const result = createGitProvider(makeCiEnv());

        expect(result).toBeDefined();
        expect(result).toHaveProperty('provider', 'github');
    });

    it('uses default GitLab URL when CI_SERVER_URL is absent', () => {
        expect.hasAssertions();

        process.env['CI_JOB_TOKEN'] = 'gl-token-123';
        process.env['CI_PROJECT_ID'] = '12345';

        createGitProvider(makeCiEnv());

        expect(GitLabManager).toHaveBeenCalledWith('12345', 'gl-token-123', 'https://gitlab.com');
    });

    it('prefers GitLab when both tokens are set', () => {
        expect.hasAssertions();

        process.env['CI_JOB_TOKEN'] = 'gl-token-123';
        process.env['CI_PROJECT_ID'] = '12345';
        process.env['GITHUB_TOKEN'] = 'gh-token-123';

        const result = createGitProvider(makeCiEnv());

        expect(result).toBeDefined();
        expect(result).toHaveProperty('provider', 'gitlab');
    });
});
