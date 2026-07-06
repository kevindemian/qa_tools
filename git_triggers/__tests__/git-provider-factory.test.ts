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

function makeCiEnv(overrides: Partial<CiEnvironment> = {}): CiEnvironment {
    return {
        isCI: true,
        repo: 'owner/repo',
        branch: 'main',
        commit: 'abc123',
        runId: '1',
        runUrl: 'https://example.com',
        isPullRequest: false,
        ...overrides,
    };
}

describe('CreateGitProvider', () => {
    const originalEnv = { ...process.env };

    beforeEach(() => {
        vi.resetModules();
        process.env = { ...originalEnv };
        delete process.env['CI_JOB_TOKEN'];
        delete process.env['CI_PROJECT_ID'];
        delete process.env['GITHUB_TOKEN'];
        delete process.env['CI_SERVER_URL'];
    });

    afterEach(() => {
        process.env = { ...originalEnv };
    });

    it('returns undefined when ciEnv.isCI is false', async () => {
        expect.hasAssertions();

        const result = await createGitProvider(makeCiEnv({ isCI: false }));

        expect(result).toBeUndefined();
    });

    it('returns undefined when no tokens are configured', async () => {
        expect.hasAssertions();

        const result = await createGitProvider(makeCiEnv());

        expect(result).toBeUndefined();
    });

    it('returns undefined when CI_JOB_TOKEN is set but CI_PROJECT_ID is missing', async () => {
        expect.hasAssertions();

        process.env['CI_JOB_TOKEN'] = 'gl-token-123';

        const result = await createGitProvider(makeCiEnv());

        expect(result).toBeUndefined();
    });

    it('creates GitLab provider when CI_JOB_TOKEN and CI_PROJECT_ID are set', async () => {
        expect.hasAssertions();

        process.env['CI_JOB_TOKEN'] = 'gl-token-123';
        process.env['CI_PROJECT_ID'] = '12345';

        const result = await createGitProvider(makeCiEnv());

        expect(result).toBeDefined();
        expect(result).toHaveProperty('provider', 'gitlab');
    });

    it('creates GitHub provider when GITHUB_TOKEN is set and no GitLab vars', async () => {
        expect.hasAssertions();

        process.env['GITHUB_TOKEN'] = 'gh-token-123';

        const result = await createGitProvider(makeCiEnv());

        expect(result).toBeDefined();
        expect(result).toHaveProperty('provider', 'github');
    });

    it('uses default GitLab URL when CI_SERVER_URL is absent', async () => {
        expect.hasAssertions();

        process.env['CI_JOB_TOKEN'] = 'gl-token-123';
        process.env['CI_PROJECT_ID'] = '12345';

        const GitLabManager = (await import('../gitlab_manager.js')).default;

        await createGitProvider(makeCiEnv());

        expect(GitLabManager).toHaveBeenCalledWith('12345', 'gl-token-123', 'https://gitlab.com');
    });

    it('prefers GitLab when both tokens are set', async () => {
        expect.hasAssertions();

        process.env['CI_JOB_TOKEN'] = 'gl-token-123';
        process.env['CI_PROJECT_ID'] = '12345';
        process.env['GITHUB_TOKEN'] = 'gh-token-123';

        const result = await createGitProvider(makeCiEnv());

        expect(result).toBeDefined();
        expect(result).toHaveProperty('provider', 'gitlab');
    });
});
