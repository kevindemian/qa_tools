import { AdmZip } from './deps.js';
import { createHttpClient } from './http-client.js';
import Config from './config.js';
import { rootLogger } from './logger.js';
import type { CtrfData, ParseResult } from './result_parser.js';
import { parseTestResults } from './result_parser.js';
import type { GitHubWorkflowRun, GitHubWorkflowRunsResponse, GitHubArtifactsResponse, GitLabJob } from './types.js';
import { isGitHubCi, isGitLabCi, GIT_HISTORY_RUNS, type CiContext, type RunStats } from './ci-detect.js';

async function processGitHubArtifacts(
    repo: string,
    client: ReturnType<typeof createHttpClient>,
    runs: GitHubWorkflowRun[],
): Promise<{ runStats: RunStats[]; allTestsByTitle: Record<string, { states: string[] }> }> {
    const runStats: RunStats[] = [];
    const allTestsByTitle: Record<string, { states: string[] }> = {};
    for (const run of runs.slice(0, GIT_HISTORY_RUNS)) {
        try {
            const artResp = await client.get<GitHubArtifactsResponse>(
                `/repos/${repo}/actions/runs/${String(run.id)}/artifacts`,
            );
            const artifacts = artResp.data.artifacts;
            const ctrf = artifacts.find((a) => {
                const name = (a.name || '').toLowerCase();
                return name.includes('ctrf') || name.includes('test-results');
            });
            if (!ctrf) continue;

            const zipResp = await client.get(`/repos/${repo}/actions/artifacts/${String(ctrf.id)}/zip`, {
                responseType: 'arraybuffer' as const,
            });
            const zip = new AdmZip(Buffer.from(zipResp.data));
            for (const entry of zip.getEntries()) {
                if (!entry.name.endsWith('.json')) continue;
                const parsed: Partial<CtrfData> = JSON.parse(entry.getData().toString('utf8')) as Partial<CtrfData>;
                const summary = parsed.results?.summary;
                const tests = parsed.results?.tests || [];
                if (summary) {
                    runStats.push({
                        runId: run.id,
                        createdAt: typeof run.created_at === 'string' ? run.created_at : '',
                        passed: summary.passed || 0,
                        failed: summary.failed || 0,
                        skipped: summary.skipped || 0,
                        total: summary.tests || 0,
                        passRate:
                            summary.passed + summary.failed > 0
                                ? (summary.passed / (summary.passed + summary.failed)) * 100
                                : 0,
                    });
                }
                for (const t of tests) {
                    const name = t.name;
                    if (!allTestsByTitle[name]) allTestsByTitle[name] = { states: [] };
                    allTestsByTitle[name].states.push(t.status);
                }
            }
        } catch (err) {
            rootLogger.debug(
                'git-artifact-downloader: skip individual run: ' + (err instanceof Error ? err.message : String(err)),
            );
        }
    }
    return { runStats, allTestsByTitle };
}

function buildCommitsFromRuns(runs: GitHubWorkflowRun[]): string {
    let commits = '';
    for (const run of runs.slice(0, GIT_HISTORY_RUNS)) {
        const hc = run.head_commit;
        if (hc) {
            const msg = (hc.message || '').split('\n')[0];
            const author = typeof hc.author?.name === 'string' ? hc.author.name : 'unknown';
            const date = (typeof run.created_at === 'string' ? run.created_at : '').slice(0, 10);
            commits += `- ${msg} (${author}, ${date})\n`;
        }
    }
    return commits;
}

function detectFlakyTests(allTestsByTitle: Record<string, { states: string[] }>): string {
    let flakyTests = '';
    for (const [testName, data] of Object.entries(allTestsByTitle)) {
        if (data.states.length >= 2) {
            const unique = new Set(data.states);
            if (unique.has('passed') && unique.has('failed')) {
                flakyTests += `- ${testName}: ${data.states.join(', ')}\n`;
            }
        }
    }
    return flakyTests;
}

async function fetchGitHubHistory(): Promise<CiContext> {
    const token = Config.getDefault().get('githubToken') || '';
    const repo = Config.get('GITHUB_REPOSITORY') || '';
    const client = createHttpClient({
        baseUrl: 'https://api.github.com',
        authHeader: { Authorization: 'Bearer ' + token },
    });
    try {
        const runsResp = await client.get<GitHubWorkflowRunsResponse>(
            `/repos/${repo}/actions/runs?per_page=${GIT_HISTORY_RUNS}&status=success&status=failure`,
        );
        const runs = runsResp.data.workflow_runs;
        const { runStats, allTestsByTitle } = await processGitHubArtifacts(repo, client, runs);
        const commits = buildCommitsFromRuns(runs);
        const flakyTests = detectFlakyTests(allTestsByTitle);
        return { commits, runs: runStats, flakyTests };
    } catch (err: unknown) {
        rootLogger.error('fetchGitHubHistory failed: ' + (err instanceof Error ? err.message : String(err)));
        return { commits: '', runs: [], flakyTests: '' };
    }
}

async function processGitLabPipelineArtifacts(
    projectId: string,
    pipeline: Record<string, unknown>,
    client: ReturnType<typeof createHttpClient>,
): Promise<RunStats[]> {
    const jobsResp = await client.get<GitLabJob[]>(`/projects/${projectId}/pipelines/${String(pipeline['id'])}/jobs`);
    const jobs: GitLabJob[] = jobsResp.data;
    const testJob = jobs.find((j) => {
        const name = (j.name || '').toLowerCase();
        return name.includes('test') || name.includes('e2e') || name.includes('ctrf');
    });
    if (!testJob) return [];

    const artResp = await client.get(`/projects/${projectId}/jobs/${String(testJob.id)}/artifacts`, {
        responseType: 'arraybuffer' as const,
        maxRedirects: 5,
    });
    const zip = new AdmZip(Buffer.from(artResp.data));
    const stats: RunStats[] = [];
    for (const entry of zip.getEntries()) {
        if (!entry.name.endsWith('.json')) continue;
        const parsed: Partial<CtrfData> = JSON.parse(entry.getData().toString('utf8')) as Partial<CtrfData>;
        const summary = parsed.results?.summary;
        if (summary) {
            stats.push({
                runId: pipeline['id'] as number,
                createdAt: (pipeline['created_at'] as string) || '',
                passed: summary.passed || 0,
                failed: summary.failed || 0,
                skipped: summary.skipped || 0,
                total: summary.tests || 0,
                passRate:
                    summary.passed + summary.failed > 0
                        ? (summary.passed / (summary.passed + summary.failed)) * 100
                        : 0,
            });
        }
    }
    return stats;
}

async function fetchGitLabHistory(): Promise<CiContext> {
    const token = Config.get('CI_JOB_TOKEN') || '';
    const projectId = Config.get('CI_PROJECT_ID') || '';
    const serverUrl = Config.get('CI_SERVER_URL') || 'https://gitlab.com';
    const client = createHttpClient({
        baseUrl: serverUrl + '/api/v4',
        authHeader: { 'PRIVATE-TOKEN': token },
    });
    try {
        const runsResp = await client.get(`/projects/${projectId}/pipelines?per_page=${GIT_HISTORY_RUNS}`);
        const runs: unknown[] = runsResp.data as unknown[];
        const runStats: RunStats[] = [];
        for (const run of runs.slice(0, GIT_HISTORY_RUNS)) {
            try {
                const stats = await processGitLabPipelineArtifacts(projectId, run as Record<string, unknown>, client);
                runStats.push(...stats);
            } catch (err) {
                rootLogger.debug(
                    'git-artifact-downloader: skip individual pipeline: ' +
                        (err instanceof Error ? err.message : String(err)),
                );
            }
        }
        return { commits: '', runs: runStats, flakyTests: '' };
    } catch (err: unknown) {
        rootLogger.warn('fetchGitLabHistory failed: ' + (err as Error).message);
        return { commits: '', runs: [], flakyTests: '' };
    }
}

async function downloadAndParseLatestGitHubRun(): Promise<ParseResult | null> {
    const token = Config.getDefault().get('githubToken') || '';
    const repo = Config.get('GITHUB_REPOSITORY') || '';
    if (!token || !repo) return null;
    const client = createHttpClient({
        baseUrl: 'https://api.github.com',
        authHeader: { Authorization: 'Bearer ' + token },
    });
    try {
        const runsResp = await client.get<GitHubWorkflowRunsResponse>(
            `/repos/${repo}/actions/runs?per_page=1&status=success`,
        );
        const runs = runsResp.data.workflow_runs;
        if (runs.length === 0) return null;
        const latest = runs[0];
        if (!latest) return null;
        const artResp = await client.get<GitHubArtifactsResponse>(
            `/repos/${repo}/actions/runs/${String(latest.id)}/artifacts`,
        );
        const artifacts = artResp.data.artifacts;
        const ctrf = artifacts.find((a) => {
            const name = (a.name || '').toLowerCase();
            return name.includes('ctrf') || name.includes('test-results');
        });
        if (!ctrf) return null;
        const zipResp = await client.get(`/repos/${repo}/actions/artifacts/${String(ctrf.id)}/zip`, {
            responseType: 'arraybuffer' as const,
        });
        const zip = new AdmZip(Buffer.from(zipResp.data));
        for (const entry of zip.getEntries()) {
            if (!entry.name.endsWith('.json')) continue;
            const raw = entry.getData().toString('utf8');
            const parsed = parseTestResults(JSON.parse(raw));
            if (parsed.stats.total > 0) return parsed;
        }
        return null;
    } catch (err: unknown) {
        rootLogger.warn('downloadLatestArtifact failed: ' + (err instanceof Error ? err.message : String(err)));
        return null;
    }
}

async function downloadAndParseLatestGitLabRun(): Promise<ParseResult | null> {
    const token = Config.get('CI_JOB_TOKEN') || '';
    const projectId = Config.get('CI_PROJECT_ID') || '';
    const serverUrl = Config.get('CI_SERVER_URL') || 'https://gitlab.com';
    if (!token || !projectId) return null;
    const client = createHttpClient({
        baseUrl: serverUrl + '/api/v4',
        authHeader: { 'PRIVATE-TOKEN': token },
    });
    try {
        const runsResp = await client.get(`/projects/${projectId}/pipelines?per_page=1`);
        const runs: unknown[] = runsResp.data as unknown[];
        if (runs.length === 0) return null;
        const pipeline = runs[0] as { id?: number; created_at?: string };
        const jobsResp = await client.get(`/projects/${projectId}/pipelines/${String(pipeline.id)}/jobs`);
        const jobs: GitLabJob[] = jobsResp.data as GitLabJob[];
        const testJob = jobs.find((j) => {
            const name = (j.name || '').toLowerCase();
            return name.includes('test') || name.includes('e2e') || name.includes('ctrf');
        });
        if (!testJob) return null;
        const artResp = await client.get(`/projects/${projectId}/jobs/${String(testJob.id)}/artifacts`, {
            responseType: 'arraybuffer' as const,
            maxRedirects: 5,
        });
        const zip = new AdmZip(Buffer.from(artResp.data));
        for (const entry of zip.getEntries()) {
            if (!entry.name.endsWith('.json')) continue;
            const raw = entry.getData().toString('utf8');
            const parsed = parseTestResults(JSON.parse(raw));
            if (parsed.stats.total > 0) return parsed;
        }
        return null;
    } catch (err: unknown) {
        rootLogger.warn('downloadLatestArtifact failed: ' + (err instanceof Error ? err.message : String(err)));
        return null;
    }
}

export async function fetchGitHistory(): Promise<CiContext> {
    if (isGitHubCi()) return fetchGitHubHistory();
    if (isGitLabCi()) return fetchGitLabHistory();
    return { commits: '', runs: [], flakyTests: '' };
}

export async function fetchLatestTestRun(): Promise<ParseResult | null> {
    if (isGitHubCi()) return downloadAndParseLatestGitHubRun();
    if (isGitLabCi()) return downloadAndParseLatestGitLabRun();
    return null;
}

export { isGitHubCi, isGitLabCi, GIT_HISTORY_RUNS } from './ci-detect.js';
export type { CiContext, RunStats } from './ci-detect.js';
