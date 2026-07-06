/**
 * Git Provider Factory
 *
 * Creates GitProvider instances based on CI environment detection.
 * This factory is used by pr-report-core.ts to avoid layer violations.
 */
import type { GitProvider } from '../shared/types/ci-cd.js';
import GitLabManager from './gitlab_manager.js';
import GitHubManager from './github_manager.js';

export interface CiEnvironment {
    isCI: boolean;
    repo: string;
    runId: string;
    serverUrl?: string;
    refName?: string;
}

/**
 * Creates a GitProvider based on the CI environment.
 * Returns undefined if the CI environment cannot be detected.
 */
export function createGitProvider(ciEnv: CiEnvironment): GitProvider | undefined {
    if (!ciEnv.isCI) return undefined;

    const gitlabToken = process.env['CI_JOB_TOKEN'];
    const gitlabProjectId = process.env['CI_PROJECT_ID'];
    const isGitLab = !!(gitlabToken && gitlabProjectId);

    const githubToken = process.env['GITHUB_TOKEN'];
    const isGitHub = !!githubToken && !isGitLab;

    if (!isGitLab && !isGitHub) return undefined;

    if (isGitLab && gitlabProjectId && gitlabToken) {
        const gitlabBaseUrl = process.env['CI_SERVER_URL'] ?? 'https://gitlab.com';
        return new GitLabManager(gitlabProjectId, gitlabToken, gitlabBaseUrl);
    } else if (githubToken) {
        return new GitHubManager(ciEnv.repo, githubToken);
    }

    return undefined;
}
