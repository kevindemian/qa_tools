/**
 * Git Provider Factory
 *
 * Creates GitProvider instances based on CI environment detection.
 * This factory is used by pr-report-core.ts to avoid layer violations.
 */
import type { GitProvider } from '../shared/types/ci-cd.js';

export interface CiEnvironment {
    isCI: boolean;
    repo: string;
    branch: string;
    commit: string;
    runId: string;
    runUrl?: string;
    prNumber?: number;
    prUrl?: string;
    isPullRequest: boolean;
}

/**
 * Creates a GitProvider based on the CI environment.
 * Returns undefined if the CI environment cannot be detected.
 */
export async function createGitProvider(ciEnv: CiEnvironment): Promise<GitProvider | undefined> {
    if (!ciEnv.isCI) return undefined;

    // Detect GitLab CI
    const gitlabToken = process.env['CI_JOB_TOKEN'];
    const gitlabProjectId = process.env['CI_PROJECT_ID'];
    const isGitLab = !!(gitlabToken && gitlabProjectId);

    // Detect GitHub Actions
    const githubToken = process.env['GITHUB_TOKEN'];
    const isGitHub = !!githubToken && !isGitLab;

    if (!isGitLab && !isGitHub) return undefined;

    if (isGitLab && gitlabProjectId && gitlabToken) {
        const { default: GitLabManager } = await import('./gitlab_manager.js');
        const gitlabBaseUrl = process.env['CI_SERVER_URL'] ?? 'https://gitlab.com';
        return new GitLabManager(gitlabProjectId, gitlabToken, gitlabBaseUrl);
    } else if (githubToken) {
        const { default: GitHubManager } = await import('./github_manager.js');
        return new GitHubManager(ciEnv.repo, githubToken);
    }

    return undefined;
}
