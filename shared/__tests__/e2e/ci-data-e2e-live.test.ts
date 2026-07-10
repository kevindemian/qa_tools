/**
 * E2E Live tests — CI Data Hub
 *
 * Tests the complete pipeline with REAL API calls to GitHub/GitLab.
 * These tests only run when GITHUB_TOKEN or GITLAB_TOKEN is available.
 *
 * When no token is available, tests are skipped with a descriptive message.
 * This ensures the tests don't fail in CI environments without credentials.
 */
import { describe, expect, it, beforeAll, vi } from 'vitest';
import type { DataProvider, RawData, FetchOptions } from '../../types/data-hub.js';
import { DataHubImpl } from '../../data-hub/hub.js';

/* ── Skip condition ────────────────────────────────────────────────────── */

const GITHUB_TOKEN = process.env['GITHUB_TOKEN'];
const GITLAB_TOKEN = process.env['GITLAB_TOKEN'];
const GITHUB_REPO = process.env['E2E_GITHUB_REPO'] || 'octocat/Hello-World';

const hasGithubToken = Boolean(GITHUB_TOKEN);
const hasGitlabToken = Boolean(GITLAB_TOKEN);
const hasAnyToken = hasGithubToken || hasGitlabToken;

/* ── Real GitHub DataProvider ──────────────────────────────────────────── */

function createGithubDataProvider(token: string): DataProvider {
    const baseUrl = 'https://api.github.com';
    const headers = {
        Authorization: `token ${token}`,
        Accept: 'application/vnd.github.v3+json',
    };

    return {
        name: 'github-e2e',
        source: 'github',
        fetchRawData: async (options: FetchOptions): Promise<RawData> => {
            const [owner, repoName] = options.repo.split('/');
            const limit = options.count ?? 30;

            // Fetch runs
            const runsUrl = `${baseUrl}/repos/${owner}/${repoName}/actions/runs?per_page=${limit}`;
            const runsRes = await fetch(runsUrl, { headers });
            if (!runsRes.ok) throw new Error(`GitHub API error: ${runsRes.status}`);
            const runsData = (await runsRes.json()) as {
                workflow_runs: Array<{
                    id: number;
                    conclusion: string | null;
                    head_branch: string;
                    created_at: string;
                    updated_at: string;
                    run_started_at?: string;
                }>;
            };

            const runs = runsData.workflow_runs.map((r) => ({
                id: r.id,
                conclusion: (r.conclusion ?? '') as 'success' | 'failure' | '',
                head_branch: r.head_branch,
                created_at: r.created_at,
                updated_at: r.updated_at,
                run_started_at: r.run_started_at || r.created_at,
            }));

            // Fetch jobs for each run
            const jobs = new Map<
                number,
                Array<{
                    id: number;
                    name: string;
                    stage: string;
                    status: string;
                    started_at?: string;
                    finished_at?: string;
                    duration?: number;
                }>
            >();

            for (const run of runs) {
                const jobsUrl = `${baseUrl}/repos/${owner}/${repoName}/actions/runs/${run.id}/jobs`;
                const jobsRes = await fetch(jobsUrl, { headers });
                if (!jobsRes.ok) continue;

                const jobsData = (await jobsRes.json()) as {
                    jobs: Array<{
                        id: number;
                        name: string;
                        status: string;
                        started_at: string;
                        completed_at: string | null;
                    }>;
                };

                jobs.set(
                    run.id,
                    jobsData.jobs.map((j) => {
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
                    }),
                );
            }

            return {
                runs,
                jobs,
                failureReasons: new Map(),
                artifacts: new Map(),
            };
        },
    };
}

/* ── Tests ─────────────────────────────────────────────────────────────── */

describe.skipIf(!hasAnyToken)('E2E Live: CI Data Hub — Real API', () => {
    let githubProvider: DataProvider | undefined;

    const mockPersistence = {
        loadMetricsStore: vi.fn().mockReturnValue({ runs: [] }),
        saveMetricsStore: vi.fn(),
        loadCoverageHistory: vi.fn().mockReturnValue([]),
        saveCoverageSnapshot: vi.fn(),
        loadFailureClassifications: vi.fn().mockReturnValue([]),
        saveFailureClassification: vi.fn(),
        saveRun: vi.fn(),
        saveParseResult: vi.fn().mockReturnValue({
            timestamp: new Date().toISOString(),
            project: '',
            total: 0,
            passed: 0,
            failed: 0,
            skipped: 0,
            duration: 0,
            tests: [],
        }),
        saveQualityMetrics: vi.fn(),
        loadQualityMetricsHistory: vi.fn().mockReturnValue([]),
        flush: vi.fn(),
    };

    beforeAll(() => {
        if (hasGithubToken && GITHUB_TOKEN) {
            githubProvider = createGithubDataProvider(GITHUB_TOKEN);
        }
    });

    it('fetches real runs from GitHub API and creates hub', async () => {
        expect.hasAssertions();

        if (!githubProvider) return;

        const { hub } = await DataHubImpl.create([githubProvider], { repo: GITHUB_REPO }, mockPersistence);

        expect(hub).toBeDefined();
        expect(hub.provider).toBe('github');
        expect(hub.repo).toBe(GITHUB_REPO);
        expect(hub.computed.passRate).toBeGreaterThanOrEqual(0);
        expect(hub.computed.passRate).toBeLessThanOrEqual(100);
    });

    it('hub has non-negative avg duration', async () => {
        expect.hasAssertions();

        if (!githubProvider) return;

        const { hub } = await DataHubImpl.create([githubProvider], { repo: GITHUB_REPO }, mockPersistence);

        expect(hub.computed.avgDuration).toBeGreaterThanOrEqual(0);
    });

    it('hub has valid suite speed P95', async () => {
        expect.hasAssertions();

        if (!githubProvider) return;

        const { hub } = await DataHubImpl.create([githubProvider], { repo: GITHUB_REPO }, mockPersistence);

        expect(hub.computed.suiteSpeedP95).toBeGreaterThanOrEqual(0);
    });

    it('hub branch breakdown has valid pass rates', async () => {
        expect.hasAssertions();

        if (!githubProvider) return;

        const { hub } = await DataHubImpl.create([githubProvider], { repo: GITHUB_REPO }, mockPersistence);

        for (const [, data] of Object.entries(hub.computed.branchBreakdown)) {
            const branch = data;

            expect(branch.passRate).toBeGreaterThanOrEqual(0);
            expect(branch.passRate).toBeLessThanOrEqual(100);
        }
    });
});
