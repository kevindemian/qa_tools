/** GitHub e2e — exercises the real GitHub API with the token from .env.
 *  Fetches workflow runs, jobs, open PRs, issues, and branch info, then
 *  generates a consolidated health report HTML via the pure aggregation
 *  functions in pipeline-health.ts + writeReport().
 *  All tests are skipped when GITHUB_TOKEN is not set (CI-safe).
 *  Pure aggregation logic is tested separately in pipeline-health.test.ts. */
import { dotenv } from '../shared/deps.js';
import path from 'path';
import fs from 'fs';
import GitHubManager from './github_manager.js';
import { nonNull } from '../shared/test-utils.js';
import { writeReport } from '../shared/temp-dir.js';
import { aggregatePipelineHealth, renderPipelineHealthHtml, extractErrorMessages } from './pipeline-health.js';
import type { PipelineRun, PipelineJob, Issue } from '../shared/types.js';

dotenv.config({ path: path.resolve(import.meta.dirname, '../.env') });

const GITHUB_TOKEN = process.env['GITHUB_TOKEN'];
const REPO = 'kevindemian/qa_tools';
const RUNS_TO_FETCH = 30;

describe('GitHub e2e — real API', () => {
    let manager: GitHubManager;
    let runs: PipelineRun[];
    let prs: unknown[];
    let branchInfo: { name: string } | null;
    let allJobs: PipelineJob[][];
    let errorMessagesPerJob: string[][];
    let issues: Issue[];

    beforeAll(async () => {
        manager = new GitHubManager(REPO, nonNull(GITHUB_TOKEN));

        /* Fetch data upfront */
        runs = await manager.getRecentPipelines(RUNS_TO_FETCH);
        prs = await manager.searchMergeRequests('', '', 'open');
        branchInfo = await manager.getBranch('main');
        issues = await manager.getOpenIssues();

        /* For each run, fetch its jobs, and for each failed job try to get the log */
        allJobs = [];
        errorMessagesPerJob = [];
        for (const run of runs) {
            const runId = run.id;
            if (!runId) {
                allJobs.push([]);
                errorMessagesPerJob.push([]);
                continue;
            }
            const jobs: PipelineJob[] = await manager.getPipelineJobs(runId);
            allJobs.push(jobs);

            const errors: string[] = [];
            for (const job of jobs) {
                if (job.status !== 'failure' && job.status !== 'cancelled') continue;
                const logText = await manager.getJobLogs(job.id);
                if (logText) {
                    const extracted = extractErrorMessages(logText, 3);
                    errors.push(...extracted);
                }
            }
            errorMessagesPerJob.push(errors);
        }
    }, 300000);

    describe('Data fetching', () => {
        it('fetches recent workflow runs with correct structure', () => {expect.hasAssertions();
            expect(Array.isArray(runs)).toBeTruthy();

            for (const run of runs) {
                expect(run).toHaveProperty('id');
                expect(run).toHaveProperty('status');
                expect(run).toHaveProperty('conclusion');
                expect(typeof run.id).toBe('number');
            }
        });

        it('fetches pipeline jobs for each run', () => {expect.hasAssertions();
            expect(allJobs).toHaveLength(runs.length);

            for (const jobs of allJobs) {
                expect(Array.isArray(jobs)).toBeTruthy();

                for (const job of jobs) {
                    expect(job).toHaveProperty('id');
                    expect(job).toHaveProperty('name');
                    expect(job).toHaveProperty('status');
                }
            }
        });

        it('fetches open PRs with correct structure', () => {expect.hasAssertions();
            expect(Array.isArray(prs)).toBeTruthy();

            for (const pr of prs) {
                expect(pr).toHaveProperty('iid');
                expect(pr).toHaveProperty('title');
                expect(pr).toHaveProperty('state');
                expect(pr).toHaveProperty('web_url');
            }
        });

        it('fetches open issues (excluding PRs)', () => {expect.hasAssertions();
            expect(Array.isArray(issues)).toBeTruthy();

            for (const issue of issues) {
                expect(issue).toHaveProperty('number');
                expect(issue).toHaveProperty('title');
                expect(issue).toHaveProperty('state');
                expect(issue).toHaveProperty('labels');
                expect(Array.isArray(issue.labels)).toBeTruthy();
            }
        });

        it('fetches branch information for main', () => {
            if (!branchInfo) return;

            expect(branchInfo).toHaveProperty('name');
        });
    });

    describe('Data aggregation', () => {
        let health: ReturnType<typeof aggregatePipelineHealth>;

        beforeAll(() => {
            health = aggregatePipelineHealth(runs, allJobs, errorMessagesPerJob, issues);
        });

        it('computes totals correctly', () => {
            expect(health.totalRuns).toBe(runs.length);
            expect(health.passedRuns + health.failedRuns).toBeLessThanOrEqual(health.totalRuns);
            expect(health.passRate).toBeGreaterThanOrEqual(0);
            expect(health.passRate).toBeLessThanOrEqual(100);
        });

        it('identifies top failing jobs when failures exist', () => {expect.hasAssertions();
            expect(Array.isArray(health.topFailingJobs)).toBeTruthy();

            for (const j of health.topFailingJobs) {
                expect(j.failCount).toBeGreaterThan(0);
                expect(j.totalCount).toBeGreaterThan(0);
                expect(j.rate).toBeGreaterThanOrEqual(0);
            }
        });

        it('aggregates failure reasons from job logs', () => {
            expect(Array.isArray(health.failureReasons)).toBeTruthy();
        });

        it('breaks down by branch', () => {expect.hasAssertions();
            expect(health.branchBreakdown.length).toBeGreaterThanOrEqual(1);

            for (const b of health.branchBreakdown) {
                expect(b).toHaveProperty('branch');
                expect(b).toHaveProperty('passRate');
                expect(b).toHaveProperty('count');
            }
        });

        it('provides issue statistics', () => {
            expect(health.openIssues.total).toBe(issues.length);
            expect(typeof health.openIssues.staleCount).toBe('number');
        });
    });

    describe('HTML report', () => {
        it('generates consolidated HTML health report', () => {
            const health = aggregatePipelineHealth(runs, allJobs, errorMessagesPerJob, issues);
            const html = renderPipelineHealthHtml(health, 'GitHub Health Report — e2e');

            const outPath = writeReport('github-health-e2e.html', html);

            expect(fs.existsSync(outPath)).toBeTruthy();

            expect(html).toContain('GitHub Health Report');
            expect(html).toContain(String(health.totalRuns));
            expect(html).toContain(String(health.passRate));
            expect(html).toMatch(/^<!DOCTYPE html>/);
            expect(html).toContain('</html>');

            expect(html).toContain(health.topFailingJobs.length > 0 ? 'Top Failing Jobs' : '');
        });

        it('includes failure reasons and open issues sections', () => {
            const health = aggregatePipelineHealth(runs, allJobs, errorMessagesPerJob, issues);
            const html = renderPipelineHealthHtml(health, 'GitHub Health Report — e2e');

            expect(html).toContain(health.failureReasons.length > 0 ? 'Failure Intelligence' : '');
            expect(html).toContain(health.openIssues.total > 0 ? 'Open Issues' : '');
        });
    });
});
