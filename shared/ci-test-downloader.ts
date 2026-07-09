/**
 * CI Test Downloader — lightweight single-run test artifact download.
 *
 * Downloads and parses test artifacts from the latest successful CI run.
 * Reuses `parseArtifactBufferAll` and `isTestArtifact` from the data-hub
 * parsing layer. Replaces the monolithic `git-artifact-downloader.ts` for
 * this specific use case.
 *
 * @module ci-test-downloader
 */

import { createHttpClient } from './http-client.js';
import Config from './config.js';
import { rootLogger } from './logger.js';
import { extractErrorMessage } from './prompt-errors.js';
import { isTestArtifact, parseArtifactBufferAll } from './data-hub/artifact-parser.js';
import { isGitHubCi, isGitLabCi } from './ci-detect.js';
import type { ParseResult } from './result_parser.js';

/**
 * Downloads and parses the latest test artifact from a successful CI run.
 *
 * Returns `null` when:
 * - No CI environment is detected
 * - No token or repository information is available
 * - No test artifacts are found in the latest run
 *
 * @returns The first ParseResult with total > 0, or null.
 */
export async function fetchLatestTestRun(): Promise<ParseResult | null> {
    if (isGitHubCi()) return downloadFromGitHub();
    if (isGitLabCi()) return downloadFromGitLab();
    return null;
}

// ---------------------------------------------------------------------------
// GitHub
// ---------------------------------------------------------------------------

interface GitHubRunsResponse {
    workflow_runs: Array<{ id?: number }>;
}

interface GitHubArtifactsResponse {
    artifacts: Array<{ id: number; name: string }>;
}

async function downloadFromGitHub(): Promise<ParseResult | null> {
    const token = Config.getDefault().get('githubToken');
    const repo = Config.get('GITHUB_REPOSITORY');
    if (!token || !repo) {
        rootLogger.debug('ci-test-downloader: github — missing token or repository');
        return null;
    }

    const client = createHttpClient({
        baseUrl: 'https://api.github.com',
        authHeader: { Authorization: `Bearer ${token}` },
    });

    try {
        const runsResp = await client.get<GitHubRunsResponse>(`/repos/${repo}/actions/runs?per_page=1&status=success`);
        const runs = runsResp.data.workflow_runs;
        if (runs.length === 0) return null;

        const latest = runs[0];
        if (!latest?.id) return null;

        const artResp = await client.get<GitHubArtifactsResponse>(
            `/repos/${repo}/actions/runs/${String(latest.id)}/artifacts`,
        );
        const testArtifact = artResp.data.artifacts.find((a) => isTestArtifact(a.name));
        if (!testArtifact) return null;

        const zipResp = await client.get(`/repos/${repo}/actions/artifacts/${String(testArtifact.id)}/zip`, {
            responseType: 'arraybuffer' as const,
        });
        return parseFirstValid(zipResp.data as ArrayBuffer, testArtifact.name);
    } catch (err) {
        rootLogger.debug(`ci-test-downloader: github download failed: ${extractErrorMessage(err)}`);
        return null;
    }
}

// ---------------------------------------------------------------------------
// GitLab
// ---------------------------------------------------------------------------

interface GitLabPipeline {
    id?: number;
}
interface GitLabJob {
    id: number;
    name: string;
}

async function downloadFromGitLab(): Promise<ParseResult | null> {
    const token = Config.get('CI_JOB_TOKEN');
    const projectId = Config.get('CI_PROJECT_ID');
    const serverUrl = Config.get('CI_SERVER_URL') || 'https://gitlab.com';
    if (!token || !projectId) {
        rootLogger.debug('ci-test-downloader: gitlab — missing token or project ID');
        return null;
    }

    const client = createHttpClient({
        baseUrl: `${serverUrl}/api/v4`,
        authHeader: { 'PRIVATE-TOKEN': token },
    });

    try {
        const runsResp = await client.get(`/projects/${projectId}/pipelines?per_page=1`);
        const runs = runsResp.data as unknown[];
        if (runs.length === 0) return null;

        const pipeline = runs[0] as GitLabPipeline;
        if (!pipeline.id) return null;

        const jobsResp = await client.get(`/projects/${projectId}/pipelines/${String(pipeline.id)}/jobs`);
        const jobs = jobsResp.data as GitLabJob[];
        const testJob = jobs.find((j) => isTestArtifact(j.name));
        if (!testJob) return null;

        const zipResp = await client.get(`/projects/${projectId}/jobs/${String(testJob.id)}/artifacts`, {
            responseType: 'arraybuffer' as const,
        });
        return parseFirstValid(zipResp.data as ArrayBuffer, testJob.name);
    } catch (err) {
        rootLogger.debug(`ci-test-downloader: gitlab download failed: ${extractErrorMessage(err)}`);
        return null;
    }
}

// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------

/**
 * Parses a downloaded artifact buffer and returns the first valid ParseResult.
 * Delegates ZIP extraction and format detection to `parseArtifactBufferAll`.
 */
function parseFirstValid(data: ArrayBuffer, artifactName: string): ParseResult | null {
    const buffer = Buffer.from(data);
    const results = parseArtifactBufferAll(buffer, `${artifactName}.zip`);
    for (const result of results) {
        if (result.data.stats.total > 0) return result.data;
    }
    return null;
}
