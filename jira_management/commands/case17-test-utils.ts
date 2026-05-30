import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';
import { createHttpClient } from '../../shared/http-client';
import Config from '../../shared/config';
import type { FlatTest } from '../../shared/result_parser';
import type { TestHistoryRun } from '../../shared/report-generator';
import type { GitHubWorkflowRunsResponse, GitHubArtifactsResponse, GitLabJob } from '../../shared/types';
import { createHistoryProvider, TestHistoryCache } from '../xray-history';
import type { CommandContext } from './context';
import {
    CTRF_LAST_FILE,
    GIT_HISTORY_RUNS,
    isValidCtrfData,
    isGitHubCi,
    isGitLabCi,
    type CiContext,
    type RunStats,
} from './case17-helpers';
function getMappingCandidates(): string[] {
    return [Config.get('QA_MAPPING_PATH') || '', path.join(process.cwd(), 'mapping.json')];
}

export function resolveMapping(): Map<string, string> {
    for (const candidate of getMappingCandidates()) {
        if (!candidate || !fs.existsSync(candidate)) continue;
        try {
            const raw = fs.readFileSync(candidate, 'utf8');
            const data = JSON.parse(raw);
            const tests = (data.tests ?? []) as Array<Record<string, string>>;
            if (tests.length === 0) return new Map();
            const entries: Array<[string, string]> = [];
            for (const t of tests) {
                if (t.title && t.key) entries.push([t.title, t.key]);
            }
            return new Map(entries);
        } catch {
            /* try next candidate */
        }
    }
    return new Map();
}

export async function resolveTestHistory(
    tests: FlatTest[],
    c: CommandContext,
    cache: TestHistoryCache,
): Promise<Record<string, TestHistoryRun[]>> {
    const mapping = resolveMapping();
    if (mapping.size === 0) return {};
    const provider = createHistoryProvider(c.jiraResource);

    const keys = tests.map((t) => mapping.get(t.title) || mapping.get(t.fullTitle ?? '') || '').filter(Boolean);
    if (keys.length === 0) return {};
    const uniqueKeys = [...new Set(keys)];
    const results = await Promise.allSettled(
        uniqueKeys.map(async (key) => {
            const cached = cache.get(key);
            if (cached) return { key, history: cached };
            const history = await provider.getHistory(key);
            cache.set(key, history);
            return { key, history };
        }),
    );

    const keyToHistory = new Map<string, TestHistoryRun[]>();
    for (const result of results) {
        if (result.status === 'fulfilled') {
            keyToHistory.set(result.value.key, result.value.history);
        }
    }
    const titleToHistory: Record<string, TestHistoryRun[]> = {};
    for (const t of tests) {
        const key = mapping.get(t.title) || mapping.get(t.fullTitle ?? '') || '';
        if (key && keyToHistory.has(key)) {
            titleToHistory[t.title] = keyToHistory.get(key) ?? [];
        }
    }
    return titleToHistory;
}

export function computeDiff(current: FlatTest[]): {
    newFailures: FlatTest[];
    newPasses: FlatTest[];
    flaky: FlatTest[];
} {
    const lastPath = path.join(process.cwd(), CTRF_LAST_FILE);
    if (!fs.existsSync(lastPath)) {
        return { newFailures: [], newPasses: [], flaky: [] };
    }
    try {
        const raw = fs.readFileSync(lastPath, 'utf8');
        const parsed: unknown = JSON.parse(raw);
        if (!isValidCtrfData(parsed)) return { newFailures: [], newPasses: [], flaky: [] };
        const lastData = parsed;
        const lastTests = lastData.results.tests || [];
        const lastByTitle = new Map(lastTests.map((t) => [t.name, t]));
        const newFailures: FlatTest[] = [];
        const newPasses: FlatTest[] = [];
        const flaky: FlatTest[] = [];
        for (const t of current) {
            const last = lastByTitle.get(t.title);
            if (!last) continue;
            if (t.state === 'failed' && last.status === 'passed') newFailures.push(t);
            if (t.state === 'passed' && last.status === 'failed') newPasses.push(t);
            if (last.status === 'failed') flaky.push(t);
        }
        return { newFailures, newPasses, flaky };
    } catch {
        return { newFailures: [], newPasses: [], flaky: [] };
    }
}
export function fetchGitHistory(): Promise<CiContext> {
    if (isGitHubCi()) return fetchGitHubHistory();
    if (isGitLabCi()) return fetchGitLabHistory();
    return Promise.resolve({ commits: '', runs: [], flakyTests: '' });
}
async function fetchGitHubHistory(): Promise<CiContext> {
    const token = Config.getDefault().githubToken || process.env.GITHUB_TOKEN || '';
    const repo = Config.get('GITHUB_REPOSITORY') || '';
    const client = createHttpClient({
        baseUrl: 'https://api.github.com',
        authHeader: { Authorization: 'Bearer ' + token },
    });
    try {
        const runsResp = await client.get(
            `/repos/${repo}/actions/runs?per_page=${GIT_HISTORY_RUNS}&status=success&status=failure`,
        );
        const runs = (runsResp.data as GitHubWorkflowRunsResponse).workflow_runs || [];
        const runStats: RunStats[] = [];
        const allTestsByTitle: Record<string, { states: string[] }> = {};
        for (const run of runs.slice(0, GIT_HISTORY_RUNS)) {
            const r = run;
            try {
                const artResp = await client.get(`/repos/${repo}/actions/runs/${String(r.id)}/artifacts`);
                const artifacts = (artResp.data as GitHubArtifactsResponse).artifacts || [];
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
                    const parsed = JSON.parse(entry.getData().toString('utf8'));
                    const summary = parsed.results?.summary;
                    const tests = parsed.results?.tests || [];
                    if (summary) {
                        runStats.push({
                            runId: r.id,
                            createdAt: (r.created_at as string) || '',
                            passed: summary.passed || 0,
                            failed: summary.failed || 0,
                            skipped: summary.skipped || 0,
                            total: summary.tests || 0,
                            passRate: summary.tests > 0 ? (summary.passed / summary.tests) * 100 : 0,
                        });
                    }
                    for (const t of tests) {
                        const name = t.name as string;
                        if (!allTestsByTitle[name]) allTestsByTitle[name] = { states: [] };
                        allTestsByTitle[name].states.push(t.status as string);
                    }
                }
            } catch {
                /* skip individual run */
            }
        }
        let commits = '';
        for (const run of runs.slice(0, GIT_HISTORY_RUNS)) {
            const r = run;
            const hc = r.head_commit;
            if (hc) {
                const msg = (hc.message || '').split('\n')[0];
                const author = (hc.author?.name as string) || 'unknown';
                const date = ((r.created_at as string) || '').slice(0, 10);
                commits += `- ${msg} (${author}, ${date})\n`;
            }
        }
        let flakyTests = '';
        for (const [testName, data] of Object.entries(allTestsByTitle)) {
            if (data.states.length >= 2) {
                const unique = new Set(data.states);
                if (unique.has('passed') && unique.has('failed')) {
                    flakyTests += `- ${testName}: ${data.states.join(', ')}\n`;
                }
            }
        }
        return { commits, runs: runStats, flakyTests };
    } catch {
        return { commits: '', runs: [], flakyTests: '' };
    }
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
        const runs: unknown[] = (runsResp.data as unknown[]) || [];
        const runStats: RunStats[] = [];
        for (const run of runs.slice(0, GIT_HISTORY_RUNS)) {
            const r = run as Record<string, unknown>;
            try {
                const jobsResp = await client.get(`/projects/${projectId}/pipelines/${String(r.id)}/jobs`);
                const jobs: GitLabJob[] = (jobsResp.data as GitLabJob[]) || [];
                const testJob = jobs.find((j) => {
                    const name = (j.name || '').toLowerCase();
                    return name.includes('test') || name.includes('e2e') || name.includes('ctrf');
                });
                if (!testJob) continue;
                const tj = testJob;
                const artResp = await client.get(`/projects/${projectId}/jobs/${String(tj.id)}/artifacts`, {
                    responseType: 'arraybuffer' as const,
                    maxRedirects: 5,
                });
                const zip = new AdmZip(Buffer.from(artResp.data));
                for (const entry of zip.getEntries()) {
                    if (!entry.name.endsWith('.json')) continue;
                    const parsed = JSON.parse(entry.getData().toString('utf8'));
                    const summary = parsed.results?.summary;
                    if (summary) {
                        runStats.push({
                            runId: r.id as number,
                            createdAt: (r.created_at as string) || '',
                            passed: summary.passed || 0,
                            failed: summary.failed || 0,
                            skipped: summary.skipped || 0,
                            total: summary.tests || 0,
                            passRate: summary.tests > 0 ? (summary.passed / summary.tests) * 100 : 0,
                        });
                    }
                }
            } catch {
                /* skip individual pipeline */
            }
        }
        return { commits: '', runs: runStats, flakyTests: '' };
    } catch {
        return { commits: '', runs: [], flakyTests: '' };
    }
}
