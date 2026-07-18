import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../config-accessor.js', () => ({
    default: {
        get: vi.fn(),
    },
}));

const { default: config } = await import('../config-accessor.js');

describe('IsGitHubCi', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns true when githubToken and GITHUB_REPOSITORY are set', async () => {
        expect.hasAssertions();

        vi.spyOn(config, 'get').mockImplementation((key: string) => {
            if (key === 'githubToken') return 'gh_token_abc';
            if (key === 'GITHUB_REPOSITORY') return 'owner/repo';
            return undefined;
        });

        const { isGitHubCi } = await import('../ci/ci-detect.js');

        expect(isGitHubCi()).toBeTruthy();
    });

    it('returns false when githubToken is missing', async () => {
        expect.hasAssertions();

        vi.spyOn(config, 'get').mockImplementation((key: string) => {
            if (key === 'GITHUB_REPOSITORY') return 'owner/repo';
            return undefined;
        });

        const { isGitHubCi } = await import('../ci/ci-detect.js');

        expect(isGitHubCi()).toBeFalsy();
    });

    it('returns false when GITHUB_REPOSITORY is missing', async () => {
        expect.hasAssertions();

        vi.spyOn(config, 'get').mockImplementation((key: string) => {
            if (key === 'githubToken') return 'gh_token_abc';
            return undefined;
        });

        const { isGitHubCi } = await import('../ci/ci-detect.js');

        expect(isGitHubCi()).toBeFalsy();
    });

    it('returns false when both are missing', async () => {
        expect.hasAssertions();

        vi.spyOn(config, 'get').mockReturnValue(undefined);

        const { isGitHubCi } = await import('../ci/ci-detect.js');

        expect(isGitHubCi()).toBeFalsy();
    });
});

describe('IsGitLabCi', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns true when CI_JOB_TOKEN and CI_PROJECT_ID are set', async () => {
        expect.hasAssertions();

        vi.spyOn(config, 'get').mockImplementation((key: string) => {
            if (key === 'CI_JOB_TOKEN') return 'gl_token_xyz';
            if (key === 'CI_PROJECT_ID') return '12345';
            return undefined;
        });

        const { isGitLabCi } = await import('../ci/ci-detect.js');

        expect(isGitLabCi()).toBeTruthy();
    });

    it('returns false when CI_JOB_TOKEN is missing', async () => {
        expect.hasAssertions();

        vi.spyOn(config, 'get').mockImplementation((key: string) => {
            if (key === 'CI_PROJECT_ID') return '12345';
            return undefined;
        });

        const { isGitLabCi } = await import('../ci/ci-detect.js');

        expect(isGitLabCi()).toBeFalsy();
    });

    it('returns false when CI_PROJECT_ID is missing', async () => {
        expect.hasAssertions();

        vi.spyOn(config, 'get').mockImplementation((key: string) => {
            if (key === 'CI_JOB_TOKEN') return 'gl_token_xyz';
            return undefined;
        });

        const { isGitLabCi } = await import('../ci/ci-detect.js');

        expect(isGitLabCi()).toBeFalsy();
    });

    it('returns false when both are missing', async () => {
        expect.hasAssertions();

        vi.spyOn(config, 'get').mockReturnValue(undefined);

        const { isGitLabCi } = await import('../ci/ci-detect.js');

        expect(isGitLabCi()).toBeFalsy();
    });
});

describe('Constants', () => {
    it('exports GIT_HISTORY_RUNS', async () => {
        expect.hasAssertions();

        const { GIT_HISTORY_RUNS } = await import('../ci/ci-detect.js');

        expect(GIT_HISTORY_RUNS).toBe(5);
    });
});
