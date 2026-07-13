/**
 * Unit tests for GitHub Data Provider.
 *
 * Tests the adapter that converts GitProvider to DataProvider.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GitHubDataProvider } from '../../providers/github-provider.js';
import type {
    GitProvider,
    PipelineRun,
    PipelineJob,
    GitHubDeploymentRaw,
    GitHubReleaseRaw,
    GitHubSecurityAlertRaw,
    GitHubPullRequestRaw,
    GitHubIssueRaw,
} from '../../../types/ci-cd.js';
import type {
    Deployment,
    Release,
    SecurityFinding,
    RawIssue,
    RawPullRequest,
    PerformanceMetrics,
} from '../../../types/data-hub.js';

/* ── Mock GitProvider ──────────────────────────────────────────────────── */

function createMockProvider(): GitProvider {
    return {
        getRecentPipelines: vi.fn(),
        getPipelineJobs: vi.fn(),
        listPipelineArtifacts: vi.fn(),
        downloadArtifact: vi.fn(),
        getJobLogs: vi.fn(),
        triggerPipeline: vi.fn(),
        getSchedules: vi.fn(),
        runSchedule: vi.fn(),
        createMergeRequest: vi.fn(),
        updateMergeRequest: vi.fn(),
        getMergeRequest: vi.fn(),
        searchMergeRequests: vi.fn(),
        acceptMergeRequest: vi.fn(),
        isApproved: vi.fn(),
        getCICDVariables: vi.fn(),
        getBranch: vi.fn(),
        getPipeline: vi.fn(),
        getDiff: vi.fn(),
        getWorkflowRunTiming: vi.fn(),
        getWorkflowUsage: vi.fn(),
        getFileContents: vi.fn(),
        listDirectory: vi.fn(),
        getTestReport: vi.fn(),
        provider: 'github' as const,
    };
}

/** Mock GitProvider with the FASE EXPAND+STORE optional methods present. */
function createMockProviderExpanded(): GitProvider {
    const base = createMockProvider();
    return {
        ...base,
        getDeployments: vi.fn(),
        getReleases: vi.fn(),
        getSecurityAlerts: vi.fn(),
        getPullRequests: vi.fn(),
        getIssues: vi.fn(),
    };
}

/** Narrow an optional GitProvider mock method to its function form (explicit guard). */
function mockOptional<T extends (...args: never[]) => unknown>(fn: T | undefined): T {
    if (typeof fn !== 'function') throw new Error('optional mock method missing');
    return fn;
}

function makeRun(id: number, overrides?: Partial<PipelineRun>): PipelineRun {
    return {
        id,
        conclusion: 'success',
        head_branch: 'main',
        created_at: '2026-07-01T10:00:00Z',
        updated_at: '2026-07-01T10:05:00Z',
        run_started_at: '2026-07-01T10:00:00Z',
        ...overrides,
    };
}

function makeJob(id: number, overrides?: Partial<PipelineJob>): PipelineJob {
    return {
        id,
        name: `job-${id}`,
        stage: 'test',
        status: 'success',
        ...overrides,
    };
}

/* ── Tests ─────────────────────────────────────────────────────────────── */

describe('GitHubDataProvider', () => {
    let mockProvider: GitProvider;
    let provider: GitHubDataProvider;

    beforeEach(() => {
        mockProvider = createMockProvider();
        provider = new GitHubDataProvider(mockProvider);
    });

    it('has correct name and source', () => {
        expect.hasAssertions();
        expect(provider.name).toBe('github');
        expect(provider.source).toBe('github');
    });

    it('fetches raw data from GitHub provider', async () => {
        expect.hasAssertions();

        const runs = [makeRun(1), makeRun(2)];
        const jobs = [makeJob(101), makeJob(102)];
        vi.mocked(mockProvider.getRecentPipelines).mockResolvedValue(runs);
        vi.mocked(mockProvider.getPipelineJobs).mockResolvedValue(jobs);
        vi.mocked(mockProvider.listPipelineArtifacts).mockResolvedValue([]);

        const result = await provider.fetchRawData({ repo: 'owner/repo', count: 10 });

        expect(result.runs).toHaveLength(2);
        expect(result.jobs.size).toBe(2);
        expect(result.artifacts.size).toBe(2);
        expect(mockProvider.getRecentPipelines).toHaveBeenCalledWith(10);
    });

    it('lA-2: preserves run_attempt from GitHub raw runs into result.runs', async () => {
        expect.hasAssertions();

        const runs = [makeRun(1, { run_attempt: 2, conclusion: 'success' })];
        vi.mocked(mockProvider.getRecentPipelines).mockResolvedValue(runs);
        vi.mocked(mockProvider.getPipelineJobs).mockResolvedValue([makeJob(101)]);
        vi.mocked(mockProvider.listPipelineArtifacts).mockResolvedValue([]);

        const result = await provider.fetchRawData({ repo: 'owner/repo', count: 10 });

        expect(result.runs[0]?.run_attempt).toBe(2);
    });

    it('lA-2: fetchRawData captures billable usage into timing (real cost)', async () => {
        expect.hasAssertions();

        const runs = [makeRun(1, { run_attempt: 1, conclusion: 'success' })];
        vi.mocked(mockProvider.getRecentPipelines).mockResolvedValue(runs);
        vi.mocked(mockProvider.getPipelineJobs).mockResolvedValue([makeJob(101)]);
        vi.mocked(mockProvider.listPipelineArtifacts).mockResolvedValue([]);
        vi.mocked(mockProvider.getWorkflowUsage).mockResolvedValue({
            run_duration_ms: 120000,
            billable: { UBUNTU: { total_ms: 60000, jobs: 2 } },
        });

        const result = await provider.fetchRawData({ repo: 'owner/repo', count: 10 });

        const stored = result.timing?.get(1);

        expect(stored).toBeDefined();
        expect(stored?.run_duration_ms).toBe(120000);
        expect(stored?.billable?.['UBUNTU']?.total_ms).toBe(60000);
    });

    it('passes since to getRecentPipelines when set (Gap 4 incremental)', async () => {
        expect.hasAssertions();

        const runs = [makeRun(1)];
        const since = new Date('2026-01-01T00:00:00Z');
        vi.mocked(mockProvider.getRecentPipelines).mockResolvedValue(runs);
        vi.mocked(mockProvider.getPipelineJobs).mockResolvedValue([makeJob(101)]);
        vi.mocked(mockProvider.listPipelineArtifacts).mockResolvedValue([]);

        const result = await provider.fetchRawData({ repo: 'owner/repo', count: 10, since });

        expect(result.runs).toHaveLength(1);
        expect(mockProvider.getRecentPipelines).toHaveBeenCalledWith(10, since);
    });

    it('handles empty runs gracefully', async () => {
        expect.hasAssertions();

        vi.mocked(mockProvider.getRecentPipelines).mockResolvedValue([]);

        const result = await provider.fetchRawData({ repo: 'owner/repo' });

        expect(result.runs).toHaveLength(0);
        expect(result.jobs.size).toBe(0);
    });

    it('tracks provenance for each data source (Gap 2)', async () => {
        expect.hasAssertions();

        const runs = [makeRun(1)];
        vi.mocked(mockProvider.getRecentPipelines).mockResolvedValue(runs);
        vi.mocked(mockProvider.getPipelineJobs).mockResolvedValue([makeJob(101)]);
        vi.mocked(mockProvider.listPipelineArtifacts).mockResolvedValue([]);

        const result = await provider.fetchRawData({ repo: 'owner/repo' });

        expect(result.provenance).toBeDefined();

        const runsProv = result.provenance?.get('runs');

        expect(runsProv).toBeDefined();
        expect(runsProv?.source).toBe('github-api');
        expect(runsProv?.confidence).toBe(1);
        expect(typeof runsProv?.timestamp).toBe('string');
    });

    it('filters runs by branchFilter (Gap 3)', async () => {
        expect.hasAssertions();

        const mainRun = makeRun(1, { head_branch: 'main' });
        const featureRun = makeRun(2, { head_branch: 'feature/x' });
        vi.mocked(mockProvider.getRecentPipelines).mockResolvedValue([mainRun, featureRun]);
        vi.mocked(mockProvider.getPipelineJobs).mockResolvedValue([makeJob(101)]);
        vi.mocked(mockProvider.listPipelineArtifacts).mockResolvedValue([]);

        const result = await provider.fetchRawData({ repo: 'owner/repo', branchFilter: 'main' });

        expect(result.runs).toHaveLength(1);

        expect(result.runs[0]?.id).toBe(1);
    });

    it('uses getJobLogs for failure reasons (bug fix)', async () => {
        expect.hasAssertions();

        const failedJob = makeJob(201, { status: 'failure' });
        const runs = [makeRun(1)];
        vi.mocked(mockProvider.getRecentPipelines).mockResolvedValue(runs);
        vi.mocked(mockProvider.getPipelineJobs).mockResolvedValue([failedJob]);
        vi.mocked(mockProvider.listPipelineArtifacts).mockResolvedValue([]);
        vi.mocked(mockProvider.getJobLogs).mockResolvedValue('Error: Connection timeout after 30s');

        const result = await provider.fetchRawData({ repo: 'owner/repo' });

        expect(mockProvider.getJobLogs).toHaveBeenCalledWith(201);
        expect(mockProvider.downloadArtifact).not.toHaveBeenCalled();

        const reasons = result.failureReasons.get(201);

        expect(reasons).toBeDefined();
        expect(reasons?.length).toBeGreaterThan(0);

        // CDH-L4g: canonical FailureRecord[] must absorb category/confidence/source
        // instead of dropping them to null.
        const records = result.failureRecords ?? [];

        expect(records.length).toBeGreaterThan(0);
        expect(
            records.every(
                (r) =>
                    typeof r.category === 'string' && typeof r.confidence === 'number' && typeof r.source === 'string',
            ),
        ).toBeTruthy();
        expect(
            records.some((r) => r.source === 'log-regex' && (r.message ?? '').includes('Connection timeout')),
        ).toBeTruthy();
    });

    it('skips jobs with non-failure status for failure reasons', async () => {
        expect.assertions(2);

        const successJob = makeJob(301, { status: 'success' });
        const runs = [makeRun(1)];
        vi.mocked(mockProvider.getRecentPipelines).mockResolvedValue(runs);
        vi.mocked(mockProvider.getPipelineJobs).mockResolvedValue([successJob]);
        vi.mocked(mockProvider.listPipelineArtifacts).mockResolvedValue([]);

        const result = await provider.fetchRawData({ repo: 'owner/repo' });

        // getJobLogs may be called for coverage extraction on success jobs
        // but failure reasons must be empty
        expect(result.failureReasons.size).toBe(0);
        expect(result.failureReasons.get(301)).toBeUndefined();
    });
});

/* ── FASE EXPAND+STORE (EIXO A) — optional GitProvider categories ─────────── */

describe('GitHubDataProvider — FASE EXPAND+STORE (EIXO A)', () => {
    let mockProvider: GitProvider;
    let provider: GitHubDataProvider;

    beforeEach(() => {
        mockProvider = createMockProviderExpanded();
        provider = new GitHubDataProvider(mockProvider);
    });

    function baseMock(): void {
        vi.mocked(mockProvider.getRecentPipelines).mockResolvedValue([makeRun(1)]);
        vi.mocked(mockProvider.getPipelineJobs).mockResolvedValue([makeJob(101)]);
        vi.mocked(mockProvider.listPipelineArtifacts).mockResolvedValue([]);
    }

    it('skips expanded categories when provider has no optional methods', async () => {
        expect.hasAssertions();

        const plain = createMockProvider();
        const p = new GitHubDataProvider(plain);
        vi.mocked(plain.getRecentPipelines).mockResolvedValue([makeRun(1)]);
        vi.mocked(plain.getPipelineJobs).mockResolvedValue([makeJob(101)]);
        vi.mocked(plain.listPipelineArtifacts).mockResolvedValue([]);

        const result = await p.fetchRawData({ repo: 'owner/repo' });

        expect(result.deployments).toBeUndefined();
        expect(result.releases).toBeUndefined();
        expect(result.securityFindings).toBeUndefined();
        expect(result.pmIssues).toBeUndefined();
        expect(result.pullRequests).toBeUndefined();
    });

    it('populates deployments from getDeployments (confidence .9)', async () => {
        expect.hasAssertions();

        baseMock();
        const raw: GitHubDeploymentRaw[] = [
            { id: 10, environment: 'prod', state: 'success', created_at: '2026-01-01T00:00:00Z', html_url: 'u' },
        ];
        vi.mocked(mockOptional(mockProvider.getDeployments)).mockResolvedValue(raw);

        const result = await provider.fetchRawData({ repo: 'owner/repo' });

        expect(result.deployments).toHaveLength(1);

        const dep = result.deployments?.[0] as Deployment;

        expect(dep.id).toBe('10');
        expect(dep.environment).toBe('prod');
        expect(dep.confidence).toBeCloseTo(0.9, 5);
        expect(result.provenance?.get('deployments')?.confidence).toBeCloseTo(0.9, 5);
    });

    it('returns [] when getDeployments yields null (never throws)', async () => {
        expect.hasAssertions();

        baseMock();
        vi.mocked(mockOptional(mockProvider.getDeployments)).mockResolvedValue(
            null as unknown as GitHubDeploymentRaw[],
        );

        const result = await provider.fetchRawData({ repo: 'owner/repo' });

        expect(result.deployments).toBeUndefined();
    });

    it('drops deployments missing environment (guard)', async () => {
        expect.hasAssertions();

        baseMock();
        const raw: GitHubDeploymentRaw[] = [{ id: 10, created_at: '2026-01-01T00:00:00Z' }];
        vi.mocked(mockOptional(mockProvider.getDeployments)).mockResolvedValue(raw);

        const result = await provider.fetchRawData({ repo: 'owner/repo' });

        expect(result.deployments).toBeUndefined();
    });

    it('populates releases from getReleases (confidence .9)', async () => {
        expect.hasAssertions();

        baseMock();
        const raw: GitHubReleaseRaw[] = [
            { id: 20, tag_name: 'v1.0.0', draft: false, prerelease: false, created_at: '2026-02-01T00:00:00Z' },
        ];
        vi.mocked(mockOptional(mockProvider.getReleases)).mockResolvedValue(raw);

        const result = await provider.fetchRawData({ repo: 'owner/repo' });

        expect(result.releases).toHaveLength(1);

        const rel = result.releases?.[0] as Release;

        expect(rel.tag).toBe('v1.0.0');
        expect(rel.confidence).toBeCloseTo(0.9, 5);
    });

    it('populates securityFindings from getSecurityAlerts (tool + severity)', async () => {
        expect.hasAssertions();

        baseMock();
        const raw: GitHubSecurityAlertRaw[] = [
            {
                number: 1,
                state: 'open',
                html_url: 'https://github.com/o/r/security/code-scanning/1',
                security_advisory: { ghsa_id: 'GHSA-xxxx', severity: 'high', summary: 'SQL injection' },
            },
            {
                number: 2,
                state: 'fixed',
                html_url: 'https://github.com/o/r/security/secret-scanning/2',
                security_advisory: { cve_id: 'CVE-2026-1', severity: 'critical', summary: 'Leaked token' },
            },
        ];
        vi.mocked(mockOptional(mockProvider.getSecurityAlerts)).mockResolvedValue(raw);

        const result = await provider.fetchRawData({ repo: 'owner/repo' });

        expect(result.securityFindings).toHaveLength(2);

        const findings = result.securityFindings as SecurityFinding[];

        expect(findings[0]?.tool).toBe('github-code-scanning');
        expect(findings[0]?.severity).toBe('high');
        expect(findings[0]?.rule).toBe('GHSA-xxxx');
        expect(findings[0]?.confidence).toBeCloseTo(0.85, 5);
        expect(findings[1]?.tool).toBe('github-secret-scanning');
        expect(findings[1]?.rule).toBe('CVE-2026-1');
    });

    it('populates pmIssues from getIssues (source github)', async () => {
        expect.hasAssertions();

        baseMock();
        const raw: GitHubIssueRaw[] = [
            {
                number: 5,
                title: 'Bug',
                state: 'open',
                html_url: 'u5',
                user: { login: 'alice' },
                labels: [{ name: 'bug' }],
                created_at: '2026-03-01T00:00:00Z',
                updated_at: '2026-03-02T00:00:00Z',
            },
        ];
        vi.mocked(mockOptional(mockProvider.getIssues)).mockResolvedValue(raw);

        const result = await provider.fetchRawData({ repo: 'owner/repo' });

        expect(result.pmIssues).toHaveLength(1);

        const issue = result.pmIssues?.[0] as RawIssue;

        expect(issue.source).toBe('github');
        expect(issue.id).toBe('5');
        expect(issue.author).toBe('alice');
        expect(issue.labels).toStrictEqual(['bug']);
        expect(issue.confidence).toBeCloseTo(0.9, 5);
    });

    it('populates pullRequests from getPullRequests (merged state + reviewStates)', async () => {
        expect.hasAssertions();

        baseMock();
        const raw: GitHubPullRequestRaw[] = [
            {
                number: 7,
                title: 'Feature',
                state: 'closed',
                html_url: 'u7',
                merged: true,
                merged_at: '2026-04-01T00:00:00Z',
                user: { login: 'bob' },
                labels: [{ name: 'enhancement' }],
                requested_reviewers: [{ login: 'carol' }],
                reviews: [{ state: 'APPROVED', user: { login: 'dave' } }],
            },
        ];
        vi.mocked(mockOptional(mockProvider.getPullRequests)).mockResolvedValue(raw);

        const result = await provider.fetchRawData({ repo: 'owner/repo' });

        expect(result.pullRequests).toHaveLength(1);

        const pr = result.pullRequests?.[0] as RawPullRequest;

        expect(pr.id).toBe(7);
        expect(pr.state).toBe('merged');
        expect(pr.author).toBe('bob');
        expect(pr.labels).toStrictEqual(['enhancement']);
        expect(pr.reviewStates).toStrictEqual(expect.arrayContaining(['APPROVED', 'requested']));
        expect(pr.confidence).toBeCloseTo(0.9, 5);
    });

    it('derives performanceMetrics from timing (NaN/Infinity omitted)', async () => {
        expect.hasAssertions();

        vi.mocked(mockProvider.getRecentPipelines).mockResolvedValue([
            makeRun(1, { created_at: '2026-01-01T10:00:00Z', run_started_at: '2026-01-01T10:00:05Z' }),
        ]);
        vi.mocked(mockProvider.getPipelineJobs).mockResolvedValue([makeJob(101)]);
        vi.mocked(mockProvider.listPipelineArtifacts).mockResolvedValue([]);
        vi.mocked(mockProvider.getWorkflowUsage).mockResolvedValue({
            run_duration_ms: 120000,
            billable: { UBUNTU: { total_ms: 60000, jobs: 2 } },
        });

        const result = await provider.fetchRawData({ repo: 'owner/repo' });

        const perf = result.performanceMetrics as PerformanceMetrics;

        expect(perf).toBeDefined();
        expect(perf.pipelineDurationMs).toBe(120000);
        expect(perf.billableMinutes).toBe(1);
        expect(perf.queueWaitMs).toBe(5000);
    });

    it('omits performanceMetrics entirely when no finite data exists', async () => {
        expect.hasAssertions();

        // Runs without created_at/run_started_at + no timing => no finite perf data.
        const runWithoutTiming = makeRun(1);
        delete runWithoutTiming.created_at;
        delete runWithoutTiming.run_started_at;
        vi.mocked(mockProvider.getRecentPipelines).mockResolvedValue([runWithoutTiming]);
        vi.mocked(mockProvider.getPipelineJobs).mockResolvedValue([makeJob(101)]);
        vi.mocked(mockProvider.listPipelineArtifacts).mockResolvedValue([]);
        vi.mocked(mockProvider.getWorkflowUsage).mockResolvedValue(null);

        const result = await provider.fetchRawData({ repo: 'owner/repo' });

        expect(result.performanceMetrics).toBeUndefined();
    });

    it('does not fabricate failure records when artifacts carry no retries/flaky/file/line', async () => {
        expect.hasAssertions();

        baseMock();
        vi.mocked(mockProvider.downloadArtifact).mockResolvedValue({
            buffer: Buffer.from(
                JSON.stringify({
                    results: {
                        tests: [{ name: 't1', status: 'passed', duration: 1 }],
                        summary: { tests: 1, passed: 1, failed: 0, skipped: 0, start: 0, stop: 1 },
                    },
                }),
            ),
            filename: 'ctrf.json',
        });

        const result = await provider.fetchRawData({ repo: 'owner/repo' });

        // No artifact-derived failure records (none carry retries/flaky/file/line),
        // and no log-based failures for a passing job.
        expect(result.failureRecords).toHaveLength(0);
    });

    it('emits reporter-prediction provenance only when framework is undefined', async () => {
        expect.hasAssertions();

        // No framework detected: listDirectory/Directory return empty → no prediction.
        vi.mocked(mockProvider.getRecentPipelines).mockResolvedValue([makeRun(1)]);
        vi.mocked(mockProvider.getPipelineJobs).mockResolvedValue([makeJob(101)]);
        vi.mocked(mockProvider.listPipelineArtifacts).mockResolvedValue([]);
        vi.mocked(mockProvider.listDirectory).mockResolvedValue([]);

        const result = await provider.fetchRawData({ repo: 'owner/repo' });

        expect(result.framework).toBeUndefined();
        expect(result.provenance?.get('reporter-prediction')).toBeUndefined();
    });
});
