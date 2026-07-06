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
export function createGitProvider(ciEnv: CiEnvironment): Promise<GitProvider | undefined> {
    if (!ciEnv.isCI) return Promise.resolve(undefined);

    const gitlabToken = process.env['CI_JOB_TOKEN'];
    const gitlabProjectId = process.env['CI_PROJECT_ID'];
    const isGitLab = !!(gitlabToken && gitlabProjectId);

    const githubToken = process.env['GITHUB_TOKEN'];
    const isGitHub = !!githubToken && !isGitLab;

    if (!isGitLab && !isGitHub) return Promise.resolve(undefined);

    if (isGitLab && gitlabProjectId && gitlabToken) {
        const gitlabBaseUrl = process.env['CI_SERVER_URL'] ?? 'https://gitlab.com';
        return import('./gitlab_manager.js').then(
            ({ default: GitLabManager }) => new GitLabManager(gitlabProjectId, gitlabToken, gitlabBaseUrl),
        );
    } else if (githubToken) {
        return import('./github_manager.js').then(
            ({ default: GitHubManager }) => new GitHubManager(ciEnv.repo, githubToken),
        );
    }

    return Promise.resolve(undefined);
}
