/** Pipeline health HTML renderer — accepts pre-computed metrics from DataHub.
 *  Pure rendering logic — no I/O, no side effects. */
import { sanitizeHtml } from '../shared/escape.js';
import { buildHtmlPage } from '../shared/html-factory.js';
import { buildCss } from '../shared/report-styles.js';

const ERROR_KEYWORDS = ['Error', 'Failure', 'Timeout', 'Exception', 'FATAL', 'OOMKilled'];
const ERROR_LOG_PATTERN = new RegExp('(?:' + ERROR_KEYWORDS.join('|') + '):?\\s*(.+)$', 'gim');

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

/** Pre-computed pipeline health data for rendering.
 *  Data comes from DataHub computed metrics. */
export interface PipelineHealthData {
    totalRuns: number;
    passRate: number;
    avgDurationSec: number;
    topFailingJobs: Array<{ name: string; failCount: number; totalCount: number; rate: number }>;
    failureReasons: string[];
    branchBreakdown: Record<string, { passRate: number; count: number }>;
    period?: { from: string; to: string };
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
/*  CSS                                                                */
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

/* ------------------------------------------------------------------ */
/*  HTML sub-helpers                                                    */
/* ------------------------------------------------------------------ */

/** Render a bar chart for a rate (0-100). */
const _bar = (rate: number, maxWidth = 12): string => {
    const filled = Math.round((rate / 100) * maxWidth);
    return '█'.repeat(filled) + '░'.repeat(maxWidth - filled);
};

function _renderJobsSection(data: PipelineHealthData): string {
    if (data.topFailingJobs.length === 0) return '<p>No failing jobs</p>';
    const rows = data.topFailingJobs
        .map(
            (j) =>
                `<tr><td><strong>${sanitizeHtml(j.name)}</strong></td><td>${j.failCount}</td><td>${j.totalCount}</td>` +
                `<td><span style="color:var(--color-error)">${j.rate}%</span></td>` +
                `<td><span class="failure-bar">${_bar(j.rate)}</span></td></tr>`,
        )
        .join('\n');
    return `<table><tr><th>Job</th><th>Failed</th><th>Total</th><th>Rate</th><th></th></tr>${rows}</table>`;
}

function _renderReasonsSection(data: PipelineHealthData): string {
    if (data.failureReasons.length === 0) return '<p>No failure reasons captured</p>';
    const rows = data.failureReasons
        .map((r) => `<tr><td><span class="error-msg">${sanitizeHtml(r)}</span></td></tr>`)
        .join('\n');
    return `<table><tr><th>Error Message</th></tr>${rows}</table>`;
}

function _renderBranchSection(data: PipelineHealthData): string {
    const branchEntries = Object.entries(data.branchBreakdown);
    if (branchEntries.length === 0) return '';
    const rows = branchEntries
        .map(
            ([branch, info]) =>
                `<tr><td><strong>${sanitizeHtml(branch)}</strong></td><td>${info.count}</td>` +
                `<td><span style="color:${info.passRate >= 80 ? 'var(--color-success)' : 'var(--color-error)'}">${info.passRate}%</span></td></tr>`,
        )
        .join('\n');
    return `<table><tr><th>Branch</th><th>Runs</th><th>Pass Rate</th></tr>${rows}</table>`;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const SECONDS_PER_HOUR = 3600;

/** Format seconds into a human-readable duration string. */
export function formatDuration(sec: number): string {
    if (sec < 60) return sec + 's';
    if (sec < SECONDS_PER_HOUR) return Math.floor(sec / 60) + 'm ' + (sec % 60) + 's';
    return Math.floor(sec / SECONDS_PER_HOUR) + 'h ' + Math.floor((sec % SECONDS_PER_HOUR) / 60) + 'm';
}

/* ------------------------------------------------------------------ */
/*  Main renderer                                                      */
/* ------------------------------------------------------------------ */

/** Render a complete HTML report from a PipelineHealthData object.
 *  Pure function — no I/O, no side effects. */
export function renderPipelineHealthHtml(data: PipelineHealthData, title = 'Pipeline Health Report'): string {
    const ts = new Date().toISOString();
    const passRateColor = data.passRate >= 80 ? 'var(--color-success)' : 'var(--color-error)';
    const periodLabel = data.period ? `${data.period.from} to ${data.period.to}` : 'N/A';
    const passedCount = data.totalRuns > 0 ? Math.round((data.totalRuns * data.passRate) / 100) : 0;
    const failedCount = data.totalRuns - passedCount;
    const bodyContent = `<h1>${sanitizeHtml(title)}</h1>
<div class="ts">${ts} &mdash; ${periodLabel}</div>
<div class="summary">
  <div class="card"><div class="num" style="color:var(--color-info)">${data.totalRuns}</div><div class="lbl">Total Runs</div></div>
  <div class="card"><div class="num" style="color:var(--color-success)">${passedCount}</div><div class="lbl">Passed</div></div>
  <div class="card"><div class="num" style="color:var(--color-error)">${failedCount}</div><div class="lbl">Failed</div></div>
  <div class="card"><div class="num" style="color:${passRateColor}">${data.passRate}%</div><div class="lbl">Pass Rate</div></div>
  <div class="card"><div class="num">${formatDuration(data.avgDurationSec)}</div><div class="lbl">Avg Duration</div></div>
</div>
<h2>\uD83D\uDD25 Top Failing Jobs</h2>
${_renderJobsSection(data)}
<h2>\uD83E\uDDE0 Failure Intelligence</h2>
${_renderReasonsSection(data)}
<h2>\uD83D\uDD00 Branch Breakdown</h2>
${_renderBranchSection(data)}`;
    return buildHtmlPage({
        title,
        styles: buildCss() + _PIPELINE_CSS,
        theme: 'system',
        bodyContent,
        footer: 'Generated by QA Tools \u2014 Pipeline Health Dashboard',
    });
}
