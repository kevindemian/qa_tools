/**
 * E2E Live tests — CI Data Hub
 *
 * Tests the complete pipeline with REAL API calls to GitHub/GitLab.
 * These tests only run when GITHUB_TOKEN or GITLAB_TOKEN is available.
 *
 * When no token is available, tests are skipped with a descriptive message.
 * This ensures the tests don't fail in CI environments without credentials.
 */
import { describe, expect, it, beforeAll } from 'vitest';
import { createCiDataHub } from '../../ci-data.js';
import type { GitProvider } from '../../types/ci-cd.js';

/* ── Skip condition ────────────────────────────────────────────────────── */

const GITHUB_TOKEN = process.env['GITHUB_TOKEN'];
const GITLAB_TOKEN = process.env['GITLAB_TOKEN'];
const GITHUB_REPO = process.env['E2E_GITHUB_REPO'] || 'octocat/Hello-World';

const hasGithubToken = Boolean(GITHUB_TOKEN);
const hasGitlabToken = Boolean(GITLAB_TOKEN);
const hasAnyToken = hasGithubToken || hasGitlabToken;

/* ── Real GitHub Provider ──────────────────────────────────────────────── */

function createGithubProvider(token: string, repo: string): GitProvider {
    const [owner, repoName] = repo.split('/');
    const baseUrl = 'https://api.github.com';
    const headers = {
        Authorization: `token ${token}`,
        Accept: 'application/vnd.github.v3+json',
    };

    return {
        provider: 'github',
        getRecentPipelines: async (limit = 30) => {
            const url = `${baseUrl}/repos/${owner}/${repoName}/actions/runs?per_page=${limit}`;
            const res = await fetch(url, { headers });
            if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);
            const data = (await res.json()) as {
                workflow_runs: Array<{
                    id: number;
                    conclusion: string | null;
                    head_branch: string;
                    created_at: string;
                    updated_at: string;
                    run_started_at?: string;
                }>;
            };
            return data.workflow_runs.map((r) => ({
                id: r.id,
                conclusion: (r.conclusion ?? '') as 'success' | 'failure' | '',
                head_branch: r.head_branch,
                created_at: r.created_at,
                updated_at: r.updated_at,
                run_started_at: r.run_started_at || r.created_at,
            }));
        },
        getPipelineJobs: async (pipelineId: string | number) => {
            const runId = Number(pipelineId);
            const url = `${baseUrl}/repos/${owner}/${repoName}/actions/runs/${runId}/jobs`;
            const res = await fetch(url, { headers });
            if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);
            const data = (await res.json()) as {
                jobs: Array<{
                    id: number;
                    name: string;
                    status: string;
                    started_at: string;
                    completed_at: string | null;
                }>;
            };
            return data.jobs.map((j) => {
                const duration =
                    j.completed_at && j.started_at
                        ? (new Date(j.completed_at).getTime() - new Date(j.started_at).getTime()) / 1000
                        : 0;
                return {
                    id: j.id,
                    name: j.name,
                    stage: 'test',
                    status: j.status,
                    started_at: j.started_at,
                    finished_at: j.completed_at ?? '',
                    duration,
                };
            });
        },
        listPipelineArtifacts: () => Promise.resolve([]),
        downloadArtifact: () => Promise.resolve({ buffer: Buffer.from(''), filename: '' }),
        triggerPipeline: () => {
            throw new Error('Not implemented in E2E tests');
        },
        getSchedules: () => Promise.resolve([]),
        runSchedule: () => {
            throw new Error('Not implemented in E2E tests');
        },
        createMergeRequest: () =>
            Promise.resolve({ iid: 0, web_url: '', title: '', state: 'opened', source_branch: '', target_branch: '' }),
        updateMergeRequest: () =>
            Promise.resolve({ iid: 0, web_url: '', title: '', state: 'opened', source_branch: '', target_branch: '' }),
        getMergeRequest: () =>
            Promise.resolve({
                iid: 0,
                web_url: '',
                title: '',
                state: 'opened',
                source_branch: '',
                target_branch: '',
                description: '',
                labels: [],
            }),
        searchMergeRequests: () => Promise.resolve([]),
        acceptMergeRequest: () => Promise.resolve(null),
        isApproved: () => Promise.resolve(false),
        getCICDVariables: () => Promise.resolve(null),
        getBranch: () => Promise.resolve({ name: '', commitSha: '' }),
        getPipeline: () => Promise.resolve({ id: 0, status: 'completed', state: 'success', ref: '', sha: '' }),
        getDiff: () => Promise.resolve(''),
    };
}

/* ── Tests ─────────────────────────────────────────────────────────────── */

describe.skipIf(!hasAnyToken)('E2E Live: CI Data Hub — Real API', () => {
    let githubProvider: GitProvider | undefined;

    beforeAll(() => {
        if (hasGithubToken && GITHUB_TOKEN) {
            githubProvider = createGithubProvider(GITHUB_TOKEN, GITHUB_REPO);
        }
    });

    it('fetches real runs from GitHub API and creates hub', async () => {
        expect.hasAssertions();

        if (!githubProvider) return;

        const hub = await createCiDataHub(githubProvider, GITHUB_REPO);

        expect(hub).toBeDefined();
        expect(hub.provider).toBe('github');
        expect(hub.repo).toBe(GITHUB_REPO);
        expect(hub.passRate).toBeGreaterThanOrEqual(0);
        expect(hub.passRate).toBeLessThanOrEqual(100);
    });

    it('hub has non-negative avg duration', async () => {
        expect.hasAssertions();

        if (!githubProvider) return;

        const hub = await createCiDataHub(githubProvider, GITHUB_REPO);

        expect(hub.avgDuration).toBeGreaterThanOrEqual(0);
    });

    it('hub has valid suite speed P95', async () => {
        expect.hasAssertions();

        if (!githubProvider) return;

        const hub = await createCiDataHub(githubProvider, GITHUB_REPO);

        expect(hub.suiteSpeedP95).toBeGreaterThanOrEqual(0);
    });

    it('hub branch breakdown has valid pass rates', async () => {
        expect.hasAssertions();

        if (!githubProvider) return;

        const hub = await createCiDataHub(githubProvider, GITHUB_REPO);

        for (const [, data] of Object.entries(hub.branchBreakdown)) {
            expect(data.passRate).toBeGreaterThanOrEqual(0);
            expect(data.passRate).toBeLessThanOrEqual(100);
        }
    });
});
