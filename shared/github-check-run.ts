/**
 * GitHub Check Run creation utility.
 *
 * Creates and updates GitHub Check Runs via the Checks API
 * (POST /repos/{owner}/{repo}/check-runs).
 *
 * Uses GITHUB_TOKEN and GITHUB_REPOSITORY environment variables
 * for authentication and targeting.
 */

import { axios } from './deps.js';
import { rootLogger } from './logger.js';

export interface CheckRunConfig {
    /** GitHub token with checks write permission. Default: process.env.GITHUB_TOKEN */
    token?: string;
    /** GitHub repository in format 'owner/repo'. Default: process.env.GITHUB_REPOSITORY */
    repository?: string;
    /** GitHub API base URL. Default: process.env.GITHUB_API_URL || 'https://api.github.com' */
    apiBaseUrl?: string;
}

export interface CheckRunOutput {
    /** Title of the check run output. */
    title: string;
    /** Markdown summary of the check run output. */
    summary: string;
    /** Optional markdown text describing the check run output in detail. */
    text?: string;
}

export interface CreateCheckRunParams {
    /** Name of the check run (displayed in the Checks tab). */
    name: string;
    /** SHA of the commit to create the check run for. Default: process.env.GITHUB_SHA */
    headSha?: string;
    /** Check run status. */
    status: 'queued' | 'in_progress' | 'completed';
    /** Required when status is 'completed'. */
    conclusion?: 'success' | 'failure' | 'neutral' | 'cancelled' | 'timed_out' | 'action_required';
    /** Check run output. */
    output?: CheckRunOutput;
    /** URL to link from the check run. */
    detailsUrl?: string;
}

/**
 * Creates a GitHub Check Run for a commit.
 *
 * @param params - Check run parameters
 * @param config - Optional config overrides
 * @returns The API response object with id, or null on failure
 */
export async function createCheckRun(
    params: CreateCheckRunParams,
    config: CheckRunConfig = {},
): Promise<{ id: number; html_url: string } | null> {
    const env = process.env as Record<string, string | undefined>;
    const token = config.token ?? env['GITHUB_TOKEN'];
    const repository = config.repository ?? env['GITHUB_REPOSITORY'];
    const headSha = params.headSha ?? env['GITHUB_SHA'];
    const apiBaseUrl = config.apiBaseUrl ?? env['GITHUB_API_URL'] ?? 'https://api.github.com';

    if (!token) {
        rootLogger.debug('Skipping Check Run: GITHUB_TOKEN not set');
        return null;
    }

    if (!repository) {
        rootLogger.debug('Skipping Check Run: GITHUB_REPOSITORY not set');
        return null;
    }

    if (!headSha) {
        rootLogger.debug('Skipping Check Run: GITHUB_SHA not set');
        return null;
    }

    const url = `${apiBaseUrl}/repos/${repository}/check-runs`;

    const body: Record<string, unknown> = {
        name: params.name,
        head_sha: headSha,
        status: params.status,
    };

    if (params.conclusion) {
        body['conclusion'] = params.conclusion;
    }

    if (params.output) {
        body['output'] = params.output;
    }

    if (params.detailsUrl) {
        body['details_url'] = params.detailsUrl;
    }

    try {
        const response = await axios.post(url, body, {
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
                Accept: 'application/vnd.github.v3+json',
            },
            timeout: 15000,
        });
        const data = response.data as { id: number; html_url: string };

        rootLogger.info(`Check Run created: "${params.name}" (id=${data.id})`);
        return {
            id: data.id,
            html_url: data.html_url,
        };
    } catch (err) {
        const status =
            err && typeof err === 'object' && 'response' in err
                ? (err as { response?: { status?: number } }).response?.status
                : undefined;
        // D3 FIX: Add context about PAT limitations for Check Runs.
        // GitHub Checks API requires `checks:write` permission.
        // GITHUB_TOKEN (CI) has this by default. PATs need it explicitly.
        const hint =
            status === 403
                ? ' (Check Runs require checks:write permission — GITHUB_TOKEN in CI has this, but PATs may not)'
                : '';
        rootLogger.error(
            `Failed to create Check Run (HTTP ${status ?? 'error'}): ${err instanceof Error ? err.message : String(err)}${hint}`,
        );
        return null;
    }
}
