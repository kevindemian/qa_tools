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
import { extractErrorMessage } from './prompt-errors.js';
import type { CheckRunAnnotation } from './types/ci-cd.js';

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

/** A GitHub Check Run item fetched from the API. */
export interface GitHubCheckRun {
    id: number;
    name: string;
    status: string;
    conclusion?: string | undefined;
    annotations?: CheckRunAnnotation[];
}

/** GitHub API response for check runs list. */
interface CheckRunsResponse {
    check_runs?: Array<{
        id: number;
        name: string;
        status: string;
        conclusion?: string;
    }>;
    total_count?: number;
}

/** GitHub API response for annotations list. */
interface AnnotationResponse {
    path: string;
    start_line: number;
    end_line: number;
    message: string;
    annotation_level: string;
}

/** Extract HTTP status from error-like object. */
function getErrorStatus(err: unknown): number | undefined {
    try {
        const errObj = err as { response?: { status?: number } };
        return errObj.response?.status;
    } catch (innerErr) {
        rootLogger.debug(`getErrorStatus: ${extractErrorMessage(innerErr)}`);
        return undefined;
    }
}

/** Type guard for Error objects. */
function isError(err: unknown): err is Error {
    try {
        const errObj = err as { message?: unknown };
        return errObj.message !== undefined;
    } catch (innerErr) {
        rootLogger.debug(`isError: ${extractErrorMessage(innerErr)}`);
        return false;
    }
}

/** Get environment variable value. */
function getEnv(key: string): string | undefined {
    return process.env[key];
}

/**
 * Fetches Check Runs for a given commit SHA.
 *
 * @param commitSha - The commit SHA to fetch check runs for
 * @param config - Optional config overrides
 * @returns Array of check runs, or empty array on failure
 */
export async function getCheckRuns(commitSha: string, config: CheckRunConfig = {}): Promise<GitHubCheckRun[]> {
    if (process.env['VITEST']) return [];
    const token = config.token ?? getEnv('GITHUB_TOKEN');
    const repository = config.repository ?? getEnv('GITHUB_REPOSITORY');
    const apiBaseUrl = config.apiBaseUrl ?? getEnv('GITHUB_API_URL') ?? 'https://api.github.com';

    if (!token || !repository) {
        rootLogger.debug(`Skipping getCheckRuns: ${!token ? 'GITHUB_TOKEN' : 'GITHUB_REPOSITORY'} not set`);
        return [];
    }

    try {
        const allCheckRuns = await fetchAllCheckRuns(commitSha, token, repository, apiBaseUrl, config);
        rootLogger.debug(`Fetched ${allCheckRuns.length} check runs for ${commitSha}`);
        return allCheckRuns;
    } catch (err) {
        const status = getErrorStatus(err);
        rootLogger.debug(
            `getCheckRuns failed (HTTP ${status ?? 'error'}): ${isError(err) ? err.message : String(err)}`,
        );
        return [];
    }
}

async function fetchAllCheckRuns(
    commitSha: string,
    token: string,
    repository: string,
    apiBaseUrl: string,
    _config: CheckRunConfig,
): Promise<GitHubCheckRun[]> {
    const url = `${apiBaseUrl}/repos/${repository}/check-runs`;
    const allCheckRuns: GitHubCheckRun[] = [];
    let page = 1;

    for (;;) {
        const response = await axios.get(url, {
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: 'application/vnd.github.v3+json',
            },
            params: { head_sha: commitSha, per_page: 100, page },
            timeout: 15000,
        });

        const data = response.data as CheckRunsResponse;
        const checkRuns = data.check_runs ?? [];

        for (const cr of checkRuns) {
            const checkRun: GitHubCheckRun = {
                id: cr.id,
                name: cr.name,
                status: cr.status,
                conclusion: cr.conclusion,
            };

            const annotations = await fetchCheckRunAnnotations(cr.id, token, apiBaseUrl, repository);
            if (annotations.length > 0) {
                checkRun.annotations = annotations;
            }

            allCheckRuns.push(checkRun);
        }

        const totalCount = data.total_count ?? 0;
        if (allCheckRuns.length >= totalCount || checkRuns.length < 100) {
            break;
        }
        page++;
    }

    return allCheckRuns;
}

/**
 * Fetches annotations for a specific check run.
 */
async function fetchCheckRunAnnotations(
    checkRunId: number,
    token: string,
    apiBaseUrl: string,
    repository: string,
): Promise<CheckRunAnnotation[]> {
    const url = `${apiBaseUrl}/repos/${repository}/check-runs/${checkRunId}/annotations`;
    let page = 1;
    const allAnnotations: CheckRunAnnotation[] = [];

    try {
        for (;;) {
            const response = await axios.get(url, {
                headers: {
                    Authorization: `Bearer ${token}`,
                    Accept: 'application/vnd.github.v3+json',
                },
                params: { per_page: 100, page },
                timeout: 15000,
            });

            const annotations = response.data as AnnotationResponse[];
            for (const a of annotations) {
                allAnnotations.push({
                    path: a.path,
                    start_line: a.start_line,
                    end_line: a.end_line,
                    message: a.message,
                    annotation_level: a.annotation_level,
                });
            }

            if (annotations.length < 100) {
                break;
            }
            page++;
        }
    } catch (err) {
        rootLogger.debug(`fetchCheckRunAnnotations failed for check run ${checkRunId}: ${String(err)}`);
    }

    return allAnnotations;
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
    if (process.env['VITEST']) return null;
    const token = config.token ?? getEnv('GITHUB_TOKEN');
    const repository = config.repository ?? getEnv('GITHUB_REPOSITORY');
    const headSha = params.headSha ?? getEnv('GITHUB_SHA');
    const apiBaseUrl = config.apiBaseUrl ?? getEnv('GITHUB_API_URL') ?? 'https://api.github.com';

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

    const body: {
        name: string;
        head_sha: string;
        status: string;
        conclusion?: string;
        output?: CheckRunOutput;
        details_url?: string;
    } = {
        name: params.name,
        head_sha: headSha,
        status: params.status,
    };

    if (params.conclusion) {
        body.conclusion = params.conclusion;
    }

    if (params.output) {
        body.output = params.output;
    }

    if (params.detailsUrl) {
        body.details_url = params.detailsUrl;
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
        const status = getErrorStatus(err);
        const hint =
            status === 403
                ? ' (Check Runs require checks:write permission — GITHUB_TOKEN in CI has this, but PATs may not)'
                : '';
        rootLogger.error(
            `Failed to create Check Run (HTTP ${status ?? 'error'}): ${isError(err) ? err.message : String(err)}${hint}`,
        );
        return null;
    }
}
