/** Pipeline health analysis — pure aggregation, failure categorization, and HTML report generation.
 *  Testable with fixtures — no GitHub API needed for the logic layer. */
import { sanitizeHtml } from '../shared/escape';
import { buildHtmlPage } from '../shared/html-factory';
import { loadMetrics } from '../shared/metrics';
import { generateGitMetricsRuns } from '../shared/git-metrics-adapter';
import type { MetricsRun } from '../shared/metrics';

const ERROR_LOG_PATTERN = /(?:Error|Failure|Timeout|Exception|FATAL|OOMKilled):?\s*(.+)$/gim;

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface PipelineHealth {
    period: { from: string; to: string };
    totalRuns: number;
    passedRuns: number;
    failedRuns: number;
    passRate: number;
    avgDurationSec: number;
    topFailingJobs: Array<{ name: string; failCount: number; totalCount: number; rate: number }>;
    failureReasons: Array<{ message: string; count: number }>;
    failureByCategory: Record<string, number>;
    branchBreakdown: Array<{ branch: string; passRate: number; count: number }>;
    openIssues: { total: number; byLabel: Record<string, number>; staleCount: number };
}

export interface PipelineJobExtended {
    id: string | number;
    name: string;
    status: string;
}

export interface PipelineRunExtended {
    id?: string | number;
    status?: string;
    conclusion?: string;
    head_branch?: string;
    created_at?: string;
    run_started_at?: string;
    updated_at?: string;
    event?: string;
}

/* ------------------------------------------------------------------ */
/*  Git metrics fallback (quality-gate pattern)                        */
/* ------------------------------------------------------------------ */

/** Load MetricsRun[] from the metrics store with git-based fallback.
 *  If no project runs exist in the store, generates fallback runs from
 *  git commit history via `generateGitMetricsRuns()`. Follows the same
 *  pattern as quality-gate.ts. */
export function loadMetricsWithGitFallback(projectName?: string): MetricsRun[] {
    const store = loadMetrics();
    const projectRuns = projectName ? store.runs.filter((r) => r.project === projectName) : store.runs;
    if (projectRuns.length === 0) {
        const gitRuns = generateGitMetricsRuns({ projectName: projectName ?? 'git' });
        if (gitRuns.length > 0) return gitRuns;
    }
    return projectRuns;
}

/* ------------------------------------------------------------------ */
/*  Error extraction from raw log text                                 */
/* ------------------------------------------------------------------ */

/** Extract unique error messages from raw job log text, limited to maxEntries.
 *  Looks for lines containing Error, Failure, Timeout, Exception, FATAL, OOMKilled. */
export function extractErrorMessages(logText: string, maxEntries = 5): string[] {
    const seen = new Set<string>();
    const results: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = ERROR_LOG_PATTERN.exec(logText)) !== null && results.length < maxEntries) {
        const msg = (match[1] ?? '').trim();
        if (msg && !seen.has(msg)) {
            seen.add(msg);
            results.push(msg);
        }
    }
    return results;
}

/* ------------------------------------------------------------------ */
/*  Aggregation helpers                                                */
/* ------------------------------------------------------------------ */

function _calcPassRate(
    runs: PipelineRunExtended[],
    now: Date,
): { totalRuns: number; passedRuns: number; failedRuns: number; passRate: number; from: string; to: string } {
    const totalRuns = runs.length;
    const passedRuns = runs.filter((r) => r.conclusion === 'success').length;
    const failedRuns = runs.filter((r) => r.conclusion === 'failure').length;
    const passRate = totalRuns > 0 ? Math.round((passedRuns / totalRuns) * 100) : 0;
    const firstRun = runs[0];
    const lastRun = runs[runs.length - 1];
    const from = firstRun?.created_at ?? now.toISOString();
    const to = lastRun?.created_at ?? now.toISOString();
    return { totalRuns, passedRuns, failedRuns, passRate, from, to };
}

function _calcAvgDuration(runs: PipelineRunExtended[]): number {
    const durations = runs
        .map((r) => {
            if (!r.run_started_at || !r.updated_at) return undefined;
            const start = new Date(r.run_started_at).getTime();
            const end = new Date(r.updated_at).getTime();
            return isNaN(start) || isNaN(end) || end <= start ? undefined : (end - start) / 1000;
        })
        .filter((d): d is number => d !== undefined);
    return durations.length > 0 ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0;
}

function _calcTopFailingJobs(
    runs: PipelineRunExtended[],
    allJobs: PipelineJobExtended[][],
): Array<{ name: string; failCount: number; totalCount: number; rate: number }> {
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
    return [...jobFailMap.entries()]
        .map(([name, counts]) => ({
            name,
            failCount: counts.fail,
            totalCount: counts.total,
            rate: counts.total > 0 ? Math.round((counts.fail / counts.total) * 100) : 0,
        }))
        .filter((j) => j.failCount > 0)
        .sort((a, b) => b.rate - a.rate)
        .slice(0, 10);
}

function _calcFailureReasons(errorMessagesPerJob: string[][]): Array<{ message: string; count: number }> {
    const reasonCount = new Map<string, number>();
    for (const errs of errorMessagesPerJob) {
        for (const msg of errs) {
            reasonCount.set(msg, (reasonCount.get(msg) ?? 0) + 1);
        }
    }
    return [...reasonCount.entries()]
        .map(([message, count]) => ({ message, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);
}

function _calcBranchBreakdown(runs: PipelineRunExtended[]): Array<{ branch: string; passRate: number; count: number }> {
    const branchMap = new Map<string, { pass: number; total: number }>();
    for (const r of runs) {
        const branch = r.head_branch ?? 'unknown';
        const entry = branchMap.get(branch) ?? { pass: 0, total: 0 };
        entry.total++;
        if (r.conclusion === 'success') entry.pass++;
        branchMap.set(branch, entry);
    }
    return [...branchMap.entries()]
        .map(([branch, counts]) => ({
            branch,
            passRate: counts.total > 0 ? Math.round((counts.pass / counts.total) * 100) : 0,
            count: counts.total,
        }))
        .sort((a, b) => b.count - a.count);
}

function _calcOpenIssues(
    issues: Array<{ labels: string[]; updated_at: string; created_at: string }>,
    now: Date,
): { total: number; byLabel: Record<string, number>; staleCount: number } {
    const staleThreshold = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const byLabel: Record<string, number> = {};
    let staleCount = 0;
    for (const issue of issues) {
        for (const label of issue.labels) {
            byLabel[label] = (byLabel[label] ?? 0) + 1;
        }
        if (new Date(issue.updated_at) < staleThreshold) staleCount++;
    }
    return { total: issues.length, byLabel, staleCount };
}

/* ------------------------------------------------------------------ */
/*  Aggregation                                                        */
/* ------------------------------------------------------------------ */

/** Aggregate raw pipeline data into a PipelineHealth summary.
 *  Pure function — no I/O, no side effects. */
export function aggregatePipelineHealth(
    runs: PipelineRunExtended[],
    allJobs: PipelineJobExtended[][],
    errorMessagesPerJob: string[][],
    issues: Array<{ labels: string[]; updated_at: string; created_at: string }>,
    now = new Date(),
): PipelineHealth {
    const { totalRuns, passedRuns, failedRuns, passRate, from, to } = _calcPassRate(runs, now);
    const avgDurationSec = _calcAvgDuration(runs);
    const topFailingJobs = _calcTopFailingJobs(runs, allJobs);
    const failureReasons = _calcFailureReasons(errorMessagesPerJob);
    const branchBreakdown = _calcBranchBreakdown(runs);
    const openIssues = _calcOpenIssues(issues, now);

    return {
        period: { from: from.slice(0, 10), to: to.slice(0, 10) },
        totalRuns,
        passedRuns,
        failedRuns,
        passRate,
        avgDurationSec,
        topFailingJobs,
        failureReasons,
        failureByCategory: {},
        branchBreakdown,
        openIssues,
    };
}

/* ------------------------------------------------------------------ */
/* ------------------------------------------------------------------ */
/*  HTML report renderer                                               */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/*  HTML report sub‑helpers                                            */
/* ------------------------------------------------------------------ */

const _STATUS_COLOR = (s: string): string => {
    if (s === 'success' || s === 'completed') return 'green';
    if (s === 'failure' || s === 'failed') return 'red';
    if (s === 'cancelled' || s === 'canceled') return 'gray';
    return 'orange';
};

const _bar = (rate: number, maxWidth = 12): string => {
    const filled = Math.round((rate / 100) * maxWidth);
    return '█'.repeat(filled) + '░'.repeat(maxWidth - filled);
};

function _renderJobsSection(health: PipelineHealth): string {
    if (health.topFailingJobs.length === 0) return '<p>No failing jobs</p>';
    const rows = health.topFailingJobs
        .map(
            (j) =>
                `<tr><td><strong>${sanitizeHtml(j.name)}</strong></td><td>${j.failCount}</td><td>${j.totalCount}</td>` +
                `<td><span style="color:${_STATUS_COLOR('failure')}">${j.rate}%</span></td>` +
                `<td style="font-family:monospace;font-size:0.8rem;color:#6b7280">${_bar(j.rate)}</td></tr>`,
        )
        .join('\n');
    return (
        '<table border="1" cellpadding="6" style="border-collapse:collapse;width:100%"><tr style="background:#f3f4f6"><th>Job</th><th>Failed</th><th>Total</th><th>Rate</th><th></th></tr>' +
        rows +
        '</table>'
    );
}

function _renderReasonsSection(health: PipelineHealth): string {
    if (health.failureReasons.length === 0) return '<p>No failure reasons captured</p>';
    const rows = health.failureReasons
        .map(
            (r) =>
                `<tr><td>${r.count}x</td><td style="font-family:monospace;font-size:0.8rem">${sanitizeHtml(r.message)}</td></tr>`,
        )
        .join('\n');
    return (
        '<table border="1" cellpadding="6" style="border-collapse:collapse;width:100%"><tr style="background:#f3f4f6"><th>Count</th><th>Error Message</th></tr>' +
        rows +
        '</table>'
    );
}

function _renderCategoriesSection(health: PipelineHealth): string {
    const catKeys = Object.keys(health.failureByCategory);
    if (catKeys.length === 0) return '<p>No categorized failures</p>';
    const catColors: Record<string, string> = {
        infrastructure: '#ef4444',
        code: '#f59e0b',
        flaky: '#8b5cf6',
        unknown: '#9ca3af',
    };
    const catEmoji: Record<string, string> = { infrastructure: '🏗️', code: '🧪', flaky: '🔄', unknown: '❓' };
    let html = '<div style="display:flex;flex-wrap:wrap;gap:0.75rem">';
    for (const key of catKeys) {
        html +=
            `<div style="flex:1;min-width:140px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:0.75rem">` +
            `<div style="font-size:1.2rem">${catEmoji[key] ?? '📋'} <strong>${key}</strong></div>` +
            `<div style="font-size:1.5rem;font-weight:700;color:${catColors[key] ?? '#1f2937'}">${health.failureByCategory[key]}</div></div>`;
    }
    html += '</div>';
    return html;
}

function _renderBranchSection(health: PipelineHealth): string {
    if (health.branchBreakdown.length === 0) return '';
    const rows = health.branchBreakdown
        .map(
            (b) =>
                `<tr><td><strong>${sanitizeHtml(b.branch)}</strong></td><td>${b.count}</td>` +
                `<td><span style="color:${_STATUS_COLOR(b.passRate >= 80 ? 'success' : 'failure')}">${b.passRate}%</span></td></tr>`,
        )
        .join('\n');
    return (
        '<table border="1" cellpadding="6" style="border-collapse:collapse;width:100%;margin-top:0.5rem"><tr style="background:#f3f4f6"><th>Branch</th><th>Runs</th><th>Pass Rate</th></tr>' +
        rows +
        '</table>'
    );
}

function _renderIssuesSection(health: PipelineHealth): string {
    const issues = health.openIssues;
    let html = `<p><strong>${issues.total}</strong> open, <strong>${issues.staleCount}</strong> stale (30d+ sem atividade)</p>`;
    if (Object.keys(issues.byLabel).length > 0) {
        const rows = Object.entries(issues.byLabel)
            .sort((a, b) => b[1] - a[1])
            .map(([label, count]) => `<tr><td>${sanitizeHtml(label)}</td><td>${count}</td></tr>`)
            .join('\n');
        html +=
            '<table border="1" cellpadding="6" style="border-collapse:collapse;width:auto"><tr style="background:#f3f4f6"><th>Label</th><th>Count</th></tr>' +
            rows +
            '</table>';
    }
    return html;
}

const _REPORT_CSS = `body{font-family:system-ui,sans-serif;margin:2rem;color:#1f2937}
h1{font-size:1.5rem;margin-bottom:.25rem}
.ts{font-size:.8rem;color:#6b7280;margin-bottom:1.5rem}
h2{font-size:1.2rem;margin:1.5rem 0 .5rem}
table{font-size:.85rem}
th{text-align:left;font-weight:600}
td{vertical-align:top}
.summary{display:flex;gap:1rem;margin:1rem 0;flex-wrap:wrap}
.card{background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:.75rem 1rem;flex:1;min-width:120px}
.card .num{font-size:1.5rem;font-weight:700}
.card .lbl{font-size:.75rem;color:#6b7280}`;

/** Render a complete HTML report from a PipelineHealth object.
 *  Pure function — no I/O, no side effects. */
export function renderPipelineHealthHtml(health: PipelineHealth, title = 'Pipeline Health Report'): string {
    const ts = new Date().toISOString();
    const passRateColor = health.passRate >= 80 ? '#16a34a' : '#dc2626';
    const bodyContent = `<h1>${sanitizeHtml(title)}</h1>
<div class="ts">${ts} &mdash; ${health.period.from} to ${health.period.to}</div>
<div class="summary">
  <div class="card"><div class="num" style="color:#2563eb">${health.totalRuns}</div><div class="lbl">Total Runs</div></div>
  <div class="card"><div class="num" style="color:#16a34a">${health.passedRuns}</div><div class="lbl">Passed</div></div>
  <div class="card"><div class="num" style="color:#dc2626">${health.failedRuns}</div><div class="lbl">Failed</div></div>
  <div class="card"><div class="num" style="color:${passRateColor}">${health.passRate}%</div><div class="lbl">Pass Rate</div></div>
  <div class="card"><div class="num">${formatDuration(health.avgDurationSec)}</div><div class="lbl">Avg Duration</div></div>
</div>
<h2>🔥 Top Failing Jobs</h2>
${_renderJobsSection(health)}
<h2>🧠 Failure Intelligence</h2>
${_renderCategoriesSection(health)}
${_renderReasonsSection(health)}
<h2>🔀 Branch Breakdown</h2>
${_renderBranchSection(health)}
<h2>🎯 Open Issues</h2>
${_renderIssuesSection(health)}`;
    return buildHtmlPage({ title, styles: _REPORT_CSS, bodyContent });
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatDuration(sec: number): string {
    if (sec < 60) return sec + 's';
    if (sec < 3600) return Math.floor(sec / 60) + 'm ' + (sec % 60) + 's';
    return Math.floor(sec / 3600) + 'h ' + Math.floor((sec % 3600) / 60) + 'm';
}
