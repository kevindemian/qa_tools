import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../shared/logger.js', () => ({
    rootLogger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
    Logger: vi.fn().mockImplementation(() => ({
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
        child: vi.fn().mockReturnThis(),
    })),
}));

vi.mock('../gitlab_manager.js', () => ({
    default: vi.fn().mockImplementation(function MockGitLab() {
        return { provider: 'gitlab' };
    }),
}));

vi.mock('../github_manager.js', () => ({
    default: vi.fn().mockImplementation(function MockGitHub() {
        return { provider: 'github' };
    }),
}));

describe('PrReportEntry — factory type safety', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        delete process.env['CI_JOB_TOKEN'];
        delete process.env['CI_PROJECT_ID'];
        delete process.env['GITHUB_TOKEN'];
    });

    it('createGitProvider returns Promise<GitProvider> (not synchronous)', async () => {
        expect.hasAssertions();

        process.env['GITHUB_TOKEN'] = 'gh-token';

        const { createGitProvider } = await import('../git-provider-factory.js');

        const result = await createGitProvider({
            isCI: true,
            repo: 'owner/repo',
            branch: 'main',
            commit: 'abc',
            runId: '1',
            isPullRequest: false,
        });

        expect(result).toBeDefined();
        expect(result).toHaveProperty('provider', 'github');
    });

    it('createGitProvider returns undefined when isCI=false', async () => {
        expect.hasAssertions();

        const { createGitProvider } = await import('../git-provider-factory.js');

        const result = await createGitProvider({
            isCI: false,
            repo: '',
            branch: '',
            commit: '',
            runId: '',
            isPullRequest: false,
        });

        expect(result).toBeUndefined();
    });

    it('createGitProvider returns undefined when no tokens', async () => {
        expect.hasAssertions();

        const { createGitProvider } = await import('../git-provider-factory.js');

        const result = await createGitProvider({
            isCI: true,
            repo: 'owner/repo',
            branch: 'main',
            commit: 'abc',
            runId: '1',
            isPullRequest: false,
        });

        expect(result).toBeUndefined();
    });
});
