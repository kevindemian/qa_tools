/**
 * GitHub PR comment posting utility.
 *
 * Posts markdown comments to GitHub Pull Requests using the Issues API
 * (POST /repos/{owner}/{repo}/issues/{issue_number}/comments).
 *
 * Uses GITHUB_TOKEN, GITHUB_REPOSITORY, and GITHUB_PR_NUMBER
 * environment variables for authentication and targeting.
 */

import { axios } from './deps.js';
import { rootLogger } from './logger.js';

export interface PrCommentConfig {
    /** GitHub token with PR write permission. Default: process.env.GITHUB_TOKEN */
    token?: string;
    /** GitHub repository in format 'owner/repo'. Default: process.env.GITHUB_REPOSITORY */
    repository?: string;
    /** PR number. Default: parseInt(process.env.GITHUB_PR_NUMBER, 10) */
    prNumber?: number;
    /** GitHub API base URL. Default: process.env.GITHUB_API_URL || 'https://api.github.com' */
    apiBaseUrl?: string;
}

/**
 * Extracts PR number from available context sources.
 */
function resolvePrNumber(config: PrCommentConfig): number | undefined {
    if (config.prNumber !== undefined) return config.prNumber;
    const penv = process.env as Record<string, string | undefined>;
    const env = penv['GITHUB_PR_NUMBER'] || penv['CI_PR_NUMBER'];
    if (env) {
        const parsed = Number(env);
        if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
    return undefined;
}

/**
 * Extracts repository owner/name from environment.
 */
function resolveRepository(config: PrCommentConfig): string | undefined {
    if (config.repository) return config.repository;
    return (process.env as Record<string, string | undefined>)['GITHUB_REPOSITORY'];
}

/**
 * Posts a markdown comment to the specified PR.
 *
 * @param body - Markdown content of the comment
 * @param config - Optional config overrides
 * @returns The API response object, or null if posting was skipped/disabled
 */
export async function postPrComment(
    body: string,
    config: PrCommentConfig = {},
): Promise<{ id: number; html_url: string } | null> {
    const penv = process.env as Record<string, string | undefined>;
    const token = config.token ?? penv['GITHUB_TOKEN'];
    const repository = resolveRepository(config);
    const prNumber = resolvePrNumber(config);
    const apiBaseUrl = config.apiBaseUrl ?? penv['GITHUB_API_URL'] ?? 'https://api.github.com';

    if (!token) {
        rootLogger.debug('Skipping PR comment: GITHUB_TOKEN not set');
        return null;
    }

    if (!repository) {
        rootLogger.debug('Skipping PR comment: GITHUB_REPOSITORY not set');
        return null;
    }

    if (!prNumber) {
        rootLogger.debug('Skipping PR comment: GITHUB_PR_NUMBER not set');
        return null;
    }

    const url = `${apiBaseUrl}/repos/${repository}/issues/${prNumber}/comments`;

    try {
        const response = await axios.post(
            url,
            { body },
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                    Accept: 'application/vnd.github.v3+json',
                },
                timeout: 15000,
            },
        );
        const data = response.data as { id: number; html_url: string };

        rootLogger.info(`PR comment posted: #${prNumber} (id=${data.id})`);
        return {
            id: data.id,
            html_url: data.html_url,
        };
    } catch (err) {
        const status =
            err && typeof err === 'object' && 'response' in err
                ? (err as { response?: { status?: number } }).response?.status
                : undefined;
        rootLogger.error(
            `Failed to post PR comment (HTTP ${status ?? 'error'}): ${err instanceof Error ? err.message : String(err)}`,
        );
        return null;
    }
}
