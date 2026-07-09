/**
 * Commit log — SSOT for commit messages from CI workflow runs.
 *
 * Used by:
 *   1. DataHub providers (GitHub/GitLab) — populate RawData.commitLog
 *   2. case17 — git pipeline context section
 *
 * Replaces the commit-log logic previously in git-artifact-downloader.ts.
 */
import Config from './config.js';
import { createHttpClient } from './http-client.js';
import { rootLogger } from './logger.js';
import { isGitHubCi, isGitLabCi, GIT_HISTORY_RUNS } from './ci-detect.js';
import { extractErrorMessage } from './prompt-errors.js';
import type { AxiosInstance } from 'axios';

interface WorkflowRunHeadCommit {
    message?: string;
    author?: { name?: string };
}

interface WorkflowRun {
    created_at?: string;
    head_commit?: WorkflowRunHeadCommit;
}

/**
 * Build commit log string from workflow runs.
 * Supports both GitHub (head_commit) and GitLab (title) pipeline data.
 */
export function buildCommitLog(
    runs: Array<{
        created_at?: string;
        head_commit?: { message?: string; author?: { name?: string } };
        title?: string;
    }>,
): string {
    let log = '';
    for (const run of runs.slice(0, GIT_HISTORY_RUNS)) {
        const hc = run.head_commit;
        if (hc) {
            // GitHub: head_commit has message + author
            const msg = (hc.message ?? '').split('\n')[0];
            const author = typeof hc.author?.name === 'string' ? hc.author.name : 'unknown';
            const date = (typeof run.created_at === 'string' ? run.created_at : '').slice(0, 10);
            log += `- ${msg} (${author}, ${date})\n`;
        } else if (run.title) {
            // GitLab: pipeline title is the commit message
            const date = (typeof run.created_at === 'string' ? run.created_at : '').slice(0, 10);
            log += `- ${run.title} (${date})\n`;
        }
    }
    return log;
}

async function fetchGitHubCommitLog(): Promise<string> {
    const token = Config.getDefault().get('githubToken');
    const repo = Config.get('GITHUB_REPOSITORY');
    if (!token || !repo) return '';
    const client: AxiosInstance = createHttpClient({
        baseUrl: 'https://api.github',
        authHeader: { Authorization: 'Bearer ' + token },
    });
    const resp = await client.get<{ workflow_runs: WorkflowRun[] }>(
        `/repos/${repo}/actions/runs?per_page=${GIT_HISTORY_RUNS}&status=success&status=failure`,
    );
    return buildCommitLog(resp.data.workflow_runs);
}

async function fetchGitLabCommitLog(): Promise<string> {
    const token = Config.get('CI_JOB_TOKEN');
    const projectId = Config.get('CI_PROJECT_ID');
    const serverUrl = Config.get('CI_SERVER_URL') || 'https://gitlab.com';
    if (!token || !projectId) return '';
    const client: AxiosInstance = createHttpClient({
        baseUrl: serverUrl,
        authHeader: { 'PRIVATE-TOKEN': token },
    });
    const resp = await client.get<Array<{ id: number; created_at: string; title?: string }>>(
        `/api/v4/projects/${projectId}/pipelines?per_page=${GIT_HISTORY_RUNS}&status=success&status=failed`,
    );
    let log = '';
    for (const pipeline of resp.data.slice(0, GIT_HISTORY_RUNS)) {
        if (pipeline.title) {
            const date = pipeline.created_at.slice(0, 10);
            log += `- ${pipeline.title} (${date})\n`;
        }
    }
    return log;
}

/**
 * Fetch commit log from CI workflow runs (standalone mode).
 * Returns a formatted string of recent commit messages, or empty string if unavailable.
 */
async function _fetchGitHubLog(): Promise<string> {
    return fetchGitHubCommitLog().catch((err) => {
        rootLogger.debug(`fetchGitHubCommitLog failed: ${extractErrorMessage(err)}`);
        return '';
    });
}

async function _fetchGitLabLog(): Promise<string> {
    return fetchGitLabCommitLog().catch((err) => {
        rootLogger.debug(`fetchGitLabCommitLog failed: ${extractErrorMessage(err)}`);
        return '';
    });
}

export async function fetchCommitLog(): Promise<string> {
    if (isGitHubCi()) return _fetchGitHubLog();
    if (isGitLabCi()) return _fetchGitLabLog();
    return '';
}
