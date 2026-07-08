/** GitHub e2e — exercises the real GitHub API with the token from .env.
 *  Fetches workflow runs, jobs, open PRs, issues, and branch info, then
 *  generates a consolidated health report HTML via the renderer.
 *  All tests are skipped when GITHUB_TOKEN is not set (CI-safe). */
import { dotenv } from '../shared/deps.js';
import path from 'path';
import fs from 'fs';
import GitHubManager from './github_manager.js';
import { nonNull } from '../shared/test-utils.js';
import { writeReport } from '../shared/temp-dir.js';
import { renderPipelineHealthHtml, extractErrorMessages } from './pipeline-health-renderer.js';
import type { PipelineHealthData } from './pipeline-health-renderer.js';
import type { PipelineRun, PipelineJob } from '../shared/types.js';

dotenv.config({ path: path.resolve(import.meta.dirname, '../.env') });

const GITHUB_TOKEN = process.env['GITHUB_TOKEN'];
const REPO = 'kevindemian/qa_tools';
const RUNS_TO_FETCH = 30;

describe.skipIf(!GITHUB_TOKEN)('GitHub e2e — real API', () => {
    let manager: GitHubManager;
    let runs: PipelineRun[];
    let prs: unknown[];
    let branchInfo: { name: string } | null;
    let allJobs: PipelineJob[][];
    let errorMessagesPerJob: string[][];

    beforeAll(async () => {
        manager = new GitHubManager(REPO, nonNull(GITHUB_TOKEN));

        /* Fetch data upfront */
        runs = await manager.getRecentPipelines(RUNS_TO_FETCH);
        prs = await manager.searchMergeRequests('', '', 'open');
        branchInfo = await manager.getBranch('main');

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
        it('fetches recent workflow runs with correct structure', () => {
            expect.hasAssertions();
            expect(Array.isArray(runs)).toBeTruthy();

            for (const run of runs) {
                expect(run).toHaveProperty('id');
                expect(run).toHaveProperty('status');
                expect(run).toHaveProperty('conclusion');
                expect(typeof run.id).toBe('number');
            }
        });

        it('fetches pipeline jobs for each run', () => {
            expect.hasAssertions();
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

        it('fetches open PRs with correct structure', () => {
            expect.hasAssertions();
            expect(Array.isArray(prs)).toBeTruthy();

            for (const pr of prs) {
                expect(pr).toHaveProperty('iid');
                expect(pr).toHaveProperty('title');
                expect(pr).toHaveProperty('state');
                expect(pr).toHaveProperty('web_url');
            }
        });

        it('fetches branch information for main', () => {
            if (!branchInfo) return;

            expect(branchInfo).toHaveProperty('name');
        });
    });

    describe('HTML report', () => {
        it('generates consolidated HTML health report from raw data', () => {
            const totalRuns = runs.length;
            const passedRuns = runs.filter((r) => r.conclusion === 'success').length;
            const passRate = totalRuns > 0 ? Math.round((passedRuns / totalRuns) * 100) : 0;

            const jobFailMap = new Map<string, { fail: number; total: number }>();
            for (let i = 0; i < runs.length; i++) {
                const jobs = allJobs[i] ?? [];
                for (const job of jobs) {
                    const entry = jobFailMap.get(job.name) ?? { fail: 0, total: 0 };
                    entry.total++;
                    if (job.status === 'failure') entry.fail++;
                    jobFailMap.set(job.name, entry);
                }
            }
            const topFailingJobs = [...jobFailMap.entries()]
                .map(([name, counts]) => ({
                    name,
                    failCount: counts.fail,
                    totalCount: counts.total,
                    rate: counts.total > 0 ? Math.round((counts.fail / counts.total) * 100) : 0,
                }))
                .filter((j) => j.failCount > 0)
                .sort((a, b) => b.rate - a.rate)
                .slice(0, 10);

            const branchMap = new Map<string, { pass: number; total: number }>();
            for (const r of runs) {
                const branch = r.head_branch ?? 'unknown';
                const entry = branchMap.get(branch) ?? { pass: 0, total: 0 };
                entry.total++;
                if (r.conclusion === 'success') entry.pass++;
                branchMap.set(branch, entry);
            }
            const branchBreakdown = Object.fromEntries(
                [...branchMap.entries()].map(([branch, counts]) => [
                    branch,
                    {
                        passRate: counts.total > 0 ? Math.round((counts.pass / counts.total) * 100) : 0,
                        count: counts.total,
                    },
                ]),
            );

            const allErrors = errorMessagesPerJob.flat();
            const reasonCount = new Map<string, number>();
            for (const msg of allErrors) {
                reasonCount.set(msg, (reasonCount.get(msg) ?? 0) + 1);
            }
            const failureReasons = [...reasonCount.entries()]
                .sort((a, b) => b[1] - a[1])
                .slice(0, 10)
                .map(([pattern]) => pattern);

            const from = runs[0]?.created_at?.slice(0, 10) ?? new Date().toISOString().slice(0, 10);
            const to = runs[runs.length - 1]?.created_at?.slice(0, 10) ?? new Date().toISOString().slice(0, 10);

            const healthData: PipelineHealthData = {
                totalRuns,
                passRate,
                avgDurationSec: 0,
                topFailingJobs,
                failureReasons,
                branchBreakdown,
                period: { from, to },
            };

            const html = renderPipelineHealthHtml(healthData, 'GitHub Health Report \u2014 e2e');

            const outPath = writeReport('github-health-e2e.html', html);

            expect(fs.existsSync(path.resolve(outPath))).toBeTruthy();

            expect(html).toContain('GitHub Health Report');
            expect(html).toContain(String(totalRuns));
            expect(html).toContain(String(passRate));
            expect(html).toMatch(/^<!DOCTYPE html>/);
            expect(html).toContain('</html>');

            expect(html).toContain(topFailingJobs.length > 0 ? 'Top Failing Jobs' : '');
        });

        it('includes failure reasons section', () => {
            const allErrors = errorMessagesPerJob.flat();
            const hasErrors = allErrors.length > 0;

            const healthData: PipelineHealthData = {
                totalRuns: runs.length,
                passRate: 0,
                avgDurationSec: 0,
                topFailingJobs: [],
                failureReasons: allErrors.slice(0, 10),
                branchBreakdown: {},
            };

            const html = renderPipelineHealthHtml(healthData, 'GitHub Health Report \u2014 e2e');

            expect(html).toContain(hasErrors ? 'Failure Intelligence' : 'No failure reasons captured');
        });
    });
});
