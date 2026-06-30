/** Pipeline health analysis — pure aggregation, failure categorization, and HTML report generation.
 *  Testable with fixtures — no GitHub API needed for the logic layer. */
import { sanitizeHtml } from '../shared/escape.js';
import { buildHtmlPage } from '../shared/html-factory.js';
import { buildCss } from '../shared/report-styles.js';

const ERROR_KEYWORDS = ['Error', 'Failure', 'Timeout', 'Exception', 'FATAL', 'OOMKilled'];
const ERROR_LOG_PATTERN = new RegExp('(?:' + ERROR_KEYWORDS.join('|') + '):?\\s*(.+)$', 'gim');

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
        const jobs = (Reflect.get(allJobs, i) as PipelineJobExtended[] | undefined) ?? [];
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
    const byLabel = new Map<string, number>();
    let staleCount = 0;
    for (const issue of issues) {
        for (const label of issue.labels) {
            byLabel.set(label, (byLabel.get(label) ?? 0) + 1);
        }
        if (new Date(issue.updated_at) < staleThreshold) staleCount++;
    }
    return { total: issues.length, byLabel: Object.fromEntries(byLabel), staleCount };
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

const _PIPELINE_CSS = `
.summary{display:flex;gap:1rem;margin:1rem 0;flex-wrap:wrap}
.card{background:var(--color-surface-card);border:1px solid var(--color-border-default);border-radius:8px;padding:.75rem 1rem;flex:1;min-width:120px}
.card .num{font-size:1.5rem;font-weight:700}
.card .lbl{font-size:.75rem;color:var(--color-text-muted)}
.ts{font-size:.8rem;color:var(--color-text-muted);margin-bottom:1.5rem}
.failure-bar{font-family:monospace;font-size:0.8rem;color:var(--color-text-muted);white-space:nowrap}
.error-msg{font-family:monospace;font-size:0.8rem}
`;

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
                `<td><span style="color:var(--color-error)">${j.rate}%</span></td>` +
                `<td><span class="failure-bar">${_bar(j.rate)}</span></td></tr>`,
        )
        .join('\n');
    return `<table><tr><th>Job</th><th>Failed</th><th>Total</th><th>Rate</th><th></th></tr>${rows}</table>`;
}

function _renderReasonsSection(health: PipelineHealth): string {
    if (health.failureReasons.length === 0) return '<p>No failure reasons captured</p>';
    const rows = health.failureReasons
        .map((r) => `<tr><td>${r.count}x</td><td><span class="error-msg">${sanitizeHtml(r.message)}</span></td></tr>`)
        .join('\n');
    return `<table><tr><th>Count</th><th>Error Message</th></tr>${rows}</table>`;
}

function _renderCategoriesSection(health: PipelineHealth): string {
    const catKeys = Object.keys(health.failureByCategory);
    if (catKeys.length === 0) return '<p>No categorized failures</p>';
    const catColors: Record<string, string> = {
        infrastructure: 'var(--color-error)',
        code: 'var(--color-warn)',
        flaky: 'var(--color-info)',
        unknown: 'var(--color-text-muted)',
    };
    const catEmoji = new Map([
        ['infrastructure', '🏗️'],
        ['code', '🧪'],
        ['flaky', '🔄'],
        ['unknown', '❓'],
    ]);
    const catColorEntries = Object.entries(catColors);
    let html = '<div style="display:flex;flex-wrap:wrap;gap:0.75rem">';
    for (const key of catKeys) {
        const emoji = catEmoji.get(key) ?? '📋';
        const colorEntry = catColorEntries.find(([k]) => k === key);
        const color = colorEntry?.[1] ?? 'var(--color-text-primary)';
        const failureEntries = Object.entries(health.failureByCategory);
        const failEntry = failureEntries.find(([k]) => k === key);
        const failCount = failEntry?.[1] ?? 0;
        html +=
            `<div style="flex:1;min-width:140px;background:var(--color-surface-card);border:1px solid var(--color-border-default);border-radius:8px;padding:0.75rem">` +
            `<div style="font-size:1.2rem">${emoji} <strong>${key}</strong></div>` +
            `<div style="font-size:1.5rem;font-weight:700;color:${color}">${failCount}</div></div>`;
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
                `<td><span style="color:${b.passRate >= 80 ? 'var(--color-success)' : 'var(--color-error)'}">${b.passRate}%</span></td></tr>`,
        )
        .join('\n');
    return `<table><tr><th>Branch</th><th>Runs</th><th>Pass Rate</th></tr>${rows}</table>`;
}

function _renderIssuesSection(health: PipelineHealth): string {
    const issues = health.openIssues;
    let html = `<p><strong>${issues.total}</strong> open, <strong>${issues.staleCount}</strong> stale (30d+ sem atividade)</p>`;
    if (Object.keys(issues.byLabel).length > 0) {
        const rows = Object.entries(issues.byLabel)
            .sort((a, b) => b[1] - a[1])
            .map(([label, count]) => `<tr><td>${sanitizeHtml(label)}</td><td>${count}</td></tr>`)
            .join('\n');
        html += `<table><tr><th>Label</th><th>Count</th></tr>${rows}</table>`;
    }
    return html;
}

/** Render a complete HTML report from a PipelineHealth object.
 *  Pure function — no I/O, no side effects. */
export function renderPipelineHealthHtml(health: PipelineHealth, title = 'Pipeline Health Report'): string {
    const ts = new Date().toISOString();
    const passRateColor = health.passRate >= 80 ? 'var(--color-success)' : 'var(--color-error)';
    const bodyContent = `<h1>${sanitizeHtml(title)}</h1>
<div class="ts">${ts} &mdash; ${health.period.from} to ${health.period.to}</div>
<div class="summary">
  <div class="card"><div class="num" style="color:var(--color-info)">${health.totalRuns}</div><div class="lbl">Total Runs</div></div>
  <div class="card"><div class="num" style="color:var(--color-success)">${health.passedRuns}</div><div class="lbl">Passed</div></div>
  <div class="card"><div class="num" style="color:var(--color-error)">${health.failedRuns}</div><div class="lbl">Failed</div></div>
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
    return buildHtmlPage({
        title,
        styles: buildCss() + _PIPELINE_CSS,
        theme: 'system',
        bodyContent,
        footer: 'Generated by QA Tools — Pipeline Health Dashboard',
    });
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const SECONDS_PER_HOUR = 3600;

function formatDuration(sec: number): string {
    if (sec < 60) return sec + 's';
    if (sec < SECONDS_PER_HOUR) return Math.floor(sec / 60) + 'm ' + (sec % 60) + 's';
    return Math.floor(sec / SECONDS_PER_HOUR) + 'h ' + Math.floor((sec % SECONDS_PER_HOUR) / 60) + 'm';
}
